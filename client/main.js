/**
 * main.js – Electron main process for the Classroom Cluster Client.
 *
 * Responsibilities:
 *  - Connect to the cluster server via Socket.IO (WebSocket)
 *  - Register the node with a configurable ID and mode
 *  - Dispatch compute jobs to Worker Threads
 *  - Render visuals and overlay in the BrowserWindow (Display mode)
 *  - Show a minimal overlay window (Headless mode)
 *  - Send periodic status updates (CPU, RAM, GPU) to the server
 *  - Support runtime mode switching and overlay toggle via hotkeys
 *
 * Configuration is read from environment variables or a local config.json:
 *   SERVER_URL  – WebSocket server URL, default http://localhost:3000
 *   NODE_ID     – Node identifier, default 'Node-<hostname>'
 *   NODE_MODE   – 'headless' | 'display', default 'headless'
 *   CPU_LIMIT   – max CPU usage % (informational), default 20
 *
 * Usage (development):
 *   npm install
 *   SERVER_URL=http://raspberrypi.local:3000 NODE_ID=Node01 npm start
 *
 * Build portable EXE:
 *   npm run build:win
 */

'use strict';

const path   = require('path');
const os     = require('os');
const { app, BrowserWindow, ipcMain, globalShortcut, screen } = require('electron');
const { Worker } = require('worker_threads');
const { io }     = require('socket.io-client');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
let config = {
  serverUrl: process.env.SERVER_URL || 'http://localhost:3000',
  nodeId:    process.env.NODE_ID    || `Node-${os.hostname().slice(0, 8)}`,
  mode:      process.env.NODE_MODE  || 'headless',
  cpuLimit:  Number(process.env.CPU_LIMIT) || 20,
  overlayVisible: true,
};

// Allow config.json override (useful for USB deployment)
try {
  const cfgPath = path.join(__dirname, 'config.json');
  const file    = require(cfgPath);
  Object.assign(config, file);
} catch (_) { /* no config.json – use defaults */ }

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let mainWindow   = null;
let overlayWindow = null;
let socket       = null;

/** @type {Map<string, Worker>} jobId → Worker */
const activeWorkers = new Map();

/** Last known resource stats */
const stats = { cpu: 0, ram: 0, gpu: 0 };

// ---------------------------------------------------------------------------
// Resource monitoring (approximation using os module)
// ---------------------------------------------------------------------------
let prevCpuTimes = null;

function getCpuUsage() {
  const cpus = os.cpus();
  let totalIdle = 0, totalTick = 0;
  for (const cpu of cpus) {
    for (const type of Object.keys(cpu.times)) totalTick += cpu.times[type];
    totalIdle += cpu.times.idle;
  }
  if (!prevCpuTimes) {
    prevCpuTimes = { idle: totalIdle, total: totalTick };
    return 0;
  }
  const idleDiff  = totalIdle - prevCpuTimes.idle;
  const totalDiff = totalTick - prevCpuTimes.total;
  prevCpuTimes = { idle: totalIdle, total: totalTick };
  return totalDiff === 0 ? 0 : Math.round((1 - idleDiff / totalDiff) * 100);
}

function getRamGb() {
  const used = os.totalmem() - os.freemem();
  return Math.round((used / 1024 / 1024 / 1024) * 10) / 10;
}

function collectStats() {
  stats.cpu = getCpuUsage();
  stats.ram = getRamGb();
  // GPU usage not available natively; placeholder 0
  stats.gpu = 0;
}

// ---------------------------------------------------------------------------
// Socket.IO connection
// ---------------------------------------------------------------------------
function connectToServer() {
  socket = io(config.serverUrl, {
    query: { type: 'node' },
    reconnectionDelayMax: 10000,
  });

  socket.on('connect', () => {
    console.log(`[Socket] Connected to ${config.serverUrl}`);
    socket.emit('node:register', {
      node_id: config.nodeId,
      mode:    config.mode,
    });
  });

  socket.on('disconnect', () => {
    console.log('[Socket] Disconnected');
  });

  // Server sends job to start
  socket.on('job:start', ({ jobId, preset, params, mode }) => {
    console.log(`[Job] start: ${jobId} preset=${preset}`);
    startJob(jobId, preset, params, mode);
  });

  // Server sends job stop
  socket.on('job:stop', ({ jobId }) => {
    stopJob(jobId);
  });

  // Stop all jobs (kill switch)
  socket.on('job:stopall', () => {
    for (const jobId of activeWorkers.keys()) stopJob(jobId);
  });

  // Server changes our mode
  socket.on('node:setMode', ({ mode }) => {
    console.log(`[Node] Mode → ${mode}`);
    config.mode = mode;
    if (mainWindow) mainWindow.webContents.send('mode:changed', mode);
  });

  // Server toggles overlay
  socket.on('node:setOverlay', ({ visible }) => {
    config.overlayVisible = visible;
    if (overlayWindow) overlayWindow[visible ? 'show' : 'hide']();
    if (mainWindow) mainWindow.webContents.send('overlay:toggle', visible);
  });

  // Preset list update
  socket.on('presets:list', (presets) => {
    if (mainWindow) mainWindow.webContents.send('presets:list', presets);
  });
}

