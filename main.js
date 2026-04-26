const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let tray = null;
let notifTimer = null;
let scheduledTimer = null;
let isQuitting = false;

// State partagé avec le renderer (synchronisé via IPC)
let state = {
  tasks: [],
  notes: '',
  game: {
    totalXP: 0,
    completedAllTime: 0,
    streak: 0,
    lastActiveDate: null,
    achievements: [],
    todayDate: null,
    todayCompleted: 0,
    todayHighDone: 0,
    todayCategoriesUsed: [],
    notifEnabled: false,
    notifIntervalMin: 90,
    autoStart: false,
    questCompletedDate: null,
    scheduledAlerts: [
      { id: 1, time: '17:50', label: 'Mettre à jour la liste pour les prochaines 24h', enabled: true, lastFiredDate: null },
      { id: 2, time: '18:50', label: 'Mettre à jour la liste pour les prochaines 24h', enabled: true, lastFiredDate: null }
    ]
  }
};

// === STORAGE ===
const dataPath = path.join(app.getPath('userData'), 'hustle-data.json');

function loadState() {
  try {
    if (fs.existsSync(dataPath)) {
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
      state = Object.assign(state, data);
      state.game = Object.assign(state.game, data.game || {});
    }
  } catch (e) { console.error('Load error:', e); }

  // Migration: ajout des scheduledAlerts par défaut pour anciennes versions
  if (!state.game.scheduledAlerts) {
    state.game.scheduledAlerts = [
      { id: 1, time: '17:50', label: 'Mettre à jour la liste pour les prochaines 24h', enabled: true, lastFiredDate: null },
      { id: 2, time: '18:50', label: 'Mettre à jour la liste pour les prochaines 24h', enabled: true, lastFiredDate: null }
    ];
    saveState();
  }
}

function saveState() {
  try {
    fs.writeFileSync(dataPath, JSON.stringify(state, null, 2));
  } catch (e) { console.error('Save error:', e); }
}

