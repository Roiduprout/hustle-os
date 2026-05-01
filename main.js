const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, nativeImage, shell, screen, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

let mainWindow = null;
let notifWindow = null;
let tray = null;
let notifTimer = null;
let scheduledTimer = null;
let isQuitting = false;

let state = {
  tasks: [],
  notes: '',
  routines: [],
  crm: { contacts: [] },
  game: {
    totalXP: 0, completedAllTime: 0, streak: 0, lastActiveDate: null,
    achievements: [], todayDate: null, todayCompleted: 0, todayHighDone: 0,
    todayCategoriesUsed: [], notifEnabled: false, notifIntervalMin: 90,
    autoStart: false, questCompletedDate: null,
    scheduledAlerts: [
      { id: 1, time: '17:50', label: 'Mettre à jour la liste pour les prochaines 24h', enabled: true, lastFiredDate: null },
      { id: 2, time: '18:50', label: 'Mettre à jour la liste pour les prochaines 24h', enabled: true, lastFiredDate: null }
    ]
  }
};

const dataPath = path.join(app.getPath('userData'), 'hustle-data.json');

function loadState() {
  try {
    if (fs.existsSync(dataPath)) {
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
      state = Object.assign(state, data);
      state.game = Object.assign(state.game, data.game || {});
    }
  } catch (e) { console.error('Load error:', e); }

  if (!state.game.scheduledAlerts) {
    state.game.scheduledAlerts = [
      { id: 1, time: '17:50', label: 'Mettre à jour la liste pour les prochaines 24h', enabled: true, lastFiredDate: null },
      { id: 2, time: '18:50', label: 'Mettre à jour la liste pour les prochaines 24h', enabled: true, lastFiredDate: null }
    ];
    saveState();
  }
  if (!state.routines) { state.routines = []; saveState(); }
  if (!state.crm) { state.crm = { contacts: [] }; saveState(); }
}

function saveState() {
  try { fs.writeFileSync(dataPath, JSON.stringify(state, null, 2)); }
  catch (e) { console.error('Save error:', e); }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800, height: 1000, minWidth: 380, minHeight: 600,
    title: 'HUSTLE.OS', backgroundColor: '#09090b',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false
    },
    show: false
  });
  mainWindow.loadFile('index.html');
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault(); mainWindow.hide();
      if (!state.game.toldAboutTray) {
        new Notification({ title: 'HUSTLE.OS continue en arrière-plan', body: 'Clique sur H dans la barre menu pour rouvrir.' }).show();
        state.game.toldAboutTray = true; saveState();
      }
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

function createTray() {
  let p = process.platform === 'darwin'
    ? path.join(__dirname, 'build', 'trayTemplate.png')
    : path.join(__dirname, 'build', 'trayTemplate@2x.png');
  const icon = nativeImage.createFromPath(p);
  if (process.platform === 'darwin') icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('HUSTLE.OS');
  updateTrayMenu();
  tray.on('click', () => { if (process.platform !== 'darwin') showWindow(); });
}

