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
const roomStatus = $('#roomStatus');
const groupSticker = $('#groupSticker');
const groupStickerPanel = $('#groupStickerPanel');
const groupStickerGrid = $('#groupStickerGrid');
const groupImportStickers = $('#groupImportStickers');
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

function resolveMedia(url) {
  const raw = String(url || '');
  if (!raw) return '';
  if (/^https?:/i.test(raw)) return raw;
  return `${session?.base || ''}${raw}`;
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
  for (const media of msg.media || []) {
    if (media.kind === 'voice') {
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.src = resolveMedia(media.url);
      text.append(audio);
    } else {
      const img = document.createElement('img');
      img.src = resolveMedia(media.url);
      img.alt = media.kind === 'sticker' ? '[表情]' : '[图片]';
      text.append(img);
    }
  }
  if (!text.childNodes.length) return;
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
    } else if (member.ai) {
      const badge = document.createElement('small');
      badge.textContent = 'AI';
      row.append(badge);
    }
    memberList.append(row);
  }
}

async function poll() {
  if (!session) return;
  try {
    const url = `${session.base}/api/room/state?roomId=${encodeURIComponent(session.roomId)}&token=${encodeURIComponent(session.token)}&clientId=${encodeURIComponent(session.clientId)}&memberSecret=${encodeURIComponent(session.memberSecret || '')}&since=${lastAt}`;
    const res = await api(url, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '连接失败');
    setConn(true);
    roomTitle.textContent = data.room?.name || session.roomName || '房间';
    inviteCode.value = session.invite || '';
    updateMembers(data.members || []);
    if (aiToggle) {
      aiToggle.hidden = !session.host;
      aiToggle.textContent = data.aiEnabled ? 'AI 已开' : 'AI 加入';
      aiToggle.classList.toggle('on', Boolean(data.aiEnabled));
    }
    for (const message of data.messages || []) appendMessage(message);
  } catch (error) {
    setConn(false, '连接断开');
    if (roomStatus) roomStatus.textContent = String(error.message || error);
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
  if (roomStatus) roomStatus.textContent = '';
  if (aiToggle) aiToggle.hidden = !info.host;
  if (aiToggle) aiToggle.textContent = info.aiEnabled ? 'AI 已开' : 'AI 加入';
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
    const res = await api('http://127.0.0.1:3210/api/room/create', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: roomName, memberName: name, clientId: clientId() })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '开房失败');
    const info = {
      base: 'http://127.0.0.1:3210',
      roomId: data.roomId, token: data.token, clientId: clientId(), memberSecret: data.memberSecret,
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
    const res = await api(`${base}/api/room/join`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roomId, token, name, clientId: clientId(), memberSecret: session?.roomId === roomId ? session.memberSecret : '' })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '加入失败');
    const info = {
      base, roomId, token, clientId: clientId(), memberSecret: data.memberSecret,
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

async function sendMessage(event, media = []) {
  event?.preventDefault();
  const text = messageInput.value.trim();
  if ((!text && !media.length) || !session) return;
  const draft = messageInput.value;
  try {
    const res = await api(`${session.base}/api/room/send`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roomId: session.roomId, token: session.token, clientId: session.clientId, memberSecret: session.memberSecret, text, media })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '发送失败');
    if (messageInput.value === draft) {
      messageInput.value = '';
      messageInput.style.height = 'auto';
    }
    if (data.message) { appendMessage(data.message); if (roomStatus) roomStatus.textContent = ''; }
  } catch (error) {
    if (!messageInput.value) { messageInput.value = draft; messageInput.style.height = 'auto'; }
    if (roomStatus) roomStatus.textContent = String(error.message || error);
  }
}

async function uploadRoomMedia(file, kind = 'image') {
  if (!session) return null;
  if (file.size > 18 * 1024 * 1024) throw new Error('文件太大');
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(reader.error || new Error('读取失败'));
    reader.readAsDataURL(file);
  });
  const res = await api(`${session.base}/api/room/media`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ roomId: session.roomId, token: session.token, clientId: session.clientId, memberSecret: session.memberSecret, kind, data, mime: file.type || '', name: file.name || '' })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || '上传失败');
  return body.media;
}

async function sendRoomFile(file, kind = 'image') {
  if (roomStatus) roomStatus.textContent = kind === 'voice' ? '正在发送语音…' : '正在发送图片…';
  try {
    const media = await uploadRoomMedia(file, kind);
    if (media) await sendMessage(null, [media]);
    if (roomStatus) roomStatus.textContent = '';
  } catch (error) {
    if (roomStatus) roomStatus.textContent = String(error.message || error);
  }
}

document.addEventListener('paste', async (event) => {
  const items = [...(event.clipboardData?.items || [])];
  const file = items.find((item) => item.type.startsWith('image/'))?.getAsFile();
  if (!file) return;
  event.preventDefault();
  await sendRoomFile(file, 'image');
});

let groupDragDepth = 0;
document.addEventListener('dragenter', (event) => {
  event.preventDefault();
  groupDragDepth += 1;
  $('#groupDrop')?.classList.add('show');
});
document.addEventListener('dragover', (event) => event.preventDefault());
document.addEventListener('dragleave', (event) => {
  event.preventDefault();
  groupDragDepth = Math.max(0, groupDragDepth - 1);
  if (!groupDragDepth) $('#groupDrop')?.classList.remove('show');
});
document.addEventListener('drop', async (event) => {
  event.preventDefault();
  groupDragDepth = 0;
  $('#groupDrop')?.classList.remove('show');
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  const kind = file.type.startsWith('audio/') || /\.(wav|mp3|ogg|m4a|amr|webm)$/i.test(file.name) ? 'voice' : 'image';
  await sendRoomFile(file, kind);
});

