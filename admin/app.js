/**
 * app.js – Admin Dashboard application logic.
 *
 * Connects to the cluster server via Socket.IO (WebSocket) and provides:
 *  - Live node status grid with CPU/RAM/GPU bars and mini-preview
 *  - Job queue table with pause/resume/stop controls
 *  - Job start form with preset selection and parameter editor
 *  - Preset CRUD editor
 *  - Kill switch (stops all running jobs immediately)
 *  - Node mode toggle (headless ↔ display) and overlay toggle
 *
 * Served as a static file by the server at http://<server>/
 * Uses Socket.IO CDN so it works without a build step.
 */

/* global io */

'use strict';

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------
const SERVER_URL = `${window.location.protocol}//${window.location.host}`;
const socket = io(SERVER_URL, { query: { type: 'admin' } });

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const state = {
  nodes:   {},  // node_id → node object
  jobs:    {},  // jobId   → job object
  presets: {},  // name    → preset object
};

// ---------------------------------------------------------------------------
// Socket event handlers
// ---------------------------------------------------------------------------
socket.on('connect', () => {
  setConnectionStatus(true);
  toast('Connected to cluster server');
});

socket.on('disconnect', () => {
  setConnectionStatus(false);
  toast('Disconnected from server', 'warn');
});

// Initial state dump on connection
socket.on('init:state', ({ nodes, jobs, presets }) => {
  for (const n of nodes)   state.nodes[n.node_id]  = n;
  for (const j of jobs)    state.jobs[j.id]         = j;
  for (const p of presets) state.presets[p.name]    = p;
  renderNodes();
  renderJobs();
  renderPresetSelect();
});

// Node events
socket.on('node:joined',  (node) => { state.nodes[node.node_id] = node; renderNodes(); });
socket.on('node:left',    ({ node_id }) => { if (state.nodes[node_id]) { state.nodes[node_id].status = 'offline'; renderNodes(); } });
socket.on('node:status',  (node) => { state.nodes[node.node_id] = node; renderNodes(); });

// Job events
socket.on('job:started',   (job)         => { state.jobs[job.id] = job; renderJobs(); });
socket.on('job:completed', (job)         => { if (job) { state.jobs[job.id] = job; renderJobs(); } });
socket.on('job:failed',    (job)         => { if (job) { state.jobs[job.id] = job; renderJobs(); } });
socket.on('job:stopped',   ({ jobId })   => { if (state.jobs[jobId]) { state.jobs[jobId].state = 'failed'; renderJobs(); } });
socket.on('job:paused',    (job)         => { if (job) { state.jobs[job.id] = job; renderJobs(); } });
socket.on('job:resumed',   (job)         => { if (job) { state.jobs[job.id] = job; renderJobs(); } });

// Preset events
socket.on('preset:updated', (p) => { state.presets[p.name] = p; renderPresetSelect(); toast(`Preset "${p.name}" saved`); });
socket.on('preset:deleted', ({ name }) => { delete state.presets[name]; renderPresetSelect(); toast(`Preset "${name}" deleted`); });

// Kill switch
socket.on('killswitch', () => {
  for (const id of Object.keys(state.jobs)) state.jobs[id].state = 'failed';
  renderJobs();
  toast('Kill switch activated – all jobs stopped', 'danger');
});

