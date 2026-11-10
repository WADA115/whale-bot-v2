const $ = (sel) => document.querySelector(sel);
const landing = $('#landing');
const chatView = $('#chatView');
const messagesEl = $('#messages');
const memberList = $('#memberList');
const memberCount = $('#memberCount');
const roomTitle = $('#roomTitle');
const inviteCode = $('#inviteCode');
const connState = $('#connState');
const formStatus = $('#formStatus');
const leaveRoom = $('#leaveRoom');
const messageInput = $('#messageInput');
let session = null;
let pollTimer = null;
let lastAt = 0;
let lastMessageIds = new Set();
let mode = 'create';

function clientId() {
  let id = localStorage.getItem('xiaoyu-room-client');
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('xiaoyu-room-client', id); }
  return id;
}

function saveSession(value) {
  session = value;
  if (value) localStorage.setItem('xiaoyu-room-session', JSON.stringify(value));
  else localStorage.removeItem('xiaoyu-room-session');
}

function setConn(ok, text = '') {
  connState.classList.toggle('on', ok);
  connState.innerHTML = `<i></i>${text || (ok ? '已连接' : '未连接')}`;
}

function fmtTime(at) {
  return new Date(Number(at) || Date.now()).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function appendMessage(msg) {
  if (!msg || lastMessageIds.has(msg.id)) return;
  lastMessageIds.add(msg.id);
  const own = msg.clientId === session?.clientId;
  const wrap = document.createElement('div');
  wrap.className = `msg${own ? ' own' : ''}`;
  const who = document.createElement('p');
  who.className = 'who';
  who.textContent = own ? '你' : (msg.name || '成员');
  const text = document.createElement('div');
  text.className = 'text';
  text.textContent = String(msg.text || '');
  const time = document.createElement('div');
  time.className = 'time';
  time.textContent = fmtTime(msg.at);
  wrap.append(who, text, time);
  messagesEl.append(wrap);
  lastAt = Math.max(lastAt, Number(msg.at) || 0);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function updateMembers(members = []) {
  memberCount.textContent = String(members.length);
  memberList.replaceChildren();
  for (const member of members) {
    const row = document.createElement('div');
    row.className = 'member';
    const dot = document.createElement('i');
    const name = document.createElement('span');
    name.textContent = member.name || '成员';
    row.append(dot, name);
    if (member.host) {
      const badge = document.createElement('small');
      badge.textContent = '房主';
      row.append(badge);
    }
    memberList.append(row);
  }
}

async function poll() {
  if (!session) return;
  try {
    const url = `${session.base}/api/room/state?roomId=${encodeURIComponent(session.roomId)}&token=${encodeURIComponent(session.token)}&clientId=${encodeURIComponent(session.clientId)}&since=${lastAt}`;
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '连接失败');
    setConn(true);
    roomTitle.textContent = data.room?.name || session.roomName || '房间';
    inviteCode.value = session.invite || '';
    updateMembers(data.members || []);
    for (const message of data.messages || []) appendMessage(message);
  } catch (error) {
    setConn(false, '连接断开');
    if (formStatus) formStatus.textContent = String(error.message || error);
  }
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  poll();
  pollTimer = setInterval(poll, 1200);
}

function showRoom(info) {
  landing.hidden = true;
  chatView.hidden = false;
  leaveRoom.hidden = false;
  roomTitle.textContent = info.roomName || '房间';
  inviteCode.value = info.invite || '';
  updateMembers(info.members || []);
  startPolling();
}

async function createRoom() {
  const name = $('#hostName').value.trim() || '房主';
  const roomName = $('#roomName').value.trim() || '新房间';
  localStorage.setItem('xiaoyu-room-name', name);
  formStatus.textContent = '正在开房…';
  try {
    const res = await fetch('http://127.0.0.1:3210/api/room/create', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: roomName, memberName: name, clientId: clientId() })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '开房失败');
    const info = {
      base: 'http://127.0.0.1:3210',
      roomId: data.roomId, token: data.token, clientId: clientId(),
      roomName, invite: data.invite, host: true,
      members: [{ id: clientId(), name, host: true }]
    };
    saveSession(info);
    formStatus.textContent = '';
    showRoom(info);
  } catch (error) {
    formStatus.textContent = String(error.message || error);
  }
}

async function joinRoom() {
  const name = $('#guestName').value.trim() || '客人';
  const raw = $('#inviteInput').value.trim();
  localStorage.setItem('xiaoyu-room-name', name);
  const match = raw.match(/^([^:#\s]+):(\d+)#([^#\s]+)#(.+)$/);
  if (!match) { formStatus.textContent = '邀请码格式不对：IP:端口#房间号#邀请码'; return; }
  const [, host, port, roomId, token] = match;
  formStatus.textContent = '正在加入…';
  try {
    const base = `http://${host}:${port}`;
    const res = await fetch(`${base}/api/room/join`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roomId, token, name, clientId: clientId() })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '加入失败');
    const info = {
      base, roomId, token, clientId: clientId(),
      roomName: data.name || '房间', invite: raw, host: false,
      members: [data.member].filter(Boolean)
    };
    saveSession(info);
    formStatus.textContent = '';
    showRoom(info);
  } catch (error) {
    formStatus.textContent = String(error.message || error);
  }
}

async function sendMessage(event) {
  event?.preventDefault();
  const text = messageInput.value.trim();
  if (!text || !session) return;
  messageInput.value = '';
  messageInput.style.height = 'auto';
  try {
    const res = await fetch(`${session.base}/api/room/send`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roomId: session.roomId, token: session.token, clientId: session.clientId, text })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '发送失败');
    if (data.message) appendMessage(data.message);
  } catch (error) {
    formStatus.textContent = String(error.message || error);
  }
}

document.querySelectorAll('.mode').forEach((button) => {
  button.addEventListener('click', () => {
    mode = button.dataset.mode || 'create';
    document.querySelectorAll('.mode').forEach((x) => x.classList.toggle('active', x === button));
    $('#createPane').hidden = mode !== 'create';
    $('#joinPane').hidden = mode !== 'join';
    formStatus.textContent = '';
  });
});

$('#createRoom').addEventListener('click', createRoom);
$('#joinRoom').addEventListener('click', joinRoom);
$('#composer').addEventListener('submit', sendMessage);
messageInput.addEventListener('input', () => {
  messageInput.style.height = 'auto';
  messageInput.style.height = `${Math.min(150, messageInput.scrollHeight)}px`;
});
messageInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); }
});
$('#copyInvite').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(inviteCode.value); $('#copyInvite').textContent = '已复制'; setTimeout(() => { $('#copyInvite').textContent = '复制邀请'; }, 1400); } catch {}
});
leaveRoom.addEventListener('click', () => {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  saveSession(null);
  lastAt = 0;
  lastMessageIds = new Set();
  messagesEl.replaceChildren();
  chatView.hidden = true;
  leaveRoom.hidden = true;
  landing.hidden = false;
  $('#createPane').hidden = false;
  $('#joinPane').hidden = true;
  setConn(false);
});

const saved = localStorage.getItem('xiaoyu-room-name') || '';
$('#hostName').value = saved;
$('#guestName').value = saved;
try { session = JSON.parse(localStorage.getItem('xiaoyu-room-session') || 'null'); } catch { session = null; }
if (session?.roomId) showRoom(session);
