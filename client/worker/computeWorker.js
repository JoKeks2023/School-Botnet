/**
 * computeWorker.js – Worker Thread for running preset compute functions.
 *
 * Receives { jobId, presetName, params } as workerData.
 * Loads the preset from shared/presets/<name>.js, initialises state
 * (if the preset has initState()), then runs the compute loop.
 *
 * For one-shot presets (Mandelbrot, MonteCarloPi) it computes once
 * and posts the result. For continuous presets (ParticleSwarm, ColorShapes,
 * DrumPattern) it runs in a loop, posting a 'frame' message each tick
 * until terminated.
 */

'use strict';

const { workerData, parentPort } = require('worker_threads');
const path = require('path');

const { jobId, presetName, params } = workerData;

// Load preset
let preset;
try {
  preset = require(path.join(__dirname, '..', '..', 'shared', 'presets', `${presetName}.js`));
} catch (err) {
  parentPort.postMessage({ type: 'error', jobId, message: `Unknown preset: ${presetName}` });
  process.exit(1);
}

const ONE_SHOT_PRESETS = ['Mandelbrot', 'MonteCarloPi'];
const isOneShot = ONE_SHOT_PRESETS.includes(presetName);

// Target frame interval in ms for continuous presets (~30 fps)
const FRAME_MS = 33;

if (isOneShot) {
  // Run once and return
  try {
    const result = preset.compute(params);
    parentPort.postMessage({ type: 'result', jobId, data: result });
  } catch (err) {
    parentPort.postMessage({ type: 'error', jobId, message: err.message });
  }
} else {
  // Continuous simulation loop
  let state = preset.initState ? preset.initState(params) : null;
  let running = true;

  // Listen for stop signal from main thread
  parentPort.on('message', (msg) => {
    if (msg === 'stop') running = false;
  });

  function loop() {
    if (!running) return;

    const start = Date.now();
    try {
      state = preset.compute(state, params);
      parentPort.postMessage({ type: 'frame', jobId, data: state });
    } catch (err) {
      parentPort.postMessage({ type: 'error', jobId, message: err.message });
      return;
    }

    const elapsed = Date.now() - start;
    const delay   = Math.max(0, FRAME_MS - elapsed);
    setTimeout(loop, delay);
  }

  loop();
}