// ---------------------------------------------------------------------------
// Render: Nodes
// ---------------------------------------------------------------------------
function renderNodes() {
  const grid = document.getElementById('nodesGrid');
  const list = Object.values(state.nodes);
  document.getElementById('nodeCount').textContent = `(${list.filter(n => n.status === 'online').length}/${list.length})`;

  if (list.length === 0) {
    grid.innerHTML = '<div style="color:var(--muted); font-size:12px;">No nodes connected</div>';
    return;
  }

  grid.innerHTML = list.map(n => `
    <div class="node-card ${n.status === 'online' ? 'online' : 'offline'}"
         data-node-id="${esc(n.node_id)}"
         data-node-mode="${esc(n.mode)}">
      <div class="node-header">
        <span class="node-name">${esc(n.node_id)}</span>
        <span class="node-mode ${esc(n.mode)}">${esc(n.mode) || '—'}</span>
      </div>
      <div class="node-stats">
        CPU <span>${Number(n.cpu_usage) || 0}%</span><span class="bar" style="width:${Math.min(Number(n.cpu_usage)||0, 100) * 0.7}px"></span><br>
        RAM <span>${Number(n.ram_usage) || 0} GB</span><br>
        GPU <span>${Number(n.gpu_usage) || 0}%</span><br>
        <span style="color:var(--muted)">Job: ${esc(n.current_job || 'idle')}</span>
      </div>
      ${n.visual_preview && /^data:image\//.test(n.visual_preview)
        ? `<img class="node-preview" src="${esc(n.visual_preview)}" style="display:block" alt="preview" />`
        : ''}
      <div class="node-actions">
        <button class="small btn-toggle-mode">
          ${n.mode === 'display' ? '📟 Headless' : '🖥 Display'}
        </button>
        <button class="small btn-toggle-overlay">👁 Overlay</button>
      </div>
    </div>
  `).join('');

  // Attach event listeners via delegation to avoid inline onclick injection risks
  grid.querySelectorAll('.btn-toggle-mode').forEach(btn => {
    btn.addEventListener('click', () => {
      const card    = btn.closest('[data-node-id]');
      const nodeId  = card.dataset.nodeId;
      const curMode = card.dataset.nodeMode;
      const newMode = curMode === 'display' ? 'headless' : 'display';
      app.toggleNodeMode(nodeId, newMode);
    });
  });

  grid.querySelectorAll('.btn-toggle-overlay').forEach(btn => {
    btn.addEventListener('click', () => {
      const nodeId = btn.closest('[data-node-id]').dataset.nodeId;
      app.toggleOverlay(nodeId);
    });
  });
}

// ---------------------------------------------------------------------------
// Render: Jobs
// ---------------------------------------------------------------------------
function renderJobs() {
  const tbody  = document.getElementById('jobTableBody');
  const jobs   = Object.values(state.jobs);
  const active = jobs.filter(j => j.state === 'running' || j.state === 'pending').length;

  document.getElementById('jobCount').textContent = `${active} active`;

  if (jobs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="color:var(--muted); text-align:center; padding:16px;">No jobs yet</td></tr>';
    return;
  }

  tbody.innerHTML = jobs.slice().reverse().slice(0, 50).map(j => `
    <tr data-job-id="${esc(j.id)}">
      <td style="font-family:var(--mono); font-size:11px; color:var(--muted)">${esc(j.id.slice(0, 8))}</td>
      <td>${esc(j.preset)}</td>
      <td>${esc(j.targetMode)}</td>
      <td style="font-size:11px; color:var(--muted)">${esc(j.assignedNode || '—')}</td>
      <td><span class="status-badge status-${esc(j.state)}">${esc(j.state)}</span></td>
      <td style="display:flex; gap:4px;">
        ${j.state === 'running' ? '<button class="small warn btn-pause">⏸</button>' : ''}
        ${j.state === 'paused'  ? '<button class="small primary btn-resume">▶</button>' : ''}
        ${j.state !== 'done' && j.state !== 'failed' ? '<button class="small danger btn-stop">■</button>' : ''}
        ${j.result ? '<button class="small btn-result">📋</button>' : ''}
      </td>
    </tr>
  `).join('');

  // Attach event listeners via data attributes to avoid inline onclick injection
  tbody.querySelectorAll('[data-job-id]').forEach(row => {
    const jobId = row.dataset.jobId;
    row.querySelector('.btn-pause')  && row.querySelector('.btn-pause').addEventListener('click',  () => app.pauseJob(jobId));
    row.querySelector('.btn-resume') && row.querySelector('.btn-resume').addEventListener('click', () => app.resumeJob(jobId));
    row.querySelector('.btn-stop')   && row.querySelector('.btn-stop').addEventListener('click',   () => app.stopJob(jobId));
    row.querySelector('.btn-result') && row.querySelector('.btn-result').addEventListener('click', () => app.showResult(jobId));
  });
}

