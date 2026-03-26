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
const displayModeText = document.getElementById("displayModeText");

const session = {
  clientToken: null,
  roomCode: null,
  clientId: null,
  chunksDone: 0
};

let heartbeatInFlight = false;
let taskInFlight = false;
let displayInFlight = false;
let pyodideInstance = null;
let pyodideLoadingPromise = null;
let displayTimer = null;
let activeDisplayVersion = -1;

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

function clearDisplayLoop() {
  if (displayTimer) {
    clearInterval(displayTimer);
    displayTimer = null;
  }
}

function applySolidDisplay(color) {
  document.body.style.background = color;
}

function applyDisplayState(display) {
  if (!display) {
    return;
  }

  if (display.version === activeDisplayVersion) {
    return;
  }

  activeDisplayVersion = display.version;
  clearDisplayLoop();
  displayModeText.textContent = display.mode;

  if (display.mode === "off") {
    document.body.style.background = "";
    return;
  }

  if (display.mode === "solid") {
    applySolidDisplay(display.clientColor || display.color || "#000000");
    return;
  }

  if (display.mode === "snake") {
    applySolidDisplay(display.clientColor || "#000000");
    return;
  }

  if (display.mode === "sequence" && Array.isArray(display.frames) && display.frames.length) {
    const frames = display.frames;
    const total = frames.reduce((sum, frame) => sum + frame.durationMs, 0);
    const tick = () => {
      const elapsed = (Date.now() - display.startedAt) % Math.max(total, 1);
      let acc = 0;
      for (const frame of frames) {
        acc += frame.durationMs;
        if (elapsed < acc) {
          applySolidDisplay(display.clientColor || frame.color);
          return;
        }
      }
      applySolidDisplay(display.clientColor || frames[frames.length - 1].color);
    };

    tick();
    displayTimer = setInterval(tick, 80);
  }
}

async function loadPyodideRuntime() {
  if (pyodideInstance) {
    return pyodideInstance;
  }
  if (pyodideLoadingPromise) {
    return pyodideLoadingPromise;
  }

  pyodideLoadingPromise = (async () => {
    if (!window.loadPyodide) {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js";
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    pyodideInstance = await window.loadPyodide({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/"
    });
    return pyodideInstance;
  })();

  return pyodideLoadingPromise;
}

async function runPythonWork(task) {
  const pyodide = await loadPyodideRuntime();
  pyodide.globals.set("chunk_index", task.chunkIndex);
  pyodide.globals.set("total_chunks", task.totalChunks);

  const code = `${task.script}\n\nimport json\n_result_json = json.dumps(compute(chunk_index, total_chunks))`;
  await pyodide.runPythonAsync(code);
  const resultJson = pyodide.globals.get("_result_json");
  return JSON.parse(resultJson);
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
    const result = next.task.type === "python_chunk" && next.task.script
      ? await runPythonWork(next.task)
      : await fakeComputeWork(next.task);

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

async function displayLoop() {
  if (!session.clientToken) {
    return;
  }

  if (displayInFlight) {
    return;
  }

  displayInFlight = true;
  try {
    const payload = await fetchJson("/api/client/display", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientToken: session.clientToken })
    });
    applyDisplayState(payload.display);
  } catch (error) {
    setStatus(`display_error:${error.message}`);
  } finally {
    displayInFlight = false;
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
  displayLoop();
}, 2000);

setJoined(false);
