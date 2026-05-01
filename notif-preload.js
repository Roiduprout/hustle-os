const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('notifAPI', {
  openApp:        () => ipcRenderer.send('notif-open-app'),
  close:          () => ipcRenderer.send('notif-close'),
  doneTask:       (id) => ipcRenderer.invoke('done-task-from-notif', id),
  snoozeTask:     (id) => ipcRenderer.invoke('snooze-task', id),
  postponeTask:   (id) => ipcRenderer.invoke('postpone-task-from-notif', id),
  rescheduleTask: (id, time) => ipcRenderer.invoke('reschedule-task-time', id, time)
});
