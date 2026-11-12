const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const demo = window.DEMO;
const demoStory = window.DEMO_STORY;
let state = demo;
let story = null;
let offline = false;
let activePage = 'today';

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function autoGrow(el) {
  if (!el || el.offsetParent === null) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight + 2}px`;
}

function autoGrowAll() {
  requestAnimationFrame(() => $$('textarea').forEach(autoGrow));
}

async function getJson(url, fallback = null) {
  try {
    const res = await api(url, { cache: 'no-store' });
    if (!res.ok) return fallback;
    return await res.json();
  } catch {
    return fallback;
  }
}

async function loadState() {
  const data = await getJson('/api/state');
  offline = !data;
  if (data) state = data;
  renderChrome();
  applyOfflineMode();
  renderToday();
  renderCharacter();
  renderDiscover();
  renderSettings();
  const keys = [...(state.story || [])];
  if (!keys.length && !state.status?.connected) keys.push('private_demo');
  if (keys.length) {
    const select = $('#storyKey');
    select.innerHTML = keys.map((k) => `<option value="${esc(k)}">${esc(k)}</option>`).join('');
    await loadStory(keys[0]);
  }
  loadConfig();
}

async function loadCapabilities() {
  const data = await getJson('/api/capabilities');
  if (!data) return;
  const entries = Object.entries(data).filter(([key, value]) => key !== 'degraded' && value && typeof value === 'object');
  const color = (state) => state === 'up' ? 'var(--good, #7ce7b0)' : state === 'configured' ? 'var(--gold)' : 'var(--muted, #8b98a8)';
  $('#gwCapabilities').innerHTML = entries.map(([key, value]) => `<div class="result-item">${esc(key)} · <span style="color:${color(value.state)}">${esc(value.state || '—')}</span><small>${esc(value.model || value.voice || value.url || '')}</small></div>`).join('') || '<p class="muted">没有能力信息。</p>';
}

function renderTasks() {
  const items = state.tasks || [];
  $('#taskList').innerHTML = items.length
    ? items.map((t) => `<div class="result-item">${esc(t.text || t.kind || '任务')}<small>${esc(t.key || '')} · ${esc(t.status || 'pending')}</small>${t.status === 'pending' ? `<button class="text-btn task-done" data-id="${esc(t.id)}" type="button">完成</button>` : ''}${t.result ? `<div class="task-result">${esc(t.result)}</div>` : ''}</div>`).join('')
    : '<p class="muted">还没有任务。</p>';
}

function switchPage(name) {
  activePage = name;
  $$('.rail-item').forEach((btn) => btn.classList.toggle('active', btn.dataset.page === name));
  $$('.page').forEach((page) => page.classList.toggle('active', page.id === `page-${name}`));
  autoGrowAll();
  if (name === 'gateway') loadGateway();
  if (name === 'mind') loadMind();
}

$$('.rail-item').forEach((btn) => btn.addEventListener('click', () => switchPage(btn.dataset.page)));
$('#storyLoad').addEventListener('click', () => loadStory($('#storyKey').value));
$('#storySave').addEventListener('click', saveStory);
$('#storyPersonLoad').addEventListener('click', loadPerson);
$('#storyPersonForget').addEventListener('click', forgetPerson);
$('#storyPersonSave').addEventListener('click', savePerson);
$('#mindDaydream').addEventListener('click', mindDaydream);
$('#mindSave').addEventListener('click', saveMind);
$('#biliSearch').addEventListener('click', biliSearch);
$('#biliResults').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-see-bvid]');
  if (!button) return;
  button.disabled = true;
  try {
    const res = await api('/api/bilibili/see', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        bvid: button.dataset.seeBvid,
        title: button.dataset.seeTitle,
        owner: button.dataset.seeOwner
      })
    });
    if (!res.ok) throw new Error('保存失败');
    button.textContent = '已给她';
  } catch {
    button.disabled = false;
    button.textContent = '没存上';
  }
});
$('#biliPopular').addEventListener('click', biliPopular);
$('#biliContentBtn').addEventListener('click', biliContent);
$('#biliDynamics').addEventListener('click', biliDynamics);
$('#biliFavorites').addEventListener('click', biliFavorites);
$('#biliHistory').addEventListener('click', biliHistory);
$('#biliLogin').addEventListener('click', biliLogin);
$('#biliLogout').addEventListener('click', biliLogout);
$('#qzoneLoad').addEventListener('click', qzoneLoad);
$('#qzoneSend').addEventListener('click', qzoneSend);
$('#autoTick').addEventListener('click', autoTick);
function personaChatAppend(role, text) {
  const box = $('#personaChatLog');
  if (!box) return;
  const row = document.createElement('div');
  row.textContent = `${role === 'assistant' ? '她' : '你'}：${text}`;
  box.append(row);
  box.scrollTop = box.scrollHeight;
}

async function personaChatSend() {
  const input = $('#personaChatInput');
  const message = input.value.trim();
  if (!message) return;
  const status = $('#personaChatStatus');
  if (status) status.textContent = '她在想…';
  personaChatAppend('user', message);
  const history = personaHistory.slice(-20);
  personaHistory.push({ role: 'user', text: message });
  input.value = '';
  try {
    const res = await api('/api/persona/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message, history, card: readCardForm() })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '对话失败');
    personaChatAppend('assistant', data.reply || '……');
    personaHistory.push({ role: 'assistant', text: data.reply || '' });
    if (data.card) {
      fillCardForm(data.card);
      if (status) status.textContent = '新卡已填入，点保存角色卡';
    } else if (status) status.textContent = '';
  } catch (error) {
    if (status) status.textContent = String(error.message || error);
  }
}

$('#openGroupChat').addEventListener('click', () => {
  window.open('/next/group.html', 'xiaoyu-group', 'width=1100,height=820');
});

$('#openLocalChat').addEventListener('click', () => {
  window.open('/next/local.html', 'xiaoyu-chat', 'width=680,height=860');
});

async function loadScreenMode() {
  const button = $('#screenMode');
  const continuous = $('#screenContinuous');
  if (!button) return;
  try {
    const res = await api('/api/screen', { cache: 'no-store' });
    const data = await res.json();
    const on = Boolean(data.enabled);
    const cont = Boolean(data.continuous);
    button.textContent = `屏幕权限：${on ? '开' : '关'}`;
    button.classList.toggle('on', on);
    if (continuous) {
      continuous.hidden = !on;
      continuous.textContent = `持续看：${cont ? '开' : '关'}`;
      continuous.classList.toggle('on', cont);
    }
  } catch {}
}

$('#screenMode').addEventListener('click', async () => {
  const button = $('#screenMode');
  const continuous = $('#screenContinuous');
  if (!button) return;
  button.disabled = true;
  try {
    const on = !button.classList.contains('on');
    const res = await api('/api/screen', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: on })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '切换失败');
    button.textContent = `屏幕权限：${data.enabled ? '开' : '关'}`;
    button.classList.toggle('on', Boolean(data.enabled));
    if (continuous) {
      continuous.hidden = !data.enabled;
      continuous.textContent = `持续看：${data.continuous ? '开' : '关'}`;
      continuous.classList.toggle('on', Boolean(data.continuous));
    }
  } catch (error) {
    button.title = String(error.message || error);
  } finally {
    button.disabled = false;
  }
});

$('#screenContinuous').addEventListener('click', async () => {
  const button = $('#screenContinuous');
  if (!button || button.hidden) return;
  button.disabled = true;
  try {
    const on = !button.classList.contains('on');
    const res = await api('/api/screen', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ continuous: on })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '切换失败');
    button.textContent = `持续看：${data.continuous ? '开' : '关'}`;
    button.classList.toggle('on', Boolean(data.continuous));
  } catch (error) {
    button.title = String(error.message || error);
  } finally {
    button.disabled = false;
  }
});
loadScreenMode();

$('#startAI').addEventListener('click', async () => {
  const button = $('#startAI');
  if (!button || button.disabled) return;
  button.disabled = true;
  button.textContent = '启动中…';
  try {
    const res = await api('/api/ai/start', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '启动失败');
    button.textContent = 'AI 已启动';
    button.title = data.output || 'ASR / RVC / Ollama 正在启动';
  } catch (error) {
    button.textContent = '启动失败';
    button.title = String(error.message || error);
  } finally {
    setTimeout(() => {
      button.disabled = false;
      button.textContent = '打开 AI 服务';
    }, 5000);
  }
});

$('#stopAI').addEventListener('click', async () => {
  const button = $('#stopAI');
  if (!button || button.disabled) return;
  button.disabled = true;
  button.textContent = '关闭中…';
  try {
    const res = await api('/api/ai/stop', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '关闭失败');
    button.textContent = 'AI 已关';
    button.title = data.output || 'ASR / RVC / Ollama / GPT-SoVITS 已停止';
  } catch (error) {
    button.textContent = '关闭失败';
    button.title = String(error.message || error);
  } finally {
    setTimeout(() => {
      button.disabled = false;
      button.textContent = '关闭 AI 服务';
    }, 4000);
  }
});

$('#personaChatSend').addEventListener('click', personaChatSend);
$('#personaDraft').addEventListener('click', personaDraft);
$('#personaRefine').addEventListener('click', personaRefine);
$('#cardFile').addEventListener('change', importCard);
$('#clearScenes').addEventListener('click', clearScenes);
$('#saveConfig').addEventListener('click', saveConfig);
$('#stopVoice').addEventListener('click', async () => {
  const el = $('#voiceStatus');
  if (el) el.textContent = '正在关闭…';
  try {
    const res = await api('/api/voice/stop', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '关闭失败');
    if (el) el.textContent = '满穗语音服务已关闭';
  } catch (error) {
    if (el) el.textContent = String(error.message || error);
  }
});
$('#loadPermissions').addEventListener('click', loadPermissions);
$('#gwExpand').addEventListener('click', () => {
  const expanded = $('#gwLog').classList.toggle('expanded');
  $('#gwExpand').textContent = expanded ? '收起' : '展开';
});
$('#gwRefresh').addEventListener('click', () => { loadGateway(); loadGatewayLog(); });
$('#gwLogType').addEventListener('change', loadGatewayLog);
$('#gwCapRefresh').addEventListener('click', loadCapabilities);
$('#gwTestSend').addEventListener('click', testSend);
$('#gwRestart').addEventListener('click', restartV2);
$('#gwStartGateway').addEventListener('click', startGateway);
$('#gwStopGateway').addEventListener('click', stopGateway);
$('#gwStopAll').addEventListener('click', stopAllRuntime);
$('#clearTasks').addEventListener('click', clearTasks);
$('#runTasks').addEventListener('click', runTasks);
$('#taskList').addEventListener('click', (event) => {
  const button = event.target.closest('.task-done');
  if (button) markTaskDone(button.dataset.id);
});

document.addEventListener('input', (event) => {
  if (event.target instanceof HTMLTextAreaElement) autoGrow(event.target);
});
loadState();

const initialPage = new URLSearchParams(location.search).get('page');
if (initialPage && document.getElementById(`page-${initialPage}`)) switchPage(initialPage);
