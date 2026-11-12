async function loadConfig() {
  const cfg = await getJson('/api/config');
  if (!cfg) {
    $('#cfgStatus').textContent = '配置接口不可用';
    return;
  }
  $('#cfgFile').textContent = cfg.configFile || 'config.json';
  $('#cfgMode').value = cfg.mode || 'shadow';
  $('#cfgGroups').value = (cfg.allow?.groups || []).join('\n');
  $('#cfgPrivate').value = (cfg.allow?.private || []).join('\n');
  $('#cfgCooldown').value = cfg.character?.groupCooldownMs ?? 60000;
  $('#cfgTaskAck').value = cfg.character?.taskAck || '';
  autoGrowAll();
  $('#cfgTaskAuto').checked = Boolean(cfg.character?.taskAutoRun);
  $('#cfgPrivateOnly').checked = Boolean(cfg.character?.privateOnly);
  $('#cfgVision').checked = Boolean(cfg.vision?.enabled);
  $('#cfgAsr').checked = Boolean(cfg.asr?.enabled);
  $('#cfgTts').checked = Boolean(cfg.tts?.enabled);
  $('#cfgKnowledge').checked = Boolean(cfg.knowledge?.enabled);
  $('#cfgAutonomy').checked = Boolean(cfg.autonomy?.enabled);
  $('#cfgBili').checked = Boolean(cfg.bilibili?.enabled);
  $('#cfgEditor').checked = Boolean(cfg.story?.editor);
  $('#cfgAgency').checked = Boolean(cfg.story?.agency);
  $('#cfgStatus').textContent = '保存后需要重启服务';
}

async function saveConfig() {
  const split = (value) => value.split(/[\n,，]/).map((x) => x.trim()).filter(Boolean);
  const patch = {
    mode: $('#cfgMode').value,
    allow: {
      groups: split($('#cfgGroups').value),
      private: split($('#cfgPrivate').value)
    },
    actor: {},
    character: {
      privateOnly: $('#cfgPrivateOnly').checked,
      groupCooldownMs: Number($('#cfgCooldown').value),
      taskAck: $('#cfgTaskAck').value,
      taskAutoRun: $('#cfgTaskAuto').checked
    },
    vision: { enabled: $('#cfgVision').checked },
    asr: { enabled: $('#cfgAsr').checked },
    tts: { enabled: $('#cfgTts').checked },
    knowledge: { enabled: $('#cfgKnowledge').checked },
    autonomy: { enabled: $('#cfgAutonomy').checked },
    bilibili: { enabled: $('#cfgBili').checked },
    story: { editor: $('#cfgEditor').checked, agency: $('#cfgAgency').checked }
  };
  $('#cfgStatus').textContent = '保存中…';
  try {
    const res = await api('/api/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '保存失败');
    $('#cfgStatus').textContent = data.restartRequired ? '已保存，重启后生效' : '已保存';
    await loadState();
  } catch (error) {
    $('#cfgStatus').textContent = String(error.message || error);
  }
}

async function clearTasks() {
  if (!confirm('清空所有任务？')) return;
  try {
    await api('/api/tasks/clear', { method: 'POST' });
    await loadState();
  } catch {
    $('#cfgStatus').textContent = '清空失败';
  }
}

async function markTaskDone(id) {
  try {
    await api('/api/tasks/done', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id })
    });
    await loadState();
  } catch {
    $('#cfgStatus').textContent = '任务更新失败';
  }
}

