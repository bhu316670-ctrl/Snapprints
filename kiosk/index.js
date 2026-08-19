

const { app, BrowserWindow } = require("electron");
const path = require("path");

app.disableHardwareAcceleration();

// GPU flags (keep only if you really need stability on low-end hardware)
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");

// IMPORTANT: kiosk apps should prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  return;
}

require("./kioskCore");

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 800,
    height: 480,

    kiosk: true,              // kiosk already implies fullscreen
    autoHideMenuBar: true,

    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,         // OK if you need kiosk APIs
    },
  });

  win.loadFile("index.html");

  // Optional: auto-reload on crash (useful for kiosk stability)
  win.webContents.on("render-process-gone", () => {
    app.relaunch();
    app.exit();
  });
}

// Prevent multiple windows
app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(createWindow);

// macOS support
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});