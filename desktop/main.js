const { app, BrowserWindow, Tray, Menu, nativeImage, shell, screen, session, Notification } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const { spawn } = require('node:child_process');

function findRoot(start) {
  let dir = start;
  for (let i = 0; i < 4; i += 1) {
    if (fs.existsSync(path.join(dir, 'scripts', 'start-core.ps1'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return '';
}
const packagedDir = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(app.getPath('exe'));
const KNOWN_ROOT = 'E:\\deepseek_qq.bot\\qq-bridge-v2';
const ROOT = process.env.QQ_BRIDGE_ROOT
  || findRoot(app.isPackaged ? packagedDir : path.dirname(__dirname))
  || (fs.existsSync(path.join(KNOWN_ROOT, 'scripts', 'start-core.ps1')) ? KNOWN_ROOT : '')
  || path.dirname(__dirname);
fs.appendFileSync(path.join(require('node:os').tmpdir(), 'xiaoyu-desktop.log'), 'root=' + ROOT + ' portable=' + (process.env.PORTABLE_EXECUTABLE_DIR || '') + '\n');
const PANEL = process.env.QQ_BRIDGE_PANEL || 'http://127.0.0.1:3201/next/';
const ICON = app.isPackaged ? path.join(process.resourcesPath, 'icon.png') : path.join(__dirname, 'assets', 'icon.png');
const STATE_FILE = path.join(ROOT, 'state', 'desktop-window.json');
let win = null;
let chatWindow = null;
let tray = null;
let quitting = false;
let unread = 0;
let lastAssistantAt = 0;
let notificationReady = false;
app.setAppUserModelId('com.xiaoyu.panel');
Menu.setApplicationMenu(null);

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const done = (v) => { try { socket.destroy(); } catch {} resolve(v); };
    socket.setTimeout(900);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

async function waitPort(port, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await portOpen(port)) return true;
    await new Promise((r) => setTimeout(r, 700));
  }
  return false;
}

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}
function saveState() {
  if (!win) return;
  try {
    const b = win.getBounds();
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(b) + '\n', 'utf8');
  } catch {}
}

function startCore() {
  const logFile = path.join(require('node:os').tmpdir(), 'xiaoyu-desktop.log');
  const index = path.join(ROOT, 'src', 'index.js');
  fs.appendFileSync(logFile, 'startCore index=' + index + ' exists=' + fs.existsSync(index) + '\n');
  if (!fs.existsSync(index)) return;
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const node = process.env.NODE_EXE || 'node.exe';
  const child = spawn(node, ['src/index.js'], {
    cwd: ROOT, detached: true, stdio: 'ignore', windowsHide: true, env
  });
  child.on('error', (error) => fs.appendFileSync(logFile, 'startCore error=' + String(error) + '\n'));
  child.on('exit', (code) => fs.appendFileSync(logFile, 'startCore exit=' + code + '\n'));
  fs.appendFileSync(logFile, 'startCore pid=' + child.pid + '\n');
  child.unref();
}

async function ensurePanel() {
  if (await portOpen(3201)) return true;
  startCore();
  return waitPort(3201, 35000);
}

function desktopLog(message) {
  try { fs.appendFileSync(path.join(require('node:os').tmpdir(), 'xiaoyu-desktop.log'), `${new Date().toISOString()} ${message}\n`); } catch {}
}

function updateTrayMenu() {
  if (!tray) return;
  tray.setToolTip(unread ? `小鲸鱼 · ${unread} 条未读` : '小鲸鱼');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示面板', click: () => { if (win) { win.show(); win.focus(); } } },
    { label: unread ? `和小鲸鱼说话（${unread}）` : '和小鲸鱼说话', click: showChat },
    { label: '群聊', click: () => { if (win) { win.show(); win.webContents.executeJavaScript("window.open('/next/group.html','xiaoyu-group','width=1100,height=820')"); } } },
    { label: '隐藏到托盘', click: () => { if (win) win.hide(); } },
    { type: 'separator' },
    { label: '退出', click: () => { quitting = true; app.quit(); } }
  ]));
}

function clearUnread() {
  if (!unread) return;
  unread = 0;
  updateTrayMenu();
}

function showChat() {
  if (chatWindow && !chatWindow.isDestroyed()) {
    if (chatWindow.isMinimized()) chatWindow.restore();
    chatWindow.show();
    chatWindow.focus();
    clearUnread();
    return;
  }
  if (!win) return;
  win.webContents.executeJavaScript("window.open('/next/local.html','xiaoyu-chat','width=680,height=860')").catch(() => {});
}

function notifyReply(text, count) {
  desktopLog('notify_check supported=' + Notification.isSupported());
  if (!Notification.isSupported()) return;
  const body = String(text || '她发来一条消息').replace(/\s+/g, ' ').slice(0, 120);
  try {
    const notification = new Notification({
      title: count > 1 ? `小鲸鱼 · ${count} 条新消息` : '小鲸鱼',
      body,
      icon: ICON,
      silent: false
    });
    notification.on('click', showChat);
    notification.show();
    desktopLog(`notify unread=${unread} body=${body}`);
  } catch (error) {
    desktopLog('notify_failed ' + String(error));
  }
}

