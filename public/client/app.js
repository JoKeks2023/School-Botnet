const joinPanel = document.getElementById("joinPanel");
const runPanel = document.getElementById("runPanel");
const nameInput = document.getElementById("nameInput");
const roomCodeInput = document.getElementById("roomCodeInput");
const confirmationCodeInput = document.getElementById("confirmationCodeInput");
const joinBtn = document.getElementById("joinBtn");
const joinMsg = document.getElementById("joinMsg");
const clientIdEl = document.getElementById("clientId");
const statusText = document.getElementById("statusText");
const chunksDone = document.getElementById("chunksDone");

const session = {
  clientToken: null,
  roomCode: null,
  clientId: null,
  chunksDone: 0
};

let heartbeatInFlight = false;
let taskInFlight = false;

function setJoined(joined) {
  joinPanel.style.display = joined ? "none" : "block";
  runPanel.style.display = joined ? "block" : "none";
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || "request_failed");
  }
  return body;
}

function setStatus(text) {
  statusText.textContent = text;
}

function fakeComputeWork(task) {
  return new Promise((resolve) => {
    // Emuliert rechenintensiven Chunk ohne die UI komplett zu blockieren.
    const start = performance.now();
    let acc = 0;
    for (let i = 0; i < 300000 + (task.chunkIndex * 100); i += 1) {
      acc += Math.sqrt((i % 97) + task.chunkIndex) % 3;
    }
    const elapsedMs = Math.round(performance.now() - start);
    resolve({
      chunkIndex: task.chunkIndex,
      elapsedMs,
      checksum: Math.round(acc)
    });
  });
}

async function heartbeatLoop() {
  if (!session.clientToken) {
    return;
  }

  if (heartbeatInFlight) {
    return;
  }

  heartbeatInFlight = true;

  try {
    await fetchJson("/api/client/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientToken: session.clientToken,
        cpuHint: "normal",
        memoryHint: "normal"
      })
    });
  } catch (error) {
    setStatus(`heartbeat_error:${error.message}`);
  } finally {
    heartbeatInFlight = false;
  }
}

async function taskLoop() {
  if (!session.clientToken) {
    return;
  }

  if (taskInFlight) {
    return;
  }

  taskInFlight = true;

  try {
    const next = await fetchJson("/api/client/next", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientToken: session.clientToken })
    });

    if (!next.task) {
      setStatus("idle");
      return;
    }

    setStatus(`working:${next.task.chunkIndex}`);
    const result = await fakeComputeWork(next.task);

    await fetchJson("/api/client/result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientToken: session.clientToken,
        taskId: next.task.taskId,
        chunkIndex: next.task.chunkIndex,
        result
      })
    });

    session.chunksDone += 1;
    chunksDone.textContent = String(session.chunksDone);
    setStatus("submitted");
  } catch (error) {
    setStatus(`error:${error.message}`);
  } finally {
    taskInFlight = false;
  }
}

joinBtn.addEventListener("click", async () => {
  try {
    const payload = {
      name: nameInput.value.trim() || "pc-client",
      roomCode: roomCodeInput.value.trim(),
      confirmationCode: confirmationCodeInput.value.trim()
    };

    const data = await fetchJson("/api/client/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    session.clientToken = data.clientToken;
    session.roomCode = payload.roomCode;
    session.clientId = data.clientId;

    clientIdEl.textContent = data.clientId;
    joinMsg.textContent = "Verbunden.";
    setJoined(true);
  } catch (error) {
    joinMsg.textContent = `Join fehlgeschlagen: ${error.message}`;
  }
});

setInterval(() => {
  heartbeatLoop();
  taskLoop();
}, 2000);

setJoined(false);
