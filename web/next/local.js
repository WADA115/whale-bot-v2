const $ = (sel) => document.querySelector(sel);
const log = $('#chatLog');
const form = $('#chatForm');
const input = $('#chatInput');
const send = $('#chatSend');
const typing = $('#typing');
const status = $('#chatStatus');
const empty = $('#chatEmpty');
const filePick = $('#filePick');
let busy = false;
let pickKind = 'image';

function append(role, text, segments = []) {
  if (empty) empty.remove();
  const msg = document.createElement('div');
  msg.className = `msg ${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  if (text) {
    const copy = document.createElement('div');
    copy.textContent = text;
    bubble.append(copy);
  }

  for (const segment of segments || []) {
    if (segment.kind === 'voice' && segment.url) {
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.src = segment.url;
      bubble.append(audio);
    } else if ((segment.kind === 'image' || segment.kind === 'sticker') && segment.url) {
      const img = document.createElement('img');
      img.src = segment.url;
      img.alt = segment.kind === 'sticker' ? '[表情]' : '[图片]';
      bubble.append(img);
    }
  }

  if (!bubble.childNodes.length) return;
  msg.append(bubble);
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  msg.append(meta);
  log.append(msg);
  log.scrollTop = log.scrollHeight;
}

function resize() {
  input.style.height = 'auto';
  input.style.height = `${Math.min(160, input.scrollHeight)}px`;
}

function readBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(reader.error || new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

async function upload(file, kind) {
  if (!file) return null;
  if (file.size > 18 * 1024 * 1024) throw new Error('文件太大');
  status.textContent = '正在放进本地库…';
  const data = await readBase64(file);
  const res = await fetch('/api/local/upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind, data, mime: file.type || '', name: file.name || '' })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || '保存失败');
  status.textContent = '';
  return body.item;
}

async function submit(attachments = []) {
  const text = String(input.value || '').trim();
  if ((!text && !attachments.length) || busy) return;
  busy = true;
  send.disabled = true;
  status.textContent = '';
  input.value = '';
  resize();
  append('user', text, attachments);
  typing.hidden = false;
  log.scrollTop = log.scrollHeight;
  try {
    const res = await fetch('/api/local/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, attachments: attachments.map((x) => ({ kind: x.kind, url: x.url })) })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '本地对话失败');
    const reply = String(data.reply || '').trim();
    const segments = Array.isArray(data.segments) ? data.segments : [];
    if (reply || segments.length) append('assistant', reply, segments);
    else append('assistant', '（没回）');
  } catch (error) {
    status.textContent = String(error.message || error);
  } finally {
    typing.hidden = true;
    busy = false;
    send.disabled = false;
    input.focus();
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  submit();
});
input.addEventListener('input', resize);
input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    submit();
  }
});

for (const button of document.querySelectorAll('.attach')) {
  button.addEventListener('click', () => {
    pickKind = String(button.dataset.kind || 'image');
    filePick.accept = pickKind === 'voice' ? 'audio/*' : 'image/*';
    filePick.value = '';
    filePick.click();
  });
}

filePick.addEventListener('change', async () => {
  const file = filePick.files?.[0];
  if (!file) return;
  try {
    const item = await upload(file, pickKind);
    if (item) await submit([{ kind: pickKind, url: item.url }]);
  } catch (error) {
    status.textContent = String(error.message || error);
  }
});

async function loadHistory() {
  try {
    const res = await fetch('/api/local/history', { cache: 'no-store' });
    const data = await res.json();
    for (const turn of data.turns || []) {
      append(turn.role === 'assistant' ? 'assistant' : 'user', String(turn.text || ''));
    }
  } catch {}
}

loadHistory();
input.focus();
