const path = require("path");
const dgram = require("dgram");
const { app, BrowserWindow, ipcMain } = require("electron");

let mainWindow = null;
let sacnSocket = null;
let receiverConfig = {
  enabled: false,
  universe: 1,
  port: 5568
};

function parseSacnPacket(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 126) {
    return null;
  }

  const universe = buffer.readUInt16BE(113);
  const propertyValueCount = buffer.readUInt16BE(123);
  const channelCount = Math.max(0, propertyValueCount - 1);
  const dmxStart = 126;
  if (buffer.length < dmxStart + channelCount) {
    return null;
  }

  const dmx = buffer.subarray(dmxStart, dmxStart + channelCount);
  return {
    universe,
    dmx
  };
}

function dmxToPixels(dmx, pixelCount = 16) {
  const pixels = [];
  for (let i = 0; i < pixelCount; i += 1) {
    const offset = i * 3;
    const r = dmx[offset] ?? 0;
    const g = dmx[offset + 1] ?? 0;
    const b = dmx[offset + 2] ?? 0;
    pixels.push(
      `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`
    );
  }
  return pixels;
}

function stopSacnReceiver() {
  if (!sacnSocket) {
    return;
  }
  try {
    sacnSocket.close();
  } catch {
    // no-op
  }
  sacnSocket = null;
}

function startSacnReceiver() {
  stopSacnReceiver();
  sacnSocket = dgram.createSocket("udp4");

  sacnSocket.on("message", (buffer) => {
    const frame = parseSacnPacket(buffer);
    if (!frame) {
      return;
    }
    if (frame.universe !== receiverConfig.universe) {
      return;
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("sacn:frame", {
        universe: frame.universe,
        channels: frame.dmx.length,
        pixels: dmxToPixels(frame.dmx, 16),
        receivedAt: Date.now()
      });
    }
  });

  sacnSocket.bind(receiverConfig.port, "0.0.0.0");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 920,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
}

ipcMain.handle("sacn:start", (_event, config) => {
  receiverConfig = {
    enabled: true,
    universe: Number(config?.universe || 1),
    port: Number(config?.port || 5568)
  };
  startSacnReceiver();
  return { ok: true, config: receiverConfig };
});

ipcMain.handle("sacn:stop", () => {
  receiverConfig.enabled = false;
  stopSacnReceiver();
  return { ok: true };
});

app.on("window-all-closed", () => {
  stopSacnReceiver();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
