# School-Botnet – Classroom Distributed Art / Compute Cluster

A portable, self-contained cluster system for school classrooms.  
Windows PCs run a portable Electron client, a Raspberry Pi (or any Node.js machine) acts as the coordinator, and a browser-based Admin Dashboard controls everything.

```
          Admin / Control Panel (Browser)
                         │
                         ▼
                   Server / Coordinator (Raspberry Pi)
           ─────────────────────────────────────────────
           │          │          │          │
        Node1       Node2       Node3     Node4   …
   (Client EXE) (Client EXE) (Client EXE) …
```

---

## Features

| Feature | Description |
|---|---|
| **Headless Mode** | Node computes jobs + shows btop-style ASCII overlay |
| **Display Mode** | Node computes jobs + renders full-screen visual + overlay |
| **Live Dashboard** | Node grid, CPU/RAM/GPU bars, mini canvas preview, job queue |
| **Preset System** | Modular compute + visual presets (Mandelbrot, Boids, Pi, …) |
| **Preset Editor** | Create / edit / delete presets from the Admin UI |
| **Kill Switch** | Instantly stop all jobs on all nodes |
| **Remote Access** | Cloudflared tunnel – no port forwarding needed |
| **Portable EXE** | Runs from USB stick, no admin rights required |
| **Hotkeys** | F2 = toggle overlay, F3 = toggle headless/display mode |

---

## Project Structure

```
School-Botnet/
├── server/                  # Node.js + Express + Socket.IO server (Raspberry Pi)
│   ├── server.js            # Main server entry point
│   ├── jobQueue.js          # Job queue management
│   ├── presetManager.js     # Preset loading and CRUD
│   └── package.json
│
├── client/                  # Electron portable client (Windows EXE)
│   ├── main.js              # Electron main process
│   ├── preload.js           # Context-bridge IPC preload
│   ├── renderer/
│   │   ├── index.html       # Main window (headless/display view)
│   │   ├── renderer.js      # Renderer process logic
│   │   └── overlay.html     # Always-on-top overlay window
│   ├── worker/
│   │   └── computeWorker.js # Worker Thread for compute jobs
│   └── package.json
│
├── admin/                   # Web Admin Dashboard (served by server)
│   ├── index.html
│   ├── app.js
│   └── style.css
│
└── shared/
    └── presets/             # Preset definitions (shared by server + client)
        ├── mandelbrot.js    # Fractal – Mandelbrot/Julia Set
        ├── particleSwarm.js # Boids/Particle simulation
        ├── monteCarloPi.js  # Monte Carlo π (headless)
        ├── colorShapes.js   # Generative animated shapes
        └── drumPattern.js   # Drum pattern sequencer
```

---

## Quick Start

### 1. Server (Raspberry Pi / any machine with Node.js ≥ 18)

```bash
cd server
npm install
npm start          # http://localhost:3000
# or custom port:
PORT=8080 npm start
```

Open **http://\<server-ip\>:3000** in a browser to access the Admin Dashboard.

#### Remote Access via Cloudflared

```bash
cloudflared tunnel --url http://localhost:3000
# Cloudflared prints a public URL – share it with your browser
```

---

### 2. Client (Windows PC)

#### Development (requires Node.js + npm)

```bash
cd client
npm install
# Set server URL:
SERVER_URL=http://192.168.1.50:3000 NODE_ID=Node01 NODE_MODE=headless npm start
```

#### Build Portable EXE (no Node.js required on target PC)

```bash
cd client
npm install
npm run build:win
# Output: client/dist/ClusterClient-<version>-portable.exe
```

Copy the `.exe` to a USB stick. Double-click to run – no installation needed.

#### Environment Variables / config.json

| Variable | Default | Description |
|---|---|---|
| `SERVER_URL` | `http://localhost:3000` | WebSocket server address |
| `NODE_ID` | `Node-<hostname>` | Node identifier shown in dashboard |
| `NODE_MODE` | `headless` | `headless` or `display` |
| `CPU_LIMIT` | `20` | Informational CPU usage cap (%) |

