const path = require("path");
const crypto = require("crypto");

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
    pendingConfirmationCodes: Array.from(room.confirmationCodes.entries())
      .filter(([, value]) => !value.used)
      .map(([code, value]) => ({
        code,
        createdAt: value.createdAt
      }))
  };
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
    tasks: []
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

  if (!Number.isInteger(totalChunks) || totalChunks < 1 || totalChunks > 5000) {
    return res.status(400).json({ error: "invalid_total_chunks" });
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
    completedChunks: new Map()
  };

  room.tasks.push(task);
  broadcastRoomUpdate(room.roomCode);
  return res.json({ taskId: task.taskId });
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
      totalChunks: task.totalChunks
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
    broadcastRoomUpdate(roomCode);
  }
}, 5000);

httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`school-botnet listening on :${PORT}`);
});
