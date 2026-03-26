const path = require("path");
const crypto = require("crypto");
const dgram = require("dgram");

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { createServer } = require("http");
const { Server } = require("socket.io");

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "change-me");
const JOIN_CODE_TTL_MINUTES = Number(process.env.JOIN_CODE_TTL_MINUTES || 15);
const HEARTBEAT_TIMEOUT_SECONDS = Number(process.env.HEARTBEAT_TIMEOUT_SECONDS || 30);
const LIGHTING_ENABLED = String(process.env.LIGHTING_ENABLED || "false") === "true";
const LIGHTING_PROTOCOL = String(process.env.LIGHTING_PROTOCOL || "artnet").toLowerCase();
const LIGHTING_HOST = String(process.env.LIGHTING_HOST || "127.0.0.1");
const ARTNET_PORT = Number(process.env.ARTNET_PORT || 6454);
const ARTNET_UNIVERSE = Number(process.env.ARTNET_UNIVERSE || 0);
const SACN_PORT = Number(process.env.SACN_PORT || 5568);
const SACN_UNIVERSE = Number(process.env.SACN_UNIVERSE || 1);
const LIGHTING_PIXELS = Number(process.env.LIGHTING_PIXELS || 16);

const artnetSocket = dgram.createSocket("udp4");
const sacnSocket = dgram.createSocket("udp4");
let sacnSequenceNumber = 0;

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*"
  }
});

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

const state = {
  adminTokens: new Map(),
  rooms: new Map(),
  clientTokens: new Map()
};

function nowMs() {
  return Date.now();
}

function randomToken() {
  return crypto.randomBytes(24).toString("hex");
}

function randomId(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

function randomNumericCode(length = 8) {
  const min = 10 ** (length - 1);
  const max = (10 ** length) - 1;
  return String(Math.floor(Math.random() * (max - min + 1)) + min);
}

function requireAdmin(req, res, next) {
  const token = (req.headers.authorization || "").replace("Bearer ", "").trim();
  if (!token || !state.adminTokens.has(token)) {
    return res.status(401).json({ error: "not_authorized" });
  }
  next();
}

function requireClient(req, res, next) {
  const token = String(req.body.clientToken || "").trim();
  const session = state.clientTokens.get(token);
  if (!session) {
    return res.status(401).json({ error: "invalid_client_token" });
  }
  req.clientSession = session;
  next();
}

function cleanupExpiredCodes(room) {
  const cutoff = nowMs() - (JOIN_CODE_TTL_MINUTES * 60 * 1000);
  for (const [code, entry] of room.confirmationCodes.entries()) {
    if (!entry.used && entry.createdAt < cutoff) {
      room.confirmationCodes.delete(code);
    }
  }
}

function getRoomSnapshot(room) {
  const now = nowMs();
  const clients = [];

  for (const client of room.clients.values()) {
    clients.push({
      clientId: client.clientId,
      name: client.name,
      online: (now - client.lastHeartbeatAt) <= HEARTBEAT_TIMEOUT_SECONDS * 1000,
      joinedAt: client.joinedAt,
      lastHeartbeatAt: client.lastHeartbeatAt,
      stats: client.stats,
      completedChunks: client.completedChunks
    });
  }

  const tasks = room.tasks.map((task) => ({
    taskId: task.taskId,
    type: task.type,
    status: task.status,
    totalChunks: task.totalChunks,
    assignedChunks: task.assignedChunks.size,
    completedChunks: task.completedChunks.size,
    createdAt: task.createdAt,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt
  }));

  return {
    roomCode: room.roomCode,
    createdAt: room.createdAt,
    clients,
    tasks,
    display: room.display,
    pendingConfirmationCodes: Array.from(room.confirmationCodes.entries())
      .filter(([, value]) => !value.used)
      .map(([code, value]) => ({
        code,
        createdAt: value.createdAt
      }))
  };
}

function clampByte(value) {
  return Math.max(0, Math.min(255, value));
}

function normalizeHexColor(hex) {
  const value = String(hex || "").trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
    return null;
  }
  return value.toLowerCase();
}