// ---------------------------------------------------------------------------
// Job management
// ---------------------------------------------------------------------------
function startJob(jobId, presetName, params, mode) {
  const workerPath = path.join(__dirname, 'worker', 'computeWorker.js');
  const worker = new Worker(workerPath, {
    workerData: { jobId, presetName, params },
  });

  activeWorkers.set(jobId, worker);

  worker.on('message', (msg) => {
    if (msg.type === 'result') {
      socket.emit('job:result', { jobId, result: msg.data });
      activeWorkers.delete(jobId);
      // Send to renderer for visual display
      if (mainWindow && config.mode === 'display') {
        mainWindow.webContents.send('job:result', {
          jobId, presetName, params, result: msg.data,
        });
      }
    } else if (msg.type === 'frame') {
      // Streaming frame (e.g. particle simulation)
      if (mainWindow && config.mode === 'display') {
        mainWindow.webContents.send('job:frame', {
          jobId, presetName, params, frame: msg.data,
        });
      }
    } else if (msg.type === 'progress') {
      if (mainWindow) mainWindow.webContents.send('job:progress', msg);
    }
  });

  worker.on('error', (err) => {
    console.error(`[Worker] error for ${jobId}:`, err);
    socket.emit('job:failed', { jobId, error: err.message });
    activeWorkers.delete(jobId);
  });

  worker.on('exit', () => {
    activeWorkers.delete(jobId);
  });
}

function stopJob(jobId) {
  const worker = activeWorkers.get(jobId);
  if (worker) {
    worker.terminate();
    activeWorkers.delete(jobId);
    console.log(`[Job] stopped: ${jobId}`);
  }
  if (mainWindow) mainWindow.webContents.send('job:stopped', { jobId });
}

// ---------------------------------------------------------------------------
// Status broadcaster
// ---------------------------------------------------------------------------
function startStatusBroadcast() {
  setInterval(() => {
    collectStats();
    const status = {
      node_id:     config.nodeId,
      mode:        config.mode,
      cpu_usage:   stats.cpu,
      ram_usage:   stats.ram,
      gpu_usage:   stats.gpu,
      current_job: activeWorkers.size > 0 ? [...activeWorkers.keys()][0] : null,
      status:      'online',
    };
    if (socket && socket.connected) socket.emit('node:status', status);
    // Update overlay
    if (overlayWindow) overlayWindow.webContents.send('stats:update', status);
    if (mainWindow)    mainWindow.webContents.send('stats:update', status);
  }, 1000);
}

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------
function createMainWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width, height,
    backgroundColor: '#000000',
    frame: config.mode === 'display',
    fullscreen: config.mode === 'display',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('closed', () => { mainWindow = null; });

  // Pass initial config to renderer
  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow.webContents.send('init:config', config);
  });
}

function createOverlayWindow() {
  const { width, height } = screen.getPrimaryDisplay().bounds;

  overlayWindow = new BrowserWindow({
    width:  280,
    height: 120,
    x: width - 290,
    y: 10,
    frame:       false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable:   false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });

  overlayWindow.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));
  overlayWindow.setIgnoreMouseEvents(true);

  if (!config.overlayVisible) overlayWindow.hide();
}

// ---------------------------------------------------------------------------
// IPC from renderer
// ---------------------------------------------------------------------------
ipcMain.on('renderer:ready', () => {
  console.log('[IPC] renderer ready');
});

ipcMain.on('renderer:preview', (_evt, base64) => {
  // Forward canvas snapshot to server for mini-preview in admin dashboard
  if (socket && socket.connected) {
    socket.emit('node:status', { visual_preview: base64 });
  }
});

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  createMainWindow();
  createOverlayWindow();
  connectToServer();
  startStatusBroadcast();

  // Global hotkeys
  globalShortcut.register('F2', () => {
    config.overlayVisible = !config.overlayVisible;
    if (overlayWindow) overlayWindow[config.overlayVisible ? 'show' : 'hide']();
    if (mainWindow) mainWindow.webContents.send('overlay:toggle', config.overlayVisible);
  });

  globalShortcut.register('F3', () => {
    config.mode = config.mode === 'headless' ? 'display' : 'headless';
    if (mainWindow) mainWindow.webContents.send('mode:changed', config.mode);
    if (socket) socket.emit('node:register', { node_id: config.nodeId, mode: config.mode });
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  for (const jobId of activeWorkers.keys()) stopJob(jobId);
});