async function runTasks() {
  $('#cfgStatus').textContent = '执行中…';
  try {
    const res = await api('/api/tasks/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ limit: 3 })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '执行失败');
    $('#cfgStatus').textContent = `执行完成：${(data.result || []).length} 个`;
    await loadState();
  } catch (error) {
    $('#cfgStatus').textContent = String(error.message || error);
  }
}

function readCardForm() {
  const lines = (id) => $(id).value.split('\n').map((x) => x.trim()).filter(Boolean);
  return {
    name: $('#cardName').value.trim(),
    identity: $('#cardIdentity').value.trim(),
    drive: $('#cardDrive').value.trim(),
    voice: lines('#cardVoice'),
    world: lines('#cardWorld'),
    boundaries: lines('#cardBounds'),
    views: lines('#cardViews'),
    taste: lines('#cardTaste'),
    line: lines('#cardLine'),
    selfImage: $('#cardSelfImage').value
  };
}

function fillCardForm(card) {
  $('#cardName').value = card.name || '';
  $('#cardIdentity').value = card.identity || '';
  $('#cardDrive').value = card.drive || '';
  $('#cardVoice').value = (card.voice || []).join('\n');
  $('#cardWorld').value = (card.world || []).join('\n');
  $('#cardBounds').value = (card.boundaries || []).join('\n');
  $('#cardViews').value = (card.views || []).join('\n');
  $('#cardTaste').value = (card.taste || []).join('\n');
  $('#cardLine').value = (card.line || []).join('\n');
  $('#cardSelfImage').value = card.selfImage || '';
  autoGrowAll();
}

async function personaRequest(path, body) {
  const res = await api(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `请求失败 ${res.status}`);
  return data.card;
}

async function personaDraft() {
  const brief = $('#personaBrief').value.trim();
  if (!brief) {
    $('#personaStatus').textContent = '先写一句想让她是什么样。';
    return;
  }
  const button = $('#personaDraft');
  button.disabled = true;
  $('#personaStatus').textContent = '起草中…';
  try {
    const card = await personaRequest('/api/persona/draft', { brief });
    fillCardForm(card);
    $('#personaStatus').textContent = '已填入。检查后点“保存角色卡”。';
  } catch (error) {
    $('#personaStatus').textContent = String(error.message || error);
  } finally {
    button.disabled = false;
  }
}

async function personaRefine() {
  const instruction = $('#personaInstruction').value.trim();
  if (!instruction) {
    $('#personaStatus').textContent = '写一句想怎么改。';
    return;
  }
  const button = $('#personaRefine');
  button.disabled = true;
  $('#personaStatus').textContent = '精修中…';
  try {
    const card = await personaRequest('/api/persona/refine', {
      card: readCardForm(),
      instruction
    });
    fillCardForm(card);
    $('#personaStatus').textContent = '已改。检查后点“保存角色卡”。';
  } catch (error) {
    $('#personaStatus').textContent = String(error.message || error);
  } finally {
    button.disabled = false;
  }
}

async function saveCard() {
  const lines = (id) => $(id).value.split('\n').map((x) => x.trim()).filter(Boolean);
  const body = {
    name: $('#cardName').value,
    identity: $('#cardIdentity').value,
    drive: $('#cardDrive').value,
    voice: lines('#cardVoice'),
    world: lines('#cardWorld'),
    boundaries: lines('#cardBounds'),
    views: lines('#cardViews'),
    taste: lines('#cardTaste'),
    line: lines('#cardLine'),
    selfImage: $('#cardSelfImage').value
  };
  $('#cardStatus').textContent = '保存中…';
  try {
    const res = await api('/api/character', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(await res.text());
    $('#cardStatus').textContent = '已保存';
    await loadState();
  } catch (error) {
    $('#cardStatus').textContent = String(error.message || error);
  }
}

async function importCard() {
  const file = $('#cardFile').files?.[0];
  if (!file) return;
  try {
    const card = JSON.parse(await file.text());
    const res = await api('/api/character', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(card)
    });
    if (!res.ok) throw new Error(await res.text());
    $('#cardStatus').textContent = '已导入';
    await loadState();
  } catch (error) {
    $('#cardStatus').textContent = String(error.message || error);
  }
}

async function clearScenes() {
  if (!confirm('清空全部场景？她会忘记当前话题。')) return;
  try {
    await api('/api/scenes/clear', { method: 'POST' });
    await loadState();
  } catch {
    $('#cfgStatus').textContent = '清空场景失败';
  }
}

