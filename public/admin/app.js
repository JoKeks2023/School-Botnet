const api = {
  token: null,
  roomCode: null
};

const loginPanel = document.getElementById("loginPanel");
const controlPanel = document.getElementById("controlPanel");
const displayPanel = document.getElementById("displayPanel");
const pythonPanel = document.getElementById("pythonPanel");
const codesPanel = document.getElementById("codesPanel");
const statusPanel = document.getElementById("statusPanel");
const adminPassword = document.getElementById("adminPassword");
const loginBtn = document.getElementById("loginBtn");
const loginMsg = document.getElementById("loginMsg");

const createRoomBtn = document.getElementById("createRoomBtn");
const issueCodeBtn = document.getElementById("issueCodeBtn");
const createTaskBtn = document.getElementById("createTaskBtn");
const stopTasksBtn = document.getElementById("stopTasksBtn");
const setSolidBtn = document.getElementById("setSolidBtn");
const setSequenceBtn = document.getElementById("setSequenceBtn");
const displayOffBtn = document.getElementById("displayOffBtn");
const setSnakeBtn = document.getElementById("setSnakeBtn");
const createPythonTaskBtn = document.getElementById("createPythonTaskBtn");

const solidColorInput = document.getElementById("solidColorInput");
const sequenceInput = document.getElementById("sequenceInput");
const snakeLengthInput = document.getElementById("snakeLengthInput");
const snakeSpeedInput = document.getElementById("snakeSpeedInput");
const snakePaletteInput = document.getElementById("snakePaletteInput");
const pythonChunksInput = document.getElementById("pythonChunksInput");
const pythonScriptInput = document.getElementById("pythonScriptInput");

const roomCodeText = document.getElementById("roomCodeText");
const lastCodeText = document.getElementById("lastCodeText");
const activeRoom = document.getElementById("activeRoom");

const clientsList = document.getElementById("clientsList");
const tasksList = document.getElementById("tasksList");
const pendingCodesList = document.getElementById("pendingCodesList");

function setLoggedIn(loggedIn) {
  loginPanel.style.display = loggedIn ? "none" : "block";
  controlPanel.style.display = loggedIn ? "block" : "none";
  displayPanel.style.display = loggedIn ? "block" : "none";
  pythonPanel.style.display = loggedIn ? "block" : "none";
  codesPanel.style.display = loggedIn ? "block" : "none";
  statusPanel.style.display = loggedIn ? "block" : "none";
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${api.token}`
  };
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || "request_failed");
  }
  return body;
}

function renderRoomState(payload) {
  if (!payload || payload.roomCode !== api.roomCode) {
    return;
  }

  clientsList.innerHTML = "";
  if (!payload.clients.length) {
    clientsList.innerHTML = "<li class='muted'>Keine Clients verbunden</li>";
  }

  for (const client of payload.clients) {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${client.name}</strong> (${client.clientId}) <span class='badge'>${client.online ? "online" : "offline"}</span> chunks=${client.completedChunks}`;
    clientsList.appendChild(li);
  }

  tasksList.innerHTML = "";
  if (!payload.tasks.length) {
    tasksList.innerHTML = "<li class='muted'>Keine Tasks</li>";
  }

  for (const task of payload.tasks) {
    const li = document.createElement("li");
    li.innerHTML = `${task.taskId} <span class='badge'>${task.status}</span> ${task.completedChunks}/${task.totalChunks}`;
    tasksList.appendChild(li);
  }

  pendingCodesList.innerHTML = "";
  if (!payload.pendingConfirmationCodes.length) {
    pendingCodesList.innerHTML = "<li class='muted'>Keine offenen Codes</li>";
  }

  for (const item of payload.pendingConfirmationCodes) {
    const li = document.createElement("li");
    li.textContent = item.code;
    pendingCodesList.appendChild(li);
  }
}

async function refreshRoomState() {
  if (!api.roomCode) {
    return;
  }
  const state = await fetchJson(`/api/admin/rooms/${api.roomCode}/state`, {
    headers: authHeaders()
  });
  renderRoomState(state);
}

loginBtn.addEventListener("click", async () => {
  try {
    const data = await fetchJson("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: adminPassword.value })
    });

    api.token = data.token;
    setLoggedIn(true);
    loginMsg.textContent = "Login erfolgreich.";
  } catch (error) {
    loginMsg.textContent = `Login fehlgeschlagen: ${error.message}`;
  }
});

