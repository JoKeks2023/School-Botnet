/**
 * server.js – Main server/coordinator for the Classroom Distributed Art/Compute Cluster.
 *
 * Responsibilities:
 *  - Serve the Admin dashboard (static files from ../admin)
 *  - Manage WebSocket connections from Nodes and Admin clients
 *  - Distribute jobs to nodes via Socket.IO
 *  - Collect node status (CPU, RAM, GPU, current job, mode)
 *  - Broadcast live updates to Admin dashboard
 *  - Handle preset CRUD, job control, kill switch
 *
 * Deploy on a Raspberry Pi (or any machine with Node.js ≥ 18).
 * For remote access use a Cloudflared tunnel – no port forwarding needed.
 *
 * Usage:
 *   npm install
 *   npm start         # default port 3000
 *   PORT=8080 npm start
 */

'use strict';

const path      = require('path');
const http      = require('http');
const express   = require('express');
const { Server } = require('socket.io');
const { JobQueue }      = require('./jobQueue');
const { PresetManager } = require('./presetManager');

const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// App / HTTP server
// ---------------------------------------------------------------------------
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.use(express.json());
// Serve admin dashboard
app.use(express.static(path.join(__dirname, '..', 'admin')));

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const jobQueue      = new JobQueue();
const presetManager = new PresetManager();

/** @type {Map<string, object>} socketId → node info */
const nodes = new Map();

// ---------------------------------------------------------------------------
// REST API – used by Admin for initial data load
// ---------------------------------------------------------------------------
app.get('/api/presets', (_req, res) => {
  res.json(presetManager.listPresets());
});