async function pollLocalHistory() {
  try {
    const res = await fetch(new URL('/api/local/history', PANEL), { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return;
    const data = await res.json();
    const turns = Array.isArray(data.turns) ? data.turns : [];
    const assistants = turns.filter((turn) => turn.role === 'assistant');
    if (!assistants.length) return;
    const latest = Number(assistants[assistants.length - 1].at || 0);
    desktopLog('poll latest=' + latest + ' last=' + lastAssistantAt + ' ready=' + notificationReady);
    if (!notificationReady) {
      lastAssistantAt = latest;
      notificationReady = true;
      return;
    }
    if (latest < lastAssistantAt) {
      lastAssistantAt = latest;
      return;
    }
    if (latest <= lastAssistantAt) return;
    const fresh = assistants.filter((turn) => Number(turn.at || 0) > lastAssistantAt);
    lastAssistantAt = latest;
    if (!fresh.length) return;
    const focused = chatWindow && !chatWindow.isDestroyed() && chatWindow.isVisible() && chatWindow.isFocused();
    if (focused) { clearUnread(); return; }
    unread += fresh.length;
    updateTrayMenu();
    notifyReply(fresh[fresh.length - 1].text || '发来一张图或一段语音', unread);
  } catch (error) { desktopLog('poll_failed ' + String(error)); }
}

function startLocalWatcher() {
  pollLocalHistory();
  setInterval(pollLocalHistory, 2500);
}

function createWindow() {
  const saved = readState();
  const area = screen.getPrimaryDisplay().workArea;
  const width = Math.min(Math.max(Number(saved.width) || 1280, 900), area.width);
  const height = Math.min(Math.max(Number(saved.height) || 820, 600), area.height);
  const x = Number.isFinite(saved.x) ? Math.min(Math.max(saved.x, area.x), area.x + area.width - width) : undefined;
  const y = Number.isFinite(saved.y) ? Math.min(Math.max(saved.y, area.y), area.y + area.height - height) : undefined;

  win = new BrowserWindow({
    width, height, x, y,
    minWidth: 900, minHeight: 600,
    title: '小鲸鱼',
    icon: ICON,
    backgroundColor: '#08111f',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });
  win.setMenuBarVisibility(false);
  win.removeMenu();
  win.setTitle('小鲸鱼');
  win.webContents.on('page-title-updated', (event) => { event.preventDefault(); win.setTitle('小鲸鱼'); });
  win.webContents.on('did-create-window', (child) => {
    child.webContents.once('did-finish-load', () => {
      if (!String(child.webContents.getURL()).includes('/next/local.html')) return;
      chatWindow = child;
      child.on('closed', () => { chatWindow = null; });
      child.on('focus', clearUnread);
      child.on('show', clearUnread);
    });
  });
  win.once('ready-to-show', () => { win.show(); win.focus(); });
  win.on('resize', saveState);
  win.on('move', saveState);
  win.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    win.hide();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const base = new URL(PANEL);
      const target = new URL(url);
      if (target.origin === base.origin) {
        const isGroup = target.pathname.includes('/group.html');
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: isGroup ? 1100 : 680,
            height: isGroup ? 820 : 860,
            minWidth: isGroup ? 760 : 420,
            minHeight: isGroup ? 560 : 560,
            title: isGroup ? '小鲸鱼群聊' : '和小鲸鱼说话',
            backgroundColor: isGroup ? '#050a12' : '#060b14',
            autoHideMenuBar: true,
            webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
          }
        };
      }
    } catch {}
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  ensurePanel().then((ok) => {
    if (!win) return;
    if (ok) win.loadURL(PANEL).then(() => { win.show(); win.focus(); }).catch(() => {});
    else win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<body style="background:#08111f;color:#e8c47c;font-family:Segoe UI;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h2>主服务没起来</h2><p>3201 没有监听。</p><button onclick="location.href=\'' + PANEL + '\'" style="padding:8px 18px">重试</button></div></body>'));
  });
}

function buildTray() {
  const iconPath = ICON;
  let icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) return;
  icon = icon.resize({ width: 18, height: 18 });
  tray = new Tray(icon);
  updateTrayMenu();
  tray.on('double-click', () => { if (win) { win.show(); win.focus(); } });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });
  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      callback(permission === 'media');
    });
    session.defaultSession.setPermissionCheckHandler((webContents, permission) => permission === 'media');
    createWindow();
    buildTray();
    startLocalWatcher();
    app.on('activate', () => { if (win) win.show(); });
  });
  app.on('before-quit', () => { quitting = true; });
  app.on('window-all-closed', (event) => { event.preventDefault(); });
}
