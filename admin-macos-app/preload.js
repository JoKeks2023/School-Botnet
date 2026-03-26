const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nativeAdmin", {
  startSacnReceiver: (config) => ipcRenderer.invoke("sacn:start", config),
  stopSacnReceiver: () => ipcRenderer.invoke("sacn:stop"),
  onSacnFrame: (handler) => {
    const wrapped = (_event, payload) => handler(payload);
    ipcRenderer.on("sacn:frame", wrapped);
    return () => ipcRenderer.removeListener("sacn:frame", wrapped);
  }
});