function interpolateColor(aHex, bHex, t) {
  const a = hexToRgb(aHex) || { r: 0, g: 0, b: 0 };
  const b = hexToRgb(bHex) || { r: 0, g: 0, b: 0 };
  const clampedT = Math.max(0, Math.min(1, t));
  const r = Math.round(a.r + ((b.r - a.r) * clampedT));
  const g = Math.round(a.g + ((b.g - a.g) * clampedT));
  const bValue = Math.round(a.b + ((b.b - a.b) * clampedT));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bValue.toString(16).padStart(2, "0")}`;
}

function colorFromPalette(palette, t) {
  const safePalette = Array.isArray(palette) && palette.length >= 2
    ? palette
    : ["#ffffff", "#000000"];
  const clampedT = Math.max(0, Math.min(1, t));
  const scaled = clampedT * (safePalette.length - 1);
  const index = Math.floor(scaled);
  const nextIndex = Math.min(index + 1, safePalette.length - 1);
  const localT = scaled - index;
  return interpolateColor(safePalette[index], safePalette[nextIndex], localT);
}

function resolveSnakeColors(itemCount, startedAt, speedMs, length, palette) {
  if (itemCount <= 0) {
    return [];
  }

  const safeSpeed = Math.max(60, speedMs);
  const safeLength = Math.max(1, Math.min(length, itemCount));
  const step = Math.floor((nowMs() - startedAt) / safeSpeed);
  const head = ((step % itemCount) + itemCount) % itemCount;

  const colors = [];
  for (let i = 0; i < itemCount; i += 1) {
    const distanceFromHead = (head - i + itemCount) % itemCount;
    if (distanceFromHead >= safeLength) {
      colors.push("#000000");
      continue;
    }

    const t = safeLength === 1 ? 0 : distanceFromHead / (safeLength - 1);
    colors.push(colorFromPalette(palette, t));
  }

  return colors;
}

function getOrderedClientIds(room) {
  return Array.from(room.clients.values())
    .sort((a, b) => {
      if (a.joinedAt !== b.joinedAt) {
        return a.joinedAt - b.joinedAt;
      }
      return a.clientId.localeCompare(b.clientId);
    })
    .map((client) => client.clientId);
}

function hexToRgb(hex) {
  const value = normalizeHexColor(hex);
  if (!value) {
    return null;
  }
  return {
    r: Number.parseInt(value.slice(1, 3), 16),
    g: Number.parseInt(value.slice(3, 5), 16),
    b: Number.parseInt(value.slice(5, 7), 16)
  };
}

function getDisplayColor(roomDisplay) {
  if (!roomDisplay || roomDisplay.mode === "off") {
    return "#000000";
  }
  if (roomDisplay.mode === "solid") {
    return roomDisplay.color || "#000000";
  }
  if (roomDisplay.mode === "sequence" && Array.isArray(roomDisplay.frames) && roomDisplay.frames.length) {
    const totalDurationMs = roomDisplay.frames.reduce((sum, frame) => sum + frame.durationMs, 0);
    if (totalDurationMs <= 0) {
      return roomDisplay.frames[0].color;
    }
    const elapsed = (nowMs() - roomDisplay.startedAt) % totalDurationMs;
    let acc = 0;
    for (const frame of roomDisplay.frames) {
      acc += frame.durationMs;
      if (elapsed < acc) {
        return frame.color;
      }
    }
    return roomDisplay.frames[roomDisplay.frames.length - 1].color;
  }
  return "#000000";
}

function getClientDisplayColor(room, clientId) {
  const roomDisplay = room.display;
  if (!roomDisplay || roomDisplay.mode === "off") {
    return "#000000";
  }

  if (roomDisplay.mode === "solid") {
    return roomDisplay.color || "#000000";
  }

  if (roomDisplay.mode === "sequence") {
    return getDisplayColor(roomDisplay);
  }

  if (roomDisplay.mode === "snake") {
    const orderedClientIds = getOrderedClientIds(room);
    const colors = resolveSnakeColors(
      orderedClientIds.length,
      roomDisplay.startedAt,
      roomDisplay.speedMs,
      roomDisplay.length,
      roomDisplay.palette
    );
    const index = orderedClientIds.indexOf(clientId);
    if (index === -1) {
      return "#000000";
    }
    return colors[index] || "#000000";
  }

  return "#000000";
}

function buildPixelDmx(colors) {
  const channels = Buffer.alloc(LIGHTING_PIXELS * 3);
  for (let i = 0; i < LIGHTING_PIXELS; i += 1) {
    const rgb = hexToRgb(colors[i] || "#000000") || { r: 0, g: 0, b: 0 };
    const offset = i * 3;
    channels[offset] = clampByte(rgb.r);
    channels[offset + 1] = clampByte(rgb.g);
    channels[offset + 2] = clampByte(rgb.b);
  }
  return channels;
}

function sendArtNetDmx(channels) {
  const packet = Buffer.alloc(18 + channels.length);
  packet.write("Art-Net\0", 0, "ascii");
  packet.writeUInt16LE(0x5000, 8);
  packet.writeUInt16BE(14, 10);
  packet.writeUInt8(0, 12);
  packet.writeUInt8(0, 13);
  packet.writeUInt16LE(ARTNET_UNIVERSE, 14);
  packet.writeUInt16BE(channels.length, 16);
  channels.copy(packet, 18);
  artnetSocket.send(packet, ARTNET_PORT, LIGHTING_HOST);
}

function sendSacnDmx(channels) {
  const cid = crypto.randomBytes(16);
  const rootLength = 110 + channels.length;
  const framingLength = 88 + channels.length;
  const dmpLength = 11 + channels.length;

  const packet = Buffer.alloc(126 + channels.length);
  packet.writeUInt16BE(0x0010, 0);
  packet.writeUInt16BE(0x0000, 2);
  packet.write("ASC-E1.17\0\0\0", 4, "ascii");
  packet.writeUInt16BE(0x7000 | rootLength, 16);
  packet.writeUInt32BE(0x00000004, 18);
  cid.copy(packet, 22);

  packet.writeUInt16BE(0x7000 | framingLength, 38);
  packet.writeUInt32BE(0x00000002, 40);
  packet.write("School-Botnet", 44, "ascii");
  packet.writeUInt8(100, 108);
  packet.writeUInt16BE(0, 109);
  packet.writeUInt8(++sacnSequenceNumber % 256, 111);
  packet.writeUInt8(0, 112);
  packet.writeUInt16BE(SACN_UNIVERSE, 113);

  packet.writeUInt16BE(0x7000 | dmpLength, 115);
  packet.writeUInt8(0x02, 117);
  packet.writeUInt8(0xa1, 118);
  packet.writeUInt16BE(0x0000, 119);
  packet.writeUInt16BE(0x0001, 121);
  packet.writeUInt16BE(channels.length + 1, 123);
  packet.writeUInt8(0, 125);
  channels.copy(packet, 126);

  sacnSocket.send(packet, SACN_PORT, LIGHTING_HOST);
}

function publishLightingFromDisplay(room) {
  if (!LIGHTING_ENABLED) {
    return;
  }
  let colors = Array.from({ length: LIGHTING_PIXELS }, () => getDisplayColor(room.display));
  if (room.display && room.display.mode === "snake") {
    colors = resolveSnakeColors(
      LIGHTING_PIXELS,
      room.display.startedAt,
      room.display.speedMs,
      room.display.length,
      room.display.palette
    );
  }

  const channels = buildPixelDmx(colors);
  if (LIGHTING_PROTOCOL === "sacn") {
    sendSacnDmx(channels);
    return;
  }
  sendArtNetDmx(channels);
}

function broadcastRoomUpdate(roomCode) {
  const room = state.rooms.get(roomCode);
  if (!room) {
    return;
  }
  io.emit("room:update", getRoomSnapshot(room));
}

function findOpenTask(room) {
  return room.tasks.find((task) => task.status === "running");
}

function ensureRoom(roomCode) {
  const room = state.rooms.get(roomCode);
  if (!room) {
    return null;
  }
  cleanupExpiredCodes(room);
  return room;
}

function validateSequenceFrames(inputFrames) {
  if (!Array.isArray(inputFrames) || !inputFrames.length || inputFrames.length > 256) {
    return null;
  }

  const frames = [];
  for (const frame of inputFrames) {
    const color = normalizeHexColor(frame.color);
    const durationMs = Number(frame.durationMs);
    if (!color || !Number.isInteger(durationMs) || durationMs < 50 || durationMs > 10000) {
      return null;
    }
    frames.push({ color, durationMs });
  }
  return frames;
}

function validateSnakeConfig(inputConfig) {
  const length = Number(inputConfig.length);
  const speedMs = Number(inputConfig.speedMs);
  const rawPalette = Array.isArray(inputConfig.palette) ? inputConfig.palette : ["#ffffff", "#ff0000", "#000000"];

  if (!Number.isInteger(length) || length < 1 || length > 512) {
    return null;
  }
  if (!Number.isInteger(speedMs) || speedMs < 60 || speedMs > 10000) {
    return null;
  }

  const palette = [];
  for (const value of rawPalette) {
    const color = normalizeHexColor(value);
    if (!color) {
      return null;
    }
    palette.push(color);
  }

  if (palette.length < 2 || palette.length > 32) {
    return null;
  }

  return {
    length,
    speedMs,
    palette
  };
}

app.get("/health", (req, res) => {
  res.json({ ok: true, ts: nowMs() });
});

app.post("/api/admin/login", (req, res) => {
  const password = String(req.body.password || "");
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "invalid_credentials" });
  }

  const token = randomToken();
  state.adminTokens.set(token, { createdAt: nowMs() });
  return res.json({ token });
});

app.post("/api/admin/rooms", requireAdmin, (req, res) => {
  let roomCode = randomNumericCode(8);
  while (state.rooms.has(roomCode)) {
    roomCode = randomNumericCode(8);
  }

  const room = {
    roomCode,
    createdAt: nowMs(),
    confirmationCodes: new Map(),
    clients: new Map(),
    tasks: [],
    display: {
      mode: "off",
      color: "#000000",
      frames: [],
      startedAt: nowMs(),
      version: 0
    }
  };

  state.rooms.set(roomCode, room);
  broadcastRoomUpdate(roomCode);
  res.json({ roomCode });
});

app.post("/api/admin/rooms/:roomCode/issue-code", requireAdmin, (req, res) => {
  const room = ensureRoom(String(req.params.roomCode || ""));
  if (!room) {
    return res.status(404).json({ error: "room_not_found" });
  }

  let code = randomNumericCode(8);
  while (room.confirmationCodes.has(code)) {
    code = randomNumericCode(8);
  }

  room.confirmationCodes.set(code, {
    createdAt: nowMs(),
    used: false
  });

  broadcastRoomUpdate(room.roomCode);
  return res.json({ confirmationCode: code, ttlMinutes: JOIN_CODE_TTL_MINUTES });
});

app.post("/api/admin/rooms/:roomCode/tasks", requireAdmin, (req, res) => {
  const room = ensureRoom(String(req.params.roomCode || ""));
  if (!room) {
    return res.status(404).json({ error: "room_not_found" });
  }

  const type = String(req.body.type || "demo_render");
  const totalChunks = Number(req.body.totalChunks || 20);
  const script = req.body.script == null ? null : String(req.body.script);

  if (!Number.isInteger(totalChunks) || totalChunks < 1 || totalChunks > 5000) {
    return res.status(400).json({ error: "invalid_total_chunks" });
  }

  if (type === "python_chunk") {
    if (!script || script.length > 50000) {
      return res.status(400).json({ error: "invalid_python_script" });
    }
  }

  const task = {
    taskId: randomId("task"),
    type,
    status: "running",
    totalChunks,
    createdAt: nowMs(),
    startedAt: nowMs(),
    finishedAt: null,
    assignedChunks: new Map(),
    completedChunks: new Map(),
    script: type === "python_chunk" ? script : null
  };

  room.tasks.push(task);
  broadcastRoomUpdate(room.roomCode);
  return res.json({ taskId: task.taskId });
});

app.post("/api/admin/rooms/:roomCode/display/solid", requireAdmin, (req, res) => {
  const room = ensureRoom(String(req.params.roomCode || ""));
  if (!room) {
    return res.status(404).json({ error: "room_not_found" });
  }

  const color = normalizeHexColor(req.body.color);
  if (!color) {
    return res.status(400).json({ error: "invalid_color" });
  }

  room.display = {
    mode: "solid",
    color,
    frames: [],
    startedAt: nowMs(),
    version: room.display.version + 1
  };

  publishLightingFromDisplay(room);
  broadcastRoomUpdate(room.roomCode);
  return res.json({ ok: true, display: room.display });
});

app.post("/api/admin/rooms/:roomCode/display/sequence", requireAdmin, (req, res) => {
  const room = ensureRoom(String(req.params.roomCode || ""));
  if (!room) {
    return res.status(404).json({ error: "room_not_found" });
  }

  const frames = validateSequenceFrames(req.body.frames);
  if (!frames) {
    return res.status(400).json({ error: "invalid_sequence" });
  }

  room.display = {
    mode: "sequence",
    color: "#000000",
    frames,
    startedAt: nowMs(),
    version: room.display.version + 1
  };

  publishLightingFromDisplay(room);
  broadcastRoomUpdate(room.roomCode);
  return res.json({ ok: true, display: room.display });
});

app.post("/api/admin/rooms/:roomCode/display/snake", requireAdmin, (req, res) => {
  const room = ensureRoom(String(req.params.roomCode || ""));
  if (!room) {
    return res.status(404).json({ error: "room_not_found" });
  }

  const snake = validateSnakeConfig(req.body || {});
  if (!snake) {
    return res.status(400).json({ error: "invalid_snake_config" });
  }

  room.display = {
    mode: "snake",
    color: "#000000",
    frames: [],
    startedAt: nowMs(),
    version: room.display.version + 1,
    length: snake.length,
    speedMs: snake.speedMs,
    palette: snake.palette
  };

  publishLightingFromDisplay(room);
  broadcastRoomUpdate(room.roomCode);
  return res.json({ ok: true, display: room.display });
});

app.post("/api/admin/rooms/:roomCode/display/off", requireAdmin, (req, res) => {
  const room = ensureRoom(String(req.params.roomCode || ""));
  if (!room) {
    return res.status(404).json({ error: "room_not_found" });
  }

  room.display = {
    mode: "off",
    color: "#000000",
    frames: [],
    startedAt: nowMs(),
    version: room.display.version + 1
  };

  publishLightingFromDisplay(room);
  broadcastRoomUpdate(room.roomCode);
  return res.json({ ok: true, display: room.display });
});

app.get("/api/admin/rooms/:roomCode/state", requireAdmin, (req, res) => {
  const room = ensureRoom(String(req.params.roomCode || ""));
  if (!room) {
    return res.status(404).json({ error: "room_not_found" });
  }

  return res.json(getRoomSnapshot(room));
});

app.post("/api/admin/rooms/:roomCode/stop", requireAdmin, (req, res) => {
  const room = ensureRoom(String(req.params.roomCode || ""));
  if (!room) {
    return res.status(404).json({ error: "room_not_found" });
  }

  for (const task of room.tasks) {
    if (task.status === "running") {
      task.status = "canceled";
      task.finishedAt = nowMs();
    }
  }

  broadcastRoomUpdate(room.roomCode);
  return res.json({ ok: true });
});

app.post("/api/client/join", (req, res) => {
  const roomCode = String(req.body.roomCode || "").trim();
  const confirmationCode = String(req.body.confirmationCode || "").trim();
  const name = String(req.body.name || "").trim() || "client";

  const room = ensureRoom(roomCode);
  if (!room) {
    return res.status(404).json({ error: "room_not_found" });
  }

  const codeEntry = room.confirmationCodes.get(confirmationCode);
  if (!codeEntry) {
    return res.status(400).json({ error: "invalid_confirmation_code" });
  }

  if (codeEntry.used) {
    return res.status(400).json({ error: "confirmation_code_used" });
  }

  codeEntry.used = true;
  codeEntry.usedAt = nowMs();

  const clientId = randomId("client");
  const clientToken = randomToken();
  const clientRecord = {
    clientId,
    name,
    joinedAt: nowMs(),
    lastHeartbeatAt: nowMs(),
    stats: {
      cpuHint: null,
      memoryHint: null
    },
    completedChunks: 0
  };

  room.clients.set(clientId, clientRecord);
  state.clientTokens.set(clientToken, {
    roomCode,
    clientId
  });

  broadcastRoomUpdate(roomCode);
  return res.json({ clientToken, clientId });
});

app.post("/api/client/heartbeat", requireClient, (req, res) => {
  const { roomCode, clientId } = req.clientSession;
  const room = ensureRoom(roomCode);
  if (!room) {
    return res.status(404).json({ error: "room_not_found" });
  }

  const client = room.clients.get(clientId);
  if (!client) {
    return res.status(404).json({ error: "client_not_found" });
  }

  client.lastHeartbeatAt = nowMs();
  client.stats = {
    cpuHint: req.body.cpuHint ?? null,
    memoryHint: req.body.memoryHint ?? null
  };

  broadcastRoomUpdate(roomCode);
  return res.json({ ok: true });
});

app.post("/api/client/next", requireClient, (req, res) => {
  const { roomCode, clientId } = req.clientSession;
  const room = ensureRoom(roomCode);
  if (!room) {
    return res.status(404).json({ error: "room_not_found" });
  }

  const task = findOpenTask(room);
  if (!task) {
    return res.json({ task: null });
  }

  let chunkIndex = null;
  for (let i = 0; i < task.totalChunks; i += 1) {
    if (!task.assignedChunks.has(i) && !task.completedChunks.has(i)) {
      chunkIndex = i;
      break;
    }
  }

  if (chunkIndex === null) {
    return res.json({ task: null });
  }

  task.assignedChunks.set(chunkIndex, {
    clientId,
    assignedAt: nowMs()
  });

  broadcastRoomUpdate(roomCode);
  return res.json({
    task: {
      taskId: task.taskId,
      type: task.type,
      chunkIndex,
      totalChunks: task.totalChunks,
      script: task.script
    }
  });
});

app.post("/api/client/display", requireClient, (req, res) => {
  const { roomCode, clientId } = req.clientSession;
  const room = ensureRoom(roomCode);
  if (!room) {
    return res.status(404).json({ error: "room_not_found" });
  }

  return res.json({
    display: {
      ...room.display,
      clientColor: getClientDisplayColor(room, clientId)
    }
  });
});

app.post("/api/client/result", requireClient, (req, res) => {
  const { roomCode, clientId } = req.clientSession;
  const room = ensureRoom(roomCode);
  if (!room) {
    return res.status(404).json({ error: "room_not_found" });
  }

  const taskId = String(req.body.taskId || "");
  const chunkIndex = Number(req.body.chunkIndex);
  const result = req.body.result;

  const task = room.tasks.find((item) => item.taskId === taskId);
  if (!task) {
    return res.status(404).json({ error: "task_not_found" });
  }

  if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= task.totalChunks) {
    return res.status(400).json({ error: "invalid_chunk_index" });
  }

  task.completedChunks.set(chunkIndex, {
    clientId,
    result,
    completedAt: nowMs()
  });
  task.assignedChunks.delete(chunkIndex);

  const client = room.clients.get(clientId);
  if (client) {
    client.completedChunks += 1;
    client.lastHeartbeatAt = nowMs();
  }

  if (task.completedChunks.size >= task.totalChunks) {
    task.status = "complete";
    task.finishedAt = nowMs();
  }

  broadcastRoomUpdate(roomCode);
  return res.json({ ok: true, completed: task.completedChunks.size, total: task.totalChunks });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "admin", "index.html"));
});

app.get("/client", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "client", "index.html"));
});

io.on("connection", (socket) => {
  socket.emit("server:ready", { ok: true });
});

setInterval(() => {
  for (const roomCode of state.rooms.keys()) {
    const room = state.rooms.get(roomCode);
    if (room) {
      publishLightingFromDisplay(room);
    }
    broadcastRoomUpdate(roomCode);
  }
}, 5000);

httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`school-botnet listening on :${PORT}`);
});