createRoomBtn.addEventListener("click", async () => {
  try {
    const data = await fetchJson("/api/admin/rooms", {
      method: "POST",
      headers: authHeaders()
    });

    api.roomCode = data.roomCode;
    roomCodeText.textContent = data.roomCode;
    activeRoom.textContent = data.roomCode;
    await refreshRoomState();
  } catch (error) {
    alert(`Fehler: ${error.message}`);
  }
});

issueCodeBtn.addEventListener("click", async () => {
  if (!api.roomCode) {
    alert("Erst Raum erstellen.");
    return;
  }

  try {
    const data = await fetchJson(`/api/admin/rooms/${api.roomCode}/issue-code`, {
      method: "POST",
      headers: authHeaders()
    });
    lastCodeText.textContent = data.confirmationCode;
    await refreshRoomState();
  } catch (error) {
    alert(`Fehler: ${error.message}`);
  }
});

createTaskBtn.addEventListener("click", async () => {
  if (!api.roomCode) {
    alert("Erst Raum erstellen.");
    return;
  }

  try {
    await fetchJson(`/api/admin/rooms/${api.roomCode}/tasks`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ type: "demo_render", totalChunks: 200 })
    });
    await refreshRoomState();
  } catch (error) {
    alert(`Fehler: ${error.message}`);
  }
});

stopTasksBtn.addEventListener("click", async () => {
  if (!api.roomCode) {
    alert("Erst Raum erstellen.");
    return;
  }

  try {
    await fetchJson(`/api/admin/rooms/${api.roomCode}/stop`, {
      method: "POST",
      headers: authHeaders()
    });
    await refreshRoomState();
  } catch (error) {
    alert(`Fehler: ${error.message}`);
  }
});

setSolidBtn.addEventListener("click", async () => {
  if (!api.roomCode) {
    alert("Erst Raum erstellen.");
    return;
  }
  try {
    await fetchJson(`/api/admin/rooms/${api.roomCode}/display/solid`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ color: solidColorInput.value })
    });
    await refreshRoomState();
  } catch (error) {
    alert(`Fehler: ${error.message}`);
  }
});

setSequenceBtn.addEventListener("click", async () => {
  if (!api.roomCode) {
    alert("Erst Raum erstellen.");
    return;
  }

  try {
    const frames = JSON.parse(sequenceInput.value);
    await fetchJson(`/api/admin/rooms/${api.roomCode}/display/sequence`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ frames })
    });
    await refreshRoomState();
  } catch (error) {
    alert(`Fehler: ${error.message}`);
  }
});

setSnakeBtn.addEventListener("click", async () => {
  if (!api.roomCode) {
    alert("Erst Raum erstellen.");
    return;
  }

  try {
    const palette = JSON.parse(snakePaletteInput.value);
    await fetchJson(`/api/admin/rooms/${api.roomCode}/display/snake`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        length: Number(snakeLengthInput.value),
        speedMs: Number(snakeSpeedInput.value),
        palette
      })
    });
    await refreshRoomState();
  } catch (error) {
    alert(`Fehler: ${error.message}`);
  }
});

displayOffBtn.addEventListener("click", async () => {
  if (!api.roomCode) {
    alert("Erst Raum erstellen.");
    return;
  }
  try {
    await fetchJson(`/api/admin/rooms/${api.roomCode}/display/off`, {
      method: "POST",
      headers: authHeaders()
    });
    await refreshRoomState();
  } catch (error) {
    alert(`Fehler: ${error.message}`);
  }
});

createPythonTaskBtn.addEventListener("click", async () => {
  if (!api.roomCode) {
    alert("Erst Raum erstellen.");
    return;
  }

  try {
    await fetchJson(`/api/admin/rooms/${api.roomCode}/tasks`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        type: "python_chunk",
        totalChunks: Number(pythonChunksInput.value || 40),
        script: pythonScriptInput.value
      })
    });
    await refreshRoomState();
  } catch (error) {
    alert(`Fehler: ${error.message}`);
  }
});

const socket = io();
socket.on("room:update", (payload) => {
  renderRoomState(payload);
});

setLoggedIn(false);
setInterval(() => {
  if (api.token && api.roomCode) {
    refreshRoomState().catch(() => {});
  }
}, 4000);