let groupRecorder = null;
let groupChunks = [];
let groupRecording = false;
async function startGroupVoice() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { if (roomStatus) roomStatus.textContent = '这个窗口不能录音。'; return; }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find((type) => MediaRecorder.isTypeSupported(type)) || '';
  groupChunks = [];
  groupRecorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  groupRecorder.ondataavailable = (event) => { if (event.data?.size) groupChunks.push(event.data); };
  groupRecorder.onstop = async () => {
    for (const track of stream.getTracks()) track.stop();
    groupRecording = false;
    const button = $('#groupVoice');
    button?.classList.remove('recording');
    if (button) button.textContent = '说话';
    const blob = new Blob(groupChunks, { type: groupRecorder?.mimeType || 'audio/webm' });
    groupChunks = [];
    groupRecorder = null;
    if (blob.size < 800) { if (roomStatus) roomStatus.textContent = '太短了。'; return; }
    await sendRoomFile(new File([blob], 'voice.webm', { type: blob.type || 'audio/webm' }), 'voice');
  };
  groupRecorder.start();
  groupRecording = true;
  $('#groupVoice')?.classList.add('recording');
  const button = $('#groupVoice');
  if (button) button.textContent = '停止';
  if (roomStatus) roomStatus.textContent = '录音中… 再点一下停止';
}
$('#groupVoice')?.addEventListener('click', async () => {
  if (groupRecording) { try { groupRecorder?.stop(); } catch {} return; }
  try { await startGroupVoice(); } catch (error) { if (roomStatus) roomStatus.textContent = String(error.message || error); groupRecording = false; }
});

async function loadGroupStickers() {
  if (!groupStickerGrid) return;
  groupStickerGrid.textContent = '读取中…';
  try {
    const res = await api('/api/media/list?scope=user', { cache: 'no-store' });
    const data = await res.json();
    const items = (data.items || []).filter((item) => item.kind === 'sticker' || item.kind === 'image');
    groupStickerGrid.replaceChildren();
    if (!items.length) {
      const hint = document.createElement('div');
      hint.className = 'group-sticker-empty';
      hint.textContent = '还没有表情。先导入 QQ 表情。';
      groupStickerGrid.append(hint);
      return;
    }
    for (const item of items) {
      const img = document.createElement('img');
      img.src = item.url;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.alt = item.name || '表情';
      img.title = item.name || '表情';
      img.addEventListener('click', async () => {
        groupStickerPanel.hidden = true;
        try {
          const res = await api(item.url);
          const blob = await res.blob();
          const file = new File([blob], item.name || 'sticker.jpg', { type: item.mime || blob.type || 'image/jpeg' });
          await sendRoomFile(file, item.kind === 'sticker' ? 'sticker' : 'image');
        } catch (error) {
          if (roomStatus) roomStatus.textContent = String(error.message || error);
        }
      });
      groupStickerGrid.append(img);
    }
  } catch (error) {
    groupStickerGrid.textContent = String(error.message || error);
  }
}

groupSticker?.addEventListener('click', async () => {
  if (!groupStickerPanel) return;
  const show = groupStickerPanel.hidden;
  groupStickerPanel.hidden = !show;
  if (show) await loadGroupStickers();
});

groupImportStickers?.addEventListener('click', async () => {
  const button = groupImportStickers;
  button.disabled = true;
  button.textContent = '导入中…';
  try {
    const res = await api('/api/stickers/import-qq', { method: 'POST' });
    if (!res.ok) throw new Error('导入失败');
    for (let i = 0; i < 10; i += 1) {
      await new Promise((r) => setTimeout(r, 1500));
      await loadGroupStickers();
      if (i >= 2) break;
    }
    button.textContent = '已导入';
  } catch (error) {
    if (roomStatus) roomStatus.textContent = String(error.message || error);
    button.textContent = '导入失败';
  } finally {
    setTimeout(() => { button.disabled = false; button.textContent = '导入 QQ 表情'; }, 3500);
  }
});

document.addEventListener('click', (event) => {
  if (!groupStickerPanel || groupStickerPanel.hidden) return;
  if (groupStickerPanel.contains(event.target) || groupSticker?.contains(event.target)) return;
  groupStickerPanel.hidden = true;
});

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
$('#aiToggle')?.addEventListener('click', async () => {
  if (!session?.host || !aiToggle) return;
  aiToggle.disabled = true;
  try {
    const res = await api(`${session.base}/api/room/ai`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        roomId: session.roomId,
        token: session.token,
        clientId: session.clientId,
        memberSecret: session.memberSecret,
        enabled: !aiToggle.classList.contains('on')
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'AI 开关失败');
    aiToggle.textContent = data.enabled ? 'AI 已开' : 'AI 加入';
    aiToggle.classList.toggle('on', Boolean(data.enabled));
    await poll();
  } catch (error) {
    if (roomStatus) roomStatus.textContent = String(error.message || error);
  } finally {
    aiToggle.disabled = false;
  }
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
if (session?.roomId && session.memberSecret) showRoom(session);
else if (session) saveSession(null);