app.post('/api/presets', (req, res) => {
  try {
    const preset = presetManager.upsertPreset(req.body);
    io.emit('preset:updated', preset);
    res.json(preset);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/presets/:name', (req, res) => {
  presetManager.deletePreset(req.params.name);
  io.emit('preset:deleted', { name: req.params.name });
  res.json({ ok: true });
});

app.get('/api/nodes', (_req, res) => {
  res.json(Array.from(nodes.values()));
});

app.get('/api/jobs', (_req, res) => {
  res.json(jobQueue.all());
});

// ---------------------------------------------------------------------------
// WebSocket – Socket.IO
// ---------------------------------------------------------------------------
io.on('connection', (socket) => {
  const clientType = socket.handshake.query.type || 'node'; // 'node' | 'admin'
  console.log(`[Socket.IO] connect  type=${clientType}  id=${socket.id}`);

  // ── Node client connected ───────────────────────────────────────────────
  if (clientType === 'node') {
    // Node registers itself
    socket.on('node:register', (info) => {
      const node = {
        socketId:    socket.id,
        node_id:     info.node_id     || socket.id.slice(0, 6),
        mode:        info.mode        || 'headless',
        cpu_usage:   0,
        ram_usage:   0,
        gpu_usage:   0,
        current_job: null,
        preset:      null,
        status:      'online',
        visual_preview: null,
        connectedAt: Date.now(),
      };
      nodes.set(socket.id, node);
      console.log(`[Node] registered: ${node.node_id} (${node.mode})`);

      // Send presets to the new node so it can prepare
      socket.emit('presets:list', presetManager.listPresets());

      // Announce to admin
      io.emit('node:joined', node);
    });

    // Node sends periodic status update
    socket.on('node:status', (status) => {
      const node = nodes.get(socket.id);
      if (!node) return;
      Object.assign(node, status, { socketId: socket.id });
      // Forward to admin dashboard
      io.emit('node:status', node);
    });

    // Node sends job result
    socket.on('job:result', ({ jobId, result }) => {
      const job = jobQueue.completeJob(jobId, result);
      console.log(`[Job] completed: ${jobId}`);
      io.emit('job:completed', job);
    });

    // Node reports job failure
    socket.on('job:failed', ({ jobId, error }) => {
      const job = jobQueue.failJob(jobId, error);
      console.log(`[Job] failed: ${jobId} – ${error}`);
      io.emit('job:failed', job);
    });
  }

  // ── Admin client connected ──────────────────────────────────────────────
  if (clientType === 'admin') {
    // Send current state on connect
    socket.emit('init:state', {
      nodes:   Array.from(nodes.values()),
      jobs:    jobQueue.all(),
      presets: presetManager.listPresets(),
    });
  }

  // ── Commands from Admin (any client can send to keep things simple) ─────

  // Start a job: { preset, params, targetMode }
  socket.on('admin:job:start', ({ preset: presetName, params, targetMode }) => {
    const presetDef = presetManager.getPreset(presetName);
    if (!presetDef) {
      socket.emit('error', { message: `Unknown preset: ${presetName}` });
      return;
    }
    const mergedParams = Object.assign({}, presetDef.defaultParams, params);
    const job = jobQueue.createJob(presetName, mergedParams, targetMode || presetDef.targetMode);

    // Distribute to eligible nodes
    const eligible = Array.from(nodes.values()).filter(n => {
      if (job.targetMode === 'all') return true;
      return n.mode === job.targetMode;
    });

    if (eligible.length === 0) {
      socket.emit('error', { message: 'No eligible nodes for this job' });
      return;
    }

    // Round-robin: assign to first idle node, or all nodes for broadcast presets
    for (const node of eligible) {
      jobQueue.assignJob(job.id, node.node_id);
      io.to(node.socketId).emit('job:start', {
        jobId:   job.id,
        preset:  presetName,
        params:  mergedParams,
        mode:    node.mode,
      });
    }

    console.log(`[Job] started: ${job.id} (${presetName}) → ${eligible.length} node(s)`);
    io.emit('job:started', job);
  });

  // Stop a specific job
  socket.on('admin:job:stop', ({ jobId }) => {
    const job = jobQueue.failJob(jobId, 'Stopped by admin');
    io.emit('job:stopped', { jobId });
    // Tell all nodes to stop this job
    io.emit('job:stop', { jobId });
    console.log(`[Job] stopped: ${jobId}`);
  });

  // Pause a job
  socket.on('admin:job:pause', ({ jobId }) => {
    const job = jobQueue.pauseJob(jobId);
    io.emit('job:paused', job);
    io.emit('job:pause', { jobId });
  });

  // Resume a job
  socket.on('admin:job:resume', ({ jobId }) => {
    const job = jobQueue.resumeJob(jobId);
    io.emit('job:resumed', job);
    io.emit('job:resume', { jobId });
  });

  // Kill switch – stop everything
  socket.on('admin:killswitch', () => {
    console.log('[KillSwitch] Stopping all jobs!');
    jobQueue.stopAll();
    io.emit('killswitch');
    io.emit('job:stopall');
  });

  // Change a node's mode (headless ↔ display)
  socket.on('admin:node:setMode', ({ nodeId, mode }) => {
    const node = Array.from(nodes.values()).find(n => n.node_id === nodeId);
    if (!node) return;
    node.mode = mode;
    io.to(node.socketId).emit('node:setMode', { mode });
    io.emit('node:status', node);
    console.log(`[Node] ${nodeId} mode → ${mode}`);
  });

  // Toggle overlay on a node
  socket.on('admin:node:setOverlay', ({ nodeId, visible }) => {
    const node = Array.from(nodes.values()).find(n => n.node_id === nodeId);
    if (!node) return;
    io.to(node.socketId).emit('node:setOverlay', { visible });
  });

  // Upsert preset from admin
  socket.on('admin:preset:save', (preset) => {
    try {
      const saved = presetManager.upsertPreset(preset);
      io.emit('preset:updated', saved);
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  // Delete preset
  socket.on('admin:preset:delete', ({ name }) => {
    presetManager.deletePreset(name);
    io.emit('preset:deleted', { name });
  });

  // ── Disconnect ──────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const node = nodes.get(socket.id);
    if (node) {
      node.status = 'offline';
      io.emit('node:left', { node_id: node.node_id, socketId: socket.id });
      nodes.delete(socket.id);
      console.log(`[Node] disconnected: ${node.node_id}`);
    }
    console.log(`[Socket.IO] disconnect id=${socket.id}`);
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
server.listen(PORT, () => {
  const portStr = String(PORT);
  const urlLine = `  http://localhost:${portStr}`;
  console.log(`╔══════════════════════════════════════╗`);
  console.log(`║  Classroom Cluster Server            ║`);
  console.log(`║  ${urlLine.padEnd(36)}║`);
  console.log(`╚══════════════════════════════════════╝`);
});

module.exports = { app, server, io }; // for testing
