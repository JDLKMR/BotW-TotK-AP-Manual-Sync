const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('settings:get'), saveSettings: (s) => ipcRenderer.invoke('settings:save', s),
  getStatuses: () => ipcRenderer.invoke('status:get'), getLog: () => ipcRenderer.invoke('log:get'), getPaused: () => ipcRenderer.invoke('paused:get'),
  applyNow: (k) => ipcRenderer.invoke('apply-now', k), pickDir: () => ipcRenderer.invoke('pick-dir'), openBackups: () => ipcRenderer.invoke('open-backups'),
  setPaused: (p) => ipcRenderer.invoke('pause', p),
  saveGameOpts: (o) => ipcRenderer.invoke('game-opts:save', o), getTowers: () => ipcRenderer.invoke('towers:get'),
  on: (ch, cb) => ipcRenderer.on(ch, (_e, p) => cb(p))
});
