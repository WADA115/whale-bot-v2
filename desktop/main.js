const { app, BrowserWindow, Tray, Menu, nativeImage, shell, screen } = require('electron');
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
let tray = null;
let quitting = false;
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
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 680, height: 860, minWidth: 420, minHeight: 560,
            title: '和小鲸鱼说话',
            backgroundColor: '#060b14',
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
  tray.setToolTip('小鲸鱼');
  const menu = Menu.buildFromTemplate([
    { label: '显示面板', click: () => { if (win) { win.show(); win.focus(); } } },
    { label: '和小鲸鱼说话', click: () => { if (win) { win.show(); win.webContents.executeJavaScript("window.open('/next/local.html','xiaoyu-chat','width=680,height=860')"); } } },
    { label: '隐藏到托盘', click: () => { if (win) win.hide(); } },
    { type: 'separator' },
    { label: '退出', click: () => { quitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(menu);
  tray.on('double-click', () => { if (win) { win.show(); win.focus(); } });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });
  app.whenReady().then(() => {
    createWindow();
    buildTray();
    app.on('activate', () => { if (win) win.show(); });
  });
  app.on('before-quit', () => { quitting = true; });
  app.on('window-all-closed', (event) => { event.preventDefault(); });
}
