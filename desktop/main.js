const { app, BrowserWindow, Tray, Menu, nativeImage, shell, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const { spawn } = require('node:child_process');

const ROOT = process.env.QQ_BRIDGE_ROOT || path.dirname(__dirname);
const PANEL = process.env.QQ_BRIDGE_PANEL || 'http://127.0.0.1:3201/next/';
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
  const script = path.join(ROOT, 'scripts', 'start-core.ps1');
  if (!fs.existsSync(script)) return;
  const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], {
    cwd: ROOT, detached: true, stdio: 'ignore', windowsHide: true
  });
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
  const iconPath = path.join(ROOT, 'web', 'next', 'preview.png');
  let icon = nativeImage.createFromPath(iconPath);
  if (!icon.isEmpty()) icon = icon.resize({ width: 18, height: 18 });
  tray = new Tray(icon);
  tray.setToolTip('小鲸鱼');
  const menu = Menu.buildFromTemplate([
    { label: '显示面板', click: () => { if (win) { win.show(); win.focus(); } } },
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
