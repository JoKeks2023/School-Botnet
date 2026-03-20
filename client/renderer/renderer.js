/**
 * renderer.js – Renderer process for the Cluster Client.
 *
 * Handles:
 *  - Switching between headless (btop-style) and display (Canvas) views
 *  - Drawing visual presets via preset visualCode functions
 *  - Updating the overlay with live CPU/RAM/GPU stats
 *  - Responding to mode changes and overlay toggle events
 */

/* globals clusterAPI */

'use strict';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let config       = {};
let currentPreset = null;
let currentParams = null;
let drawFn        = null;
let animFrameId   = null;

// Canvas
const canvas   = document.getElementById('visualCanvas');
const ctx      = canvas.getContext('2d');

// UI elements
const headlessView    = document.getElementById('headlessView');
const btopText        = document.getElementById('btopText');
const displayOverlay  = document.getElementById('displayOverlay');
const overlayContent  = document.getElementById('overlayContent');
const idleMsg         = document.getElementById('idleMsg');

// ---------------------------------------------------------------------------
// Resize canvas to fill window
// ---------------------------------------------------------------------------
function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  if (currentParams) {
    currentParams.width  = canvas.width;
    currentParams.height = canvas.height;
  }
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ---------------------------------------------------------------------------
// Mode switching
// ---------------------------------------------------------------------------
function applyMode(mode) {
  if (mode === 'display') {
    canvas.style.display       = 'block';
    headlessView.style.display = 'none';
    displayOverlay.style.display = config.overlayVisible !== false ? 'block' : 'none';
  } else {
    canvas.style.display       = 'none';
    headlessView.style.display = 'flex';
    displayOverlay.style.display = 'none';
  }
}

// ---------------------------------------------------------------------------
// Overlay update
// ---------------------------------------------------------------------------
function updateOverlay(stats) {
  const lines = [
    `Node: ${stats.node_id || '—'}   Mode: ${stats.mode || '—'}`,
    `CPU:  ${stats.cpu_usage || 0}%   RAM: ${stats.ram_usage || 0} GB   GPU: ${stats.gpu_usage || 0}%`,
    `Jobs: ${stats.current_job ? 1 : 0}   Preset: ${stats.preset || '—'}`,
  ];

  // Display-mode overlay
  overlayContent.textContent = lines.join('\n');

  // Headless btop-style view
  const bar = (val, max = 100, len = 20) => {
    const filled = Math.round((val / max) * len);
    return '[' + '█'.repeat(filled) + '░'.repeat(len - filled) + `] ${val}%`;
  };

  btopText.textContent = [
    `╔══════════════════════════════════════╗`,
    `║  ${(stats.node_id || 'Node').padEnd(10)} [${(stats.mode || 'headless').toUpperCase().padEnd(8)}]       ║`,
    `╠══════════════════════════════════════╣`,
    `║  CPU  ${bar(stats.cpu_usage || 0).padEnd(32)}║`,
    `║  RAM  ${bar(Math.round((stats.ram_usage || 0) / 8 * 100), 100).padEnd(32)}║`,
    `║  GPU  ${bar(stats.gpu_usage || 0).padEnd(32)}║`,
    `╠══════════════════════════════════════╣`,
    `║  Job:    ${(stats.current_job || 'idle').slice(0, 28).padEnd(28)}  ║`,
    `║  Preset: ${(stats.preset     || '—').slice(0, 28).padEnd(28)}  ║`,
    `╚══════════════════════════════════════╝`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Visual rendering loop
// ---------------------------------------------------------------------------
function startRenderLoop(presetName, params, initialFrame) {
  if (animFrameId) cancelAnimationFrame(animFrameId);
  currentPreset = presetName;
  currentParams = Object.assign({}, params, {
    width:  canvas.width,
    height: canvas.height,
  });
  idleMsg.style.display = 'none';

  // Latest frame data from worker
  let latestFrame = initialFrame;

  // Listen for subsequent frames
  clusterAPI.removeAllListeners('job:frame');
  clusterAPI.on('job:frame', ({ presetName: pName, params: p, frame }) => {
    if (pName === currentPreset) latestFrame = frame;
  });

  function render() {
    if (!drawFn || !latestFrame) {
      animFrameId = requestAnimationFrame(render);
      return;
    }
    try {
      drawFn(ctx, latestFrame, currentParams);
      // Periodically send preview snapshot to server (every ~60 frames)
      if (Math.random() < 0.017) {
        const preview = canvas.toDataURL('image/jpeg', 0.3);
        clusterAPI.send('renderer:preview', preview);
      }
    } catch (e) {
      console.error('[Render] draw error:', e);
    }
    animFrameId = requestAnimationFrame(render);
  }

  animFrameId = requestAnimationFrame(render);
}

function stopRenderLoop() {
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
  currentPreset = null;
  drawFn = null;
  idleMsg.style.display = 'block';
}

/**
 * Compile and set the draw function from a preset's visualCode string.
 * @param {string} name        Preset name (used to determine function name).
 * @param {string} visualCode  The code block defining the draw function.
 */
function setDrawFn(name, visualCode) {
  if (!visualCode) { drawFn = null; return; }
  try {
    /* eslint-disable no-new-func */
    const fn = new Function(`${visualCode}\nreturn draw${name};`);
    drawFn = fn();
    /* eslint-enable no-new-func */
  } catch (e) {
    console.error('[Renderer] Failed to compile visualCode for', name, e);
    drawFn = null;
  }
}

// ---------------------------------------------------------------------------
// IPC event handlers
// ---------------------------------------------------------------------------
clusterAPI.on('init:config', (cfg) => {
  config = cfg;
  applyMode(cfg.mode);
  clusterAPI.send('renderer:ready');
});

clusterAPI.on('mode:changed', (mode) => {
  config.mode = mode;
  applyMode(mode);
});

clusterAPI.on('overlay:toggle', (visible) => {
  config.overlayVisible = visible;
  if (config.mode === 'display') {
    displayOverlay.style.display = visible ? 'block' : 'none';
  }
});

clusterAPI.on('stats:update', (stats) => {
  updateOverlay(stats);
});

clusterAPI.on('job:result', ({ presetName, params, result }) => {
  if (config.mode !== 'display') return;
  // One-shot result (e.g. Mandelbrot)
  setDrawFn(presetName, window.__presetVisualCode && window.__presetVisualCode[presetName]);
  if (drawFn) {
    currentParams = Object.assign({}, params, { width: canvas.width, height: canvas.height });
    drawFn(ctx, result, currentParams);
  }
});

clusterAPI.on('job:frame', ({ presetName, params, frame }) => {
  if (config.mode !== 'display') return;
  // First frame – start render loop
  if (currentPreset !== presetName) {
    const visualCode = window.__presetVisualCode && window.__presetVisualCode[presetName];
    setDrawFn(presetName, visualCode);
    startRenderLoop(presetName, params, frame);
  }
  // Subsequent frames are picked up inside the render loop listener
});

clusterAPI.on('job:stopped', () => {
  stopRenderLoop();
});

clusterAPI.on('presets:list', (presets) => {
  // Cache visual code strings for use in rendering
  window.__presetVisualCode = window.__presetVisualCode || {};
  for (const p of presets) {
    if (p.visualCode) window.__presetVisualCode[p.name] = p.visualCode;
  }
});
