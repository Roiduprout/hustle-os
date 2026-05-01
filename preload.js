const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hustleAPI', {
  getState: () => ipcRenderer.invoke('get-state'),
  saveState: (state) => ipcRenderer.invoke('save-state', state),
  toggleNotifs: () => ipcRenderer.invoke('toggle-notifs'),
  toggleAutostart: () => ipcRenderer.invoke('toggle-autostart'),
  testNotification: () => ipcRenderer.invoke('test-notification'),
  testScheduledAlert: (id) => ipcRenderer.invoke('test-scheduled-alert', id),
  testRoutine: (id) => ipcRenderer.invoke('test-routine', id),
  testTaskNotif: (id) => ipcRenderer.invoke('test-task-notif', id),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  onUpdateStatus: (cb) => ipcRenderer.on('update-status', (e, info) => cb(info)),
  onStateChange: (cb) => ipcRenderer.on('state-changed', (e, state) => cb(state)),
  onTaskDoneFromNotif: (cb) => ipcRenderer.on('task-done-from-notif', (e, taskId) => cb(taskId)),
  onOpenTab: (cb) => ipcRenderer.on('open-tab', (e, tab) => cb(tab)),
  isElectron: true,
  platform: process.platform
});