// ---------------------------------------------------------------------------
// Render: Preset select dropdown
// ---------------------------------------------------------------------------
function renderPresetSelect() {
  const sel = document.getElementById('presetSelect');
  const current = sel.value;
  sel.innerHTML = '<option value="">— Select preset —</option>' +
    Object.values(state.presets).map(p =>
      `<option value="${esc(p.name)}" ${p.name === current ? 'selected' : ''}>${esc(p.name)} (${esc(p.category || '')})</option>`
    ).join('');
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
const app = {

  refreshNodes() {
    fetch('/api/nodes').then(r => r.json()).then(list => {
      for (const n of list) state.nodes[n.node_id] = n;
      renderNodes();
    });
  },

  onPresetChange() {
    const name   = document.getElementById('presetSelect').value;
    const preset = state.presets[name];
    if (!preset) return;
    document.getElementById('paramsInput').value = JSON.stringify(preset.params || {}, null, 2);
    document.getElementById('targetMode').value  = preset.targetMode || 'all';
  },

  startJob() {
    const preset     = document.getElementById('presetSelect').value;
    const targetMode = document.getElementById('targetMode').value;
    let   params     = {};
    try {
      const raw = document.getElementById('paramsInput').value.trim();
      if (raw) params = JSON.parse(raw);
    } catch {
      toast('Invalid JSON in parameters', 'danger');
      return;
    }
    if (!preset) { toast('Please select a preset', 'warn'); return; }
    socket.emit('admin:job:start', { preset, params, targetMode });
    toast(`Starting job: ${preset}`);
  },

  stopJob(jobId) {
    socket.emit('admin:job:stop', { jobId });
    toast('Job stopped');
  },

  pauseJob(jobId) {
    socket.emit('admin:job:pause', { jobId });
  },

  resumeJob(jobId) {
    socket.emit('admin:job:resume', { jobId });
  },

  killSwitch() {
    if (!confirm('Stop ALL running jobs on ALL nodes?')) return;
    socket.emit('admin:killswitch');
  },

  toggleNodeMode(nodeId, newMode) {
    socket.emit('admin:node:setMode', { nodeId, mode: newMode });
    toast(`${nodeId} → ${newMode}`);
  },

  toggleOverlay(nodeId) {
    socket.emit('admin:node:setOverlay', { nodeId, visible: true });
  },

  showResult(jobId) {
    const job = state.jobs[jobId];
    if (!job || !job.result) return;
    // Use a safe text display rather than alert with arbitrary data
    const resultStr = JSON.stringify(job.result, null, 2).slice(0, 2000);
    // eslint-disable-next-line no-alert
    window.alert(resultStr);
  },

  // ── Preset Editor ──────────────────────────────────────────────────────

  newPreset() {
    document.getElementById('peName').value        = '';
    document.getElementById('peCategory').value    = '';
    document.getElementById('peDescription').value = '';
    document.getElementById('peTargetMode').value  = 'all';
    document.getElementById('peParams').value      = '{}';
  },

  savePreset() {
    const name = document.getElementById('peName').value.trim();
    if (!name) { toast('Preset name required', 'warn'); return; }
    let params = {};
    try {
      params = JSON.parse(document.getElementById('peParams').value || '{}');
    } catch {
      toast('Invalid JSON in default params', 'danger');
      return;
    }
    const preset = {
      name,
      category:    document.getElementById('peCategory').value.trim(),
      description: document.getElementById('peDescription').value.trim(),
      targetMode:  document.getElementById('peTargetMode').value,
      defaultParams: params,
    };
    socket.emit('admin:preset:save', preset);
  },

  deletePreset() {
    const name = document.getElementById('peName').value.trim();
    if (!name) { toast('Enter preset name to delete', 'warn'); return; }
    if (!confirm(`Delete preset "${name}"?`)) return;
    socket.emit('admin:preset:delete', { name });
  },
};

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function setConnectionStatus(online) {
  document.getElementById('connDot').className   = `dot ${online ? 'online' : 'offline'}`;
  document.getElementById('connLabel').textContent = online ? 'Connected' : 'Disconnected';
}

function toast(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent  = msg;
  el.style.borderColor = type === 'danger' ? 'var(--red)' : type === 'warn' ? 'var(--orange)' : 'var(--border)';
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 3000);
}

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
setConnectionStatus(false);

// Wire up static button event listeners (replaces inline onclick attributes)
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnRefreshNodes').addEventListener('click', () => app.refreshNodes());
  document.getElementById('killSwitch').addEventListener('click', () => app.killSwitch());
  document.getElementById('presetSelect').addEventListener('change', () => app.onPresetChange());
  document.getElementById('btnStartJob').addEventListener('click', () => app.startJob());
  document.getElementById('btnNewPreset').addEventListener('click', () => app.newPreset());
  document.getElementById('btnSavePreset').addEventListener('click', () => app.savePreset());
  document.getElementById('btnDeletePreset').addEventListener('click', () => app.deletePreset());
});