// === WINDOW ===
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 1000,
    minWidth: 380,
    minHeight: 600,
    title: 'HUSTLE.OS',
    backgroundColor: '#09090b',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Quand on clique X : cacher la fenêtre, ne pas quitter (pour que les notifs continuent)
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
      // Affichage d'une notification la première fois pour expliquer
      if (!state.game.toldAboutTray) {
        new Notification({
          title: 'HUSTLE.OS continue en arrière-plan',
          body: 'Clique sur l\'icône H dans la barre menu pour rouvrir.'
        }).show();
        state.game.toldAboutTray = true;
        saveState();
      }
      return false;
    }
  });

  // Liens externes ouvrent dans le navigateur par défaut
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// === TRAY (menu bar Mac / system tray Windows) ===
function createTray() {
  let trayIconPath;
  if (process.platform === 'darwin') {
    // Mac: Template image (auto invert dark/light)
    trayIconPath = path.join(__dirname, 'build', 'trayTemplate.png');
  } else {
    trayIconPath = path.join(__dirname, 'build', 'trayTemplate@2x.png');
  }

  const trayIcon = nativeImage.createFromPath(trayIconPath);
  if (process.platform === 'darwin') {
    trayIcon.setTemplateImage(true);
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('HUSTLE.OS');
  updateTrayMenu();

  tray.on('click', () => {
    if (process.platform !== 'darwin') {
      showWindow();
    }
  });
}

function updateTrayMenu() {
  if (!tray) return;
  const total = state.tasks.length;
  const done = state.tasks.filter(t => t.done).length;
  const undone = total - done;

  const menu = Menu.buildFromTemplate([
    { label: `📋 ${done}/${total} tâches faites`, enabled: false },
    { label: `🔥 Streak: ${state.game.streak} jour${state.game.streak > 1 ? 's' : ''}`, enabled: false },
    { label: `⭐ ${state.game.totalXP} XP`, enabled: false },
    { type: 'separator' },
    { label: 'Ouvrir HUSTLE.OS', click: showWindow, accelerator: 'CmdOrCtrl+Shift+H' },
    {
      label: state.game.notifEnabled
        ? `🔔 Notifs: ON (${state.game.notifIntervalMin}min)`
        : '🔕 Notifs: OFF',
      click: toggleNotifsFromTray
    },
    { type: 'separator' },
    {
      label: 'Démarrage automatique',
      type: 'checkbox',
      checked: state.game.autoStart || false,
      click: toggleAutoStart
    },
    { type: 'separator' },
    { label: 'Quitter', click: () => { isQuitting = true; app.quit(); } }
  ]);

  tray.setContextMenu(menu);
}

function showWindow() {
  if (!mainWindow) createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

// === NOTIFICATIONS ===
function buildCheckInMessage() {
  const total = state.tasks.length;
  const done = state.tasks.filter(t => t.done).length;
  const undone = total - done;
  const highUndone = state.tasks.filter(t => !t.done && t.priority === 'haute').length;

  if (total === 0) {
    return { title: '📋 HUSTLE.OS — rien de prévu', body: 'T\'as rien préparé pour demain. Ouvre l\'app.' };
  }
  if (done === total) {
    return { title: '🔥 HUSTLE.OS — TOUT EST FAIT', body: 'Sniper. T\'as pris de l\'avance ou tu poses ?' };
  }
  if (highUndone > 0) {
    return {
      title: `🚨 HUSTLE.OS — ${highUndone} prio en attente`,
      body: `${done}/${total} faites. T'as pris de l'avance ?`
    };
  }
  return {
    title: '⏰ HUSTLE.OS — Check-in',
    body: `${done}/${total} fait. T'as pris de l'avance ?`
  };
}

function triggerCheckIn() {
  const msg = buildCheckInMessage();
  const notif = new Notification({
    title: msg.title,
    body: msg.body,
    silent: false
  });
  notif.on('click', showWindow);
  notif.show();
  console.log('[Check-in]', msg.title);
}

function startNotifTimer() {
  stopNotifTimer();
  if (!state.game.notifEnabled) return;
  const intervalMs = (state.game.notifIntervalMin || 90) * 60 * 1000;
  notifTimer = setInterval(triggerCheckIn, intervalMs);
  console.log(`[Notifs] Timer started: every ${state.game.notifIntervalMin} min`);
}

function stopNotifTimer() {
  if (notifTimer) {
    clearInterval(notifTimer);
    notifTimer = null;
  }
}

// === SCHEDULED ALERTS (heures fixes type 17h50, 18h50, etc.) ===
function checkScheduledAlerts() {
  if (!state.game.scheduledAlerts || state.game.scheduledAlerts.length === 0) return;
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const today = now.toISOString().split('T')[0];

  for (const alert of state.game.scheduledAlerts) {
    if (!alert.enabled) continue;
    if (alert.time !== currentTime) continue;
    if (alert.lastFiredDate === today) continue; // déjà tirée aujourd'hui

    // Tire la notif
    const notif = new Notification({
      title: `⏰ ${alert.time} — HUSTLE.OS`,
      body: alert.label || 'Rappel programmé',
      silent: false
    });
    notif.on('click', showWindow);
    notif.show();
    console.log(`[Scheduled alert] ${alert.time}: ${alert.label}`);
    alert.lastFiredDate = today;
    saveState();
  }
}

function startScheduledTimer() {
  stopScheduledTimer();
  // Vérifie toutes les 30 secondes pour ne jamais rater une minute exacte
  scheduledTimer = setInterval(checkScheduledAlerts, 30 * 1000);
  console.log('[Scheduled] Timer started: check every 30s');
}

function stopScheduledTimer() {
  if (scheduledTimer) {
    clearInterval(scheduledTimer);
    scheduledTimer = null;
  }
}

function toggleNotifsFromTray() {
  state.game.notifEnabled = !state.game.notifEnabled;
  saveState();
  if (state.game.notifEnabled) {
    startNotifTimer();
    new Notification({
      title: 'HUSTLE.OS — Check-ins activés',
      body: `Toutes les ${state.game.notifIntervalMin} minutes.`
    }).show();
  } else {
    stopNotifTimer();
  }
  updateTrayMenu();
  if (mainWindow) mainWindow.webContents.send('state-changed', state);
}

// === AUTO-START ===
function toggleAutoStart() {
  const newVal = !state.game.autoStart;
  state.game.autoStart = newVal;
  app.setLoginItemSettings({
    openAtLogin: newVal,
    openAsHidden: true
  });
  saveState();
  updateTrayMenu();
}

// === IPC HANDLERS (renderer ↔ main) ===
ipcMain.handle('get-state', () => state);

ipcMain.handle('save-state', (event, newState) => {
  state = newState;
  saveState();
  updateTrayMenu();
  // Restart timer if interval changed
  if (state.game.notifEnabled) {
    startNotifTimer();
  } else {
    stopNotifTimer();
  }
  return true;
});

ipcMain.handle('toggle-notifs', () => {
  toggleNotifsFromTray();
  return state.game.notifEnabled;
});

ipcMain.handle('toggle-autostart', () => {
  toggleAutoStart();
  return state.game.autoStart;
});

ipcMain.handle('test-notification', () => {
  triggerCheckIn();
  return true;
});

ipcMain.handle('test-scheduled-alert', (event, alertId) => {
  const alert = state.game.scheduledAlerts.find(a => a.id === alertId);
  if (!alert) return false;
  const notif = new Notification({
    title: `⏰ ${alert.time} — HUSTLE.OS (test)`,
    body: alert.label || 'Rappel programmé',
    silent: false
  });
  notif.on('click', showWindow);
  notif.show();
  return true;
});

// === APP LIFECYCLE ===
app.whenReady().then(() => {
  loadState();

  // Restore auto-start setting
  app.setLoginItemSettings({
    openAtLogin: state.game.autoStart || false,
    openAsHidden: true
  });

  createWindow();
  createTray();

  // Restart timer if was enabled
  if (state.game.notifEnabled) {
    startNotifTimer();
  }

  // Toujours démarrer le timer des alertes programmées
  startScheduledTimer();

  // Mac: re-create window when dock icon clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else showWindow();
  });
});

// Mac: don't quit on close all windows (only via tray menu)
app.on('window-all-closed', (e) => {
  if (process.platform !== 'darwin') {
    // On Windows/Linux, keep running in tray
    e.preventDefault();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  saveState();
});
