const $ = (sel) => document.querySelector(sel);
const log = $('#chatLog');
const form = $('#chatForm');
const input = $('#chatInput');
const send = $('#chatSend');
const typing = $('#typing');
const status = $('#chatStatus');
const empty = $('#chatEmpty');
const stickerToggle = $('#stickerToggle');
const stickerPanel = $('#stickerPanel');
const stickerGrid = $('#stickerGrid');
const voiceToggle = $('#voiceToggle');
const dropOverlay = $('#dropOverlay');
let busy = false;
let recorder = null;
let recordedChunks = [];
let recording = false;

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

async function sendFile(file, kind = 'image') {
  try {
    const item = await upload(file, kind);
    if (item) await submit([{ kind, url: item.url }]);
  } catch (error) {
    status.textContent = String(error.message || error);
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

/* 粘贴图片，不弹文件选择 */
document.addEventListener('paste', async (event) => {
  const items = [...(event.clipboardData?.items || [])];
  const file = items.find((item) => item.type.startsWith('image/'))?.getAsFile();
  if (!file) return;
  event.preventDefault();
  await sendFile(file, 'image');
});

/* 拖进来 */
let dragDepth = 0;
document.addEventListener('dragenter', (event) => {
  event.preventDefault();
  dragDepth += 1;
  dropOverlay?.classList.add('show');
});
document.addEventListener('dragover', (event) => event.preventDefault());
document.addEventListener('dragleave', (event) => {
  event.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) dropOverlay?.classList.remove('show');
});
document.addEventListener('drop', async (event) => {
  event.preventDefault();
  dragDepth = 0;
  dropOverlay?.classList.remove('show');
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  if (file.type.startsWith('audio/') || /\.(wav|mp3|ogg|m4a|amr|webm)$/i.test(file.name)) await sendFile(file, 'voice');
  else if (file.type.startsWith('image/')) await sendFile(file, 'image');
});

/* 表情面板：直接用本地库，不找文件 */
async function loadStickers() {
  if (!stickerGrid) return;
  stickerGrid.textContent = '读取中…';
  try {
    const res = await fetch('/api/media/list?scope=user', { cache: 'no-store' });
    const data = await res.json();
    const items = (data.items || []).filter((x) => x.kind === 'sticker' || x.kind === 'image');
    stickerGrid.replaceChildren();
    if (!items.length) {
      const hint = document.createElement('div');
      hint.className = 'sticker-empty';
      hint.textContent = '还没有表情。粘贴或拖一张图进来，就会进这里。';
      stickerGrid.append(hint);
      return;
    }
    for (const item of items) {
      const img = document.createElement('img');
      img.src = item.url;
      img.alt = item.name || '表情';
      img.title = item.name || '表情';
      img.addEventListener('click', () => {
        stickerPanel.hidden = true;
        submit([{ kind: item.kind, url: item.url }]);
      });
      stickerGrid.append(img);
    }
  } catch (error) {
    stickerGrid.textContent = String(error.message || error);
  }
}

stickerToggle?.addEventListener('click', async () => {
  if (!stickerPanel) return;
  stickerPanel.hidden = !stickerPanel.hidden;
  if (!stickerPanel.hidden) await loadStickers();
});

document.addEventListener('click', (event) => {
  if (!stickerPanel || stickerPanel.hidden) return;
  if (stickerPanel.contains(event.target) || stickerToggle?.contains(event.target)) return;
  stickerPanel.hidden = true;
});

/* 直接录音，不走文件选择 */
async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    status.textContent = '这个窗口不能录音。';
    return;
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find((type) => MediaRecorder.isTypeSupported(type)) || '';
  recordedChunks = [];
  recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  recorder.ondataavailable = (event) => { if (event.data?.size) recordedChunks.push(event.data); };
  recorder.onstop = async () => {
    for (const track of stream.getTracks()) track.stop();
    recording = false;
    voiceToggle?.classList.remove('recording');
    if (voiceToggle) voiceToggle.textContent = '说话';
    const blob = new Blob(recordedChunks, { type: recorder?.mimeType || 'audio/webm' });
    recordedChunks = [];
    recorder = null;
    if (blob.size < 800) { status.textContent = '太短了。'; return; }
    const file = new File([blob], 'voice.webm', { type: blob.type || 'audio/webm' });
    await sendFile(file, 'voice');
  };
  recorder.start();
  recording = true;
  voiceToggle?.classList.add('recording');
  if (voiceToggle) voiceToggle.textContent = '停止';
  status.textContent = '录音中… 再点一下停止';
}

function stopRecording() {
  try { recorder?.stop(); } catch {}
}

voiceToggle?.addEventListener('click', async () => {
  if (recording) { stopRecording(); return; }
  try { await startRecording(); }
  catch (error) {
    status.textContent = String(error.message || error);
    recording = false;
    voiceToggle?.classList.remove('recording');
    if (voiceToggle) voiceToggle.textContent = '说话';
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
