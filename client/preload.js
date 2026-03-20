/**
 * preload.js – Electron contextBridge preload script.
 *
 * Exposes a safe, minimal IPC API from the main process to the renderer.
 * All communication goes through the 'clusterAPI' namespace on window.
 */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('clusterAPI', {
  /** Send a message to the main process */
  send: (channel, data) => {
    const allowed = ['renderer:ready', 'renderer:preview'];
    if (allowed.includes(channel)) ipcRenderer.send(channel, data);
  },

  /** Listen for events from the main process */
  on: (channel, callback) => {
    const allowed = [
      'init:config',
      'stats:update',
      'mode:changed',
      'overlay:toggle',
      'job:result',
      'job:frame',
      'job:stopped',
      'job:progress',
      'presets:list',
    ];
    if (allowed.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    }
  },

  /** Remove all listeners for a channel */
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
});
