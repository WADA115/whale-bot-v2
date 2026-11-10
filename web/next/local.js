const $ = (sel) => document.querySelector(sel);
const log = $('#chatLog');
const form = $('#chatForm');
const input = $('#chatInput');
const send = $('#chatSend');
const typing = $('#typing');
const status = $('#chatStatus');
const empty = $('#chatEmpty');
let busy = false;

function append(role, text) {
  if (empty) empty.remove();
  const msg = document.createElement('div');
  msg.className = `msg ${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  msg.append(bubble);
  const meta = document.createElement('div');
  meta.className = 'meta';
  const now = new Date();
  meta.textContent = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  msg.append(meta);
  log.append(msg);
  log.scrollTop = log.scrollHeight;
}

function resize() {
  input.style.height = 'auto';
  input.style.height = `${Math.min(160, input.scrollHeight)}px`;
}

async function submit() {
  const text = String(input.value || '').trim();
  if (!text || busy) return;
  busy = true;
  send.disabled = true;
  status.textContent = '';
  input.value = '';
  resize();
  append('user', text);
  typing.hidden = false;
  log.scrollTop = log.scrollHeight;
  try {
    const res = await fetch('/api/local/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '本地对话失败');
    const reply = String(data.reply || '').trim();
    if (reply) append('assistant', reply);
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