You can also place a `config.json` next to the EXE:

```json
{
  "serverUrl": "http://192.168.1.50:3000",
  "nodeId": "Node04",
  "mode": "display",
  "cpuLimit": 15
}
```

---

## Presets

### Built-in Presets

| Name | Category | Mode | Description |
|---|---|---|---|
| `Mandelbrot` | Fractal | All | Mandelbrot/Julia Set fractal computation |
| `ParticleSwarm` | Particle System | All | Boids flocking simulation |
| `MonteCarloPi` | Headless Compute | Headless | Monte Carlo π estimation |
| `ColorShapes` | Random Art | Display | Animated generative shapes |
| `DrumPattern` | Generative Music | Display | 16-step drum sequencer with visuals |

### Adding Custom Presets

Create a file in `shared/presets/MyPreset.js`:

```js
module.exports = {
  name:        'MyPreset',
  category:    'Custom',
  description: 'My custom preset',
  targetMode:  'all',  // 'headless' | 'display' | 'all'

  defaultParams: { speed: 1.0 },

  // For one-shot presets: receives params, returns result
  compute(params) {
    return { answer: 42 };
  },

  // For continuous presets: receives (state, params), returns new state
  // compute(state, params) { ... }

  // Optional: initialise state for continuous presets
  initState(params) { return []; },

  // Optional: visual code string (eval'd in renderer)
  visualCode: `
    function drawMyPreset(ctx, data, params) {
      ctx.clearRect(0, 0, params.width, params.height);
      // draw here…
    }
  `,
};
```

The server auto-loads all `.js` files from `shared/presets/` on startup.  
You can also create/edit presets live from the Admin Dashboard.

---

## WebSocket Protocol

All communication uses Socket.IO events.

### Node → Server

| Event | Payload | Description |
|---|---|---|
| `node:register` | `{ node_id, mode }` | Register on connect |
| `node:status` | `{ node_id, mode, cpu_usage, ram_usage, gpu_usage, current_job, status, visual_preview? }` | Periodic status |
| `job:result` | `{ jobId, result }` | One-shot job result |
| `job:failed` | `{ jobId, error }` | Job error |

### Server → Node

| Event | Payload | Description |
|---|---|---|
| `job:start` | `{ jobId, preset, params, mode }` | Start a job |
| `job:stop` | `{ jobId }` | Stop a specific job |
| `job:stopall` | — | Kill switch: stop all jobs |
| `node:setMode` | `{ mode }` | Switch headless/display |
| `node:setOverlay` | `{ visible }` | Show/hide overlay |
| `presets:list` | `Preset[]` | Preset catalogue |

### Admin → Server

| Event | Payload | Description |
|---|---|---|
| `admin:job:start` | `{ preset, params, targetMode }` | Start job |
| `admin:job:stop` | `{ jobId }` | Stop job |
| `admin:job:pause` | `{ jobId }` | Pause job |
| `admin:job:resume` | `{ jobId }` | Resume job |
| `admin:killswitch` | — | Stop everything |
| `admin:node:setMode` | `{ nodeId, mode }` | Change node mode |
| `admin:node:setOverlay` | `{ nodeId, visible }` | Toggle overlay |
| `admin:preset:save` | `Preset` | Save preset |
| `admin:preset:delete` | `{ name }` | Delete preset |

---

## Hotkeys (Client)

| Key | Action |
|---|---|
| `F2` | Toggle overlay on/off |
| `F3` | Toggle headless ↔ display mode |

---

## Technology Stack

| Layer | Technology |
|---|---|
| Server | Node.js, Express, Socket.IO |
| Client | Electron, Node.js Worker Threads, Canvas/WebGL |
| Admin | Plain HTML/CSS/JS, Socket.IO |
| Remote | Cloudflared tunnel |
| Data | JSON (jobs, results, presets, status) |