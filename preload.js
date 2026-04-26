const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hustleAPI', {
  getState: () => ipcRenderer.invoke('get-state'),
  saveState: (state) => ipcRenderer.invoke('save-state', state),
  toggleNotifs: () => ipcRenderer.invoke('toggle-notifs'),
  toggleAutostart: () => ipcRenderer.invoke('toggle-autostart'),
  testNotification: () => ipcRenderer.invoke('test-notification'),
  testScheduledAlert: (id) => ipcRenderer.invoke('test-scheduled-alert', id),
  onStateChange: (callback) => {
    ipcRenderer.on('state-changed', (event, state) => callback(state));
  },
  isElectron: true,
  platform: process.platform
});
