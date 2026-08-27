const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld(
  "desktopRuntime",
  Object.freeze({
    isElectron: true,
    platform: process.platform,
    getSettings: () => ipcRenderer.invoke("desktop:get-settings"),
    saveSettings: (settings) =>
      ipcRenderer.invoke("desktop:save-settings", settings),
  }),
);