function updateTrayMenu() {
  if (!tray) return;
  const total = state.tasks.length;
  const done = state.tasks.filter(t => t.done).length;
  const undone = total - done;
  const pct = total > 0 ? Math.round(done / total * 100) : 0;

  const progressBar = total > 0
    ? '▓'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10))
    : '░░░░░░░░░░';

  const menu = Menu.buildFromTemplate([
    { label: total === 0 ? 'Aucune tâche planifiée' : done === total ? `✅ Tout validé ! (${total}/${total})` : `${progressBar}  ${pct}%`, enabled: false },
    { label: total > 0 && done < total ? `${undone} restante${undone > 1 ? 's' : ''} · ${done} validée${done > 1 ? 's' : ''}` : '', enabled: false, visible: total > 0 && done < total },
    { type: 'separator' },
    { label: `🔥 Streak ${state.game.streak} jour${state.game.streak > 1 ? 's' : ''}  ·  ⭐ ${state.game.totalXP} XP`, enabled: false },
    { type: 'separator' },
    { label: 'Ouvrir HUSTLE.OS', click: showWindow },
    { label: '💡 Capturer une idée  ⌘⇧H', click: () => { showWindow(); setTimeout(() => { if (mainWindow) mainWindow.webContents.send('open-tab', 'id'); }, 200); } },
    { label: 'Voir les tâches restantes', click: triggerCheckIn },
    {
      label: state.game.notifEnabled ? `🔔 Notifs ON (${state.game.notifIntervalMin} min)` : '🔕 Notifs OFF',
      click: toggleNotifsFromTray
    },
    { type: 'separator' },
    { label: 'Démarrage automatique', type: 'checkbox', checked: state.game.autoStart || false, click: toggleAutoStart },
    { type: 'separator' },
    { label: 'Quitter', click: () => { isQuitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(menu);
}

function showWindow() {
  if (!mainWindow) createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show(); mainWindow.focus();
}

// ── POPUP CUSTOM (remplace les notifs système Apple) ──
function showCustomNotif(data) {
  if (notifWindow && !notifWindow.isDestroyed()) {
    notifWindow.close();
    notifWindow = null;
  }

  const display = screen.getPrimaryDisplay();
  const { width } = display.workAreaSize;
  const winW = 400;
  const taskCount = data.tasks ? Math.min(data.tasks.length, 5) : 0;
  const winH = 165 + taskCount * 88 + (data.total > 0 ? 60 : 0);

  notifWindow = new BrowserWindow({
    width: winW, height: winH,
    x: width - winW - 12, y: 36,
    frame: false, transparent: true,
    alwaysOnTop: true, skipTaskbar: true,
    resizable: false, movable: false,
    webPreferences: {
      preload: path.join(__dirname, 'notif-preload.js'),
      contextIsolation: true, nodeIntegration: false
    },
    show: false
  });

  const encoded = encodeURIComponent(JSON.stringify(data));
  notifWindow.loadFile('notif.html', { query: { d: encoded } });
  notifWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  notifWindow.once('ready-to-show', () => {
    if (notifWindow && !notifWindow.isDestroyed()) notifWindow.showInactive();
  });

  setTimeout(() => {
    if (notifWindow && !notifWindow.isDestroyed()) { notifWindow.close(); notifWindow = null; }
  }, 10000);
}

ipcMain.on('notif-open-app', () => {
  if (notifWindow && !notifWindow.isDestroyed()) { notifWindow.close(); notifWindow = null; }
  showWindow();
});
ipcMain.on('notif-close', () => {
  if (notifWindow && !notifWindow.isDestroyed()) { notifWindow.close(); notifWindow = null; }
});

function triggerCheckIn() {
  const total = state.tasks.length;
  const done = state.tasks.filter(t => t.done).length;
  const undone = state.tasks.filter(t => !t.done);
  const priOrder = { haute: 0, moyenne: 1, basse: 2 };
  const undoneSort = [...undone].sort((a, b) => (priOrder[a.priority] || 1) - (priOrder[b.priority] || 1));

  if (total === 0) {
    showCustomNotif({ title: '📋 Aucune tâche planifiée', body: 'Ouvre l\'app pour préparer ta journée.', total: 0 });
    return;
  }
  if (done === total) {
    showCustomNotif({ title: '🔥 Tout est fait !', body: `${total}/${total} tâches validées. Excellent !`, total, done });
    return;
  }

  const tasks = undoneSort.map(t => ({
    id: t.id,
    text: t.text.length > 38 ? t.text.slice(0, 38) + '…' : t.text,
    priority: t.priority,
    icon: t.priority === 'haute' ? '🚨' : t.priority === 'moyenne' ? '⚡' : '📌'
  }));

  showCustomNotif({
    title: `⏰ ${undone.length} tâche${undone.length > 1 ? 's' : ''} restante${undone.length > 1 ? 's' : ''}`,
    tasks, total, done
  });
}

function startNotifTimer() {
  stopNotifTimer();
  if (!state.game.notifEnabled) return;
  const ms = (state.game.notifIntervalMin || 90) * 60 * 1000;
  notifTimer = setInterval(triggerCheckIn, ms);
}
function stopNotifTimer() { if (notifTimer) { clearInterval(notifTimer); notifTimer = null; } }

function checkScheduledAlerts() {
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const today = now.toISOString().split('T')[0];
  const dayNames = ['sun','mon','tue','wed','thu','fri','sat'];
  const todayDay = dayNames[now.getDay()];

  // Alertes ponctuelles
  if (state.game.scheduledAlerts) {
    for (const alert of state.game.scheduledAlerts) {
      if (!alert.enabled || alert.time !== currentTime || alert.lastFiredDate === today) continue;
      showCustomNotif({ title: `⏰ ${alert.time}`, body: alert.label || 'Rappel programmé', total: 0 });
      alert.lastFiredDate = today; saveState();
    }
  }

  // Routines quotidiennes
  if (state.routines) {
    for (const r of state.routines) {
      if (!r.enabled || r.time !== currentTime || r.lastNotifDate === today) continue;
      const days = r.days;
      if (days !== 'all' && Array.isArray(days) && !days.includes(todayDay)) continue;
      // Cherche la tâche correspondante dans state.tasks (ajoutée par le renderer)
      const matchTask = state.tasks.find(t => t.fromRoutine === r.id && !t.done);
      if (matchTask) {
        const icon = matchTask.priority === 'haute' ? '🚨' : matchTask.priority === 'moyenne' ? '⚡' : '📌';
        showCustomNotif({
          title: `🔁 ${r.name}`,
          tasks: [{ id: matchTask.id, text: matchTask.text.length > 38 ? matchTask.text.slice(0,38)+'…' : matchTask.text, priority: matchTask.priority, icon }],
          total: state.tasks.length,
          done: state.tasks.filter(t => t.done).length
        });
      } else {
        showCustomNotif({ title: `🔁 ${r.name}`, body: `C'est l'heure — tâche ajoutée à ta liste`, total: 0 });
      }
      r.lastNotifDate = today; saveState();
    }
  }
}

function startScheduledTimer() {
  stopScheduledTimer();
  scheduledTimer = setInterval(checkScheduledAlerts, 30 * 1000);
}
function stopScheduledTimer() { if (scheduledTimer) { clearInterval(scheduledTimer); scheduledTimer = null; } }

function toggleNotifsFromTray() {
  state.game.notifEnabled = !state.game.notifEnabled; saveState();
  if (state.game.notifEnabled) {
    startNotifTimer();
    showCustomNotif({ title: '🔔 Check-ins activés', body: `Rappel toutes les ${state.game.notifIntervalMin} minutes.`, total: 0 });
  } else { stopNotifTimer(); }
  updateTrayMenu();
  if (mainWindow) mainWindow.webContents.send('state-changed', state);
}

function toggleAutoStart() {
  state.game.autoStart = !state.game.autoStart;
  app.setLoginItemSettings({ openAtLogin: state.game.autoStart, openAsHidden: true });
  saveState(); updateTrayMenu();
}

// IPC
ipcMain.handle('get-state', () => state);
ipcMain.handle('save-state', (event, newState) => {
  state = newState; saveState(); updateTrayMenu();
  if (state.game.notifEnabled) startNotifTimer(); else stopNotifTimer();
  return true;
});
ipcMain.handle('toggle-notifs', () => { toggleNotifsFromTray(); return state.game.notifEnabled; });
ipcMain.handle('toggle-autostart', () => { toggleAutoStart(); return state.game.autoStart; });
ipcMain.handle('test-notification', () => { triggerCheckIn(); return true; });
ipcMain.handle('test-task-notif', (event, taskId) => {
  const t = state.tasks.find(x => x.id === taskId);
  if (!t) return false;
  const icon = t.priority === 'haute' ? '🚨' : t.priority === 'moyenne' ? '⚡' : '📌';
  showCustomNotif({
    title: `⏰ Rappel de tâche`,
    tasks: [{ id: t.id, text: t.text.length > 38 ? t.text.slice(0,38)+'…' : t.text, priority: t.priority, icon }],
    total: state.tasks.length,
    done: state.tasks.filter(x => x.done).length
  });
  return true;
});
ipcMain.handle('test-scheduled-alert', (event, alertId) => {
  const alert = state.game.scheduledAlerts.find(a => a.id === alertId);
  if (!alert) return false;
  showCustomNotif({ title: `⏰ ${alert.time} (test)`, body: alert.label || 'Rappel programmé', total: 0 });
  return true;
});
ipcMain.handle('test-routine', (event, routineId) => {
  const r = state.routines.find(x => x.id === routineId);
  if (!r) return false;
  const matchTask = state.tasks.find(t => t.fromRoutine === r.id && !t.done);
  if (matchTask) {
    const icon = matchTask.priority === 'haute' ? '🚨' : matchTask.priority === 'moyenne' ? '⚡' : '📌';
    showCustomNotif({
      title: `🔁 ${r.name} (test)`,
      tasks: [{ id: matchTask.id, text: matchTask.text.length > 38 ? matchTask.text.slice(0,38)+'…' : matchTask.text, priority: matchTask.priority, icon }],
      total: state.tasks.length,
      done: state.tasks.filter(t => t.done).length
    });
  } else {
    showCustomNotif({ title: `🔁 ${r.name} (test)`, body: `C'est l'heure — tâche ajoutée à ta liste`, total: 0 });
  }
  return true;
});
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('postpone-task-from-notif', (event, taskId) => {
  const t = state.tasks.find(x => x.id === taskId);
  if (!t) return false;
  // Trouver un créneau libre demain basé sur les routines
  const tomorrowDayIdx = (new Date().getDay() + 1) % 7;
  const busyMins = [];
  (state.routines || []).forEach(r => {
    if (!r.enabled || !r.time) return;
    if (r.days === 'all' || (Array.isArray(r.days) && r.days.includes(tomorrowDayIdx))) {
      const [h, m] = r.time.split(':').map(Number);
      busyMins.push(h * 60 + m);
    }
  });
  state.tasks.filter(x => x.time && x.id !== taskId).forEach(x => {
    const [h, m] = x.time.split(':').map(Number); busyMins.push(h * 60 + m);
  });
  let freeSlot = '10:00';
  outer: for (let h = 8; h <= 21; h++) {
    for (const m of [0, 30]) {
      const slot = h * 60 + m;
      if (!busyMins.some(b => Math.abs(b - slot) < 45)) {
        freeSlot = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`; break outer;
      }
    }
  }
  t.time = freeSlot;
  saveState();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('state-changed', state);
  return { slot: freeSlot };
});
ipcMain.handle('reschedule-task-time', (event, taskId, newTime) => {
  const t = state.tasks.find(x => x.id === taskId);
  if (!t) return false;
  t.time = newTime;
  saveState();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('state-changed', state);
  return true;
});
ipcMain.handle('done-task-from-notif', (event, taskId) => {
  const t = state.tasks.find(t => t.id === taskId);
  if (!t || t.done) return false;
  t.done = true;
  saveState(); updateTrayMenu();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('task-done-from-notif', taskId);
  return true;
});
ipcMain.handle('snooze-task', (event, taskId) => {
  const t = state.tasks.find(t => t.id === taskId);
  if (!t) return false;
  setTimeout(() => {
    const task = state.tasks.find(x => x.id === taskId);
    if (task && !task.done) {
      showCustomNotif({
        title: `⏰ Rappel — ${task.text.length > 32 ? task.text.slice(0, 32) + '…' : task.text}`,
        tasks: [{ id: task.id, text: task.text.length > 38 ? task.text.slice(0, 38) + '…' : task.text, priority: task.priority, icon: task.priority === 'haute' ? '🚨' : task.priority === 'moyenne' ? '⚡' : '📌' }],
        total: state.tasks.length,
        done: state.tasks.filter(t => t.done).length
      });
    }
  }, 30 * 60 * 1000);
  return true;
});

// Auto-update
let updateInProgress = false;
function setupAutoUpdater() {
  autoUpdater.on('checking-for-update', () => { if (mainWindow) mainWindow.webContents.send('update-status', { status: 'checking' }); });
  autoUpdater.on('update-available', (info) => { if (mainWindow) mainWindow.webContents.send('update-status', { status: 'available', version: info.version, currentVersion: app.getVersion() }); });
  autoUpdater.on('update-not-available', () => { if (mainWindow) mainWindow.webContents.send('update-status', { status: 'up-to-date', currentVersion: app.getVersion() }); });
  autoUpdater.on('error', (err) => { updateInProgress = false; if (mainWindow) mainWindow.webContents.send('update-status', { status: 'error', error: err.message }); });
  autoUpdater.on('download-progress', (p) => { if (mainWindow) mainWindow.webContents.send('update-status', { status: 'downloading', percent: Math.round(p.percent) }); });
  autoUpdater.on('update-downloaded', (info) => {
    updateInProgress = false;
    if (mainWindow) mainWindow.webContents.send('update-status', { status: 'downloaded', version: info.version });
    showCustomNotif({ title: `🎉 Mise à jour v${info.version} prête !`, body: 'Clique pour redémarrer et installer.', total: 0 });
  });
}
ipcMain.handle('check-for-updates', async () => {
  if (updateInProgress) return { status: 'busy' };
  try { await autoUpdater.checkForUpdates(); return { status: 'ok', currentVersion: app.getVersion() }; }
  catch (e) { return { status: 'error', error: e.message }; }
});
ipcMain.handle('download-update', async () => {
  if (updateInProgress) return { status: 'busy' };
  updateInProgress = true;
  try { await autoUpdater.downloadUpdate(); return { status: 'started' }; }
  catch (e) { updateInProgress = false; return { status: 'error', error: e.message }; }
});
ipcMain.handle('install-update', () => autoUpdater.quitAndInstall());

app.whenReady().then(() => {
  loadState();
  app.setLoginItemSettings({ openAtLogin: state.game.autoStart || false, openAsHidden: true });
  createWindow(); createTray();
  if (state.game.notifEnabled) startNotifTimer();
  startScheduledTimer();
  setupAutoUpdater();
  setTimeout(() => { autoUpdater.checkForUpdates().catch(() => {}); }, 10000);

  globalShortcut.register('CommandOrControl+Shift+H', () => {
    showWindow();
    setTimeout(() => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('open-tab', 'id'); }, 200);
  });

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); else showWindow(); });
});

app.on('window-all-closed', (e) => { if (process.platform !== 'darwin') e.preventDefault(); });
app.on('before-quit', () => { isQuitting = true; globalShortcut.unregisterAll(); saveState(); });
