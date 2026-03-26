const serverUrlInput = document.getElementById("serverUrlInput");
const connectBtn = document.getElementById("connectBtn");
const adminFrame = document.getElementById("adminFrame");

const startSacnBtn = document.getElementById("startSacnBtn");
const stopSacnBtn = document.getElementById("stopSacnBtn");
const universeInput = document.getElementById("universeInput");
const portInput = document.getElementById("portInput");
const sacnStatus = document.getElementById("sacnStatus");
const sacnMeta = document.getElementById("sacnMeta");
const pixelGrid = document.getElementById("pixelGrid");

for (let i = 0; i < 16; i += 1) {
  const el = document.createElement("div");
  el.className = "pixel";
  el.style.background = "#111111";
  el.title = `Pixel ${i + 1}`;
  pixelGrid.appendChild(el);
}

function setAdminUrl() {
  const base = serverUrlInput.value.trim() || "http://localhost:3000";
  adminFrame.src = `${base.replace(/\/$/, "")}/admin`;
}

connectBtn.addEventListener("click", setAdminUrl);

startSacnBtn.addEventListener("click", async () => {
  const universe = Number(universeInput.value || 1);
  const port = Number(portInput.value || 5568);
  const result = await window.nativeAdmin.startSacnReceiver({ universe, port });
  sacnStatus.textContent = result.ok ? "Receiver aktiv" : "Receiver Fehler";
});

stopSacnBtn.addEventListener("click", async () => {
  await window.nativeAdmin.stopSacnReceiver();
  sacnStatus.textContent = "Receiver gestoppt";
});

window.nativeAdmin.onSacnFrame((payload) => {
  sacnMeta.textContent = `Universe ${payload.universe} | Channels ${payload.channels} | ${new Date(payload.receivedAt).toLocaleTimeString()}`;
  const pixels = Array.from(pixelGrid.children);
  for (let i = 0; i < pixels.length; i += 1) {
    pixels[i].style.background = payload.pixels[i] || "#000000";
  }
});

setAdminUrl();
