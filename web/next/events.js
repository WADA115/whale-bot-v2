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
