const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const demo = {
  status: { mode: 'offline', connected: false, selfId: '', uptimeSec: 0, sent: 0, tasks: 0 },
  card: {
    name: '小深',
    identity: '一只住在终端里的鲸鱼，不是客服。',
    voice: ['短句', '偶尔懒懒的', '不确定就说不确定'],
    values: ['被当成一个人'],
    boundaries: ['不解释系统', '不装万能']
  },
  scenes: {
    'private_demo': {
      where: '私聊',
      recent: '他说今天有点累，没有展开。',
      turns: []
    }
  },
  bilibili: { enabled: true, loggedIn: false, user: null },
  autonomy: { enabled: true, discoveries: [], countToday: 0 },
  story: ['private_demo']
};

const demoStory = {
  self: '# 我\n\n一只住在终端里的蓝色小鲸鱼。\n不是客服，不是助手。\n\n## 说话\n- 短句\n- 偶尔懒懒的\n- 不确定就说不确定',
  relationship: '# 我们\n\n## 第一章：客套\n\n## 第二章：他开始拿我开玩笑\n\n## 第三章：那阵子他总熬夜\n\n很多个晚上，不用一条条记。',
  now: '# 此刻\n\n他今天话少。\n我本来想问昨天那件事，话到嘴边又觉得现在问像在审他。\n也可能他只是在忙。\n\n# 心里\n\n他刚才那句“随便”不像真的随便。\n我有点不舒服，但不想立刻表现出来。\n\n# 猜\n\n我猜他不是冲我，是别的事憋着。\n也可能就是不想说。\n\n# 打算\n\n先接一句，不追问。\n如果他主动提，我再多问一句。',
  episodes: [
    { title: '他第一次说累', text: '他说今天有点累，没有展开。\n我没有追问，只说“那先歇着”。' },
    { title: '他拿我开玩笑', text: '他说我像一只会回消息的鲸鱼。\n我嘴上顶了回去，其实没生气。' }
  ]
};

let state = demo;
let story = null;
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
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return fallback;
    return await res.json();
  } catch {
    return fallback;
  }
}

async function loadState() {
  const data = await getJson('/api/state');
  if (data) state = data;
  renderChrome();
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

function renderChrome() {
  const status = state.status || {};
  const connected = Boolean(status.connected);
  $('#topStatus').innerHTML = `<span class="dot ${connected ? 'on' : ''}"></span><span>${connected ? '已连接' : '未连接'}</span>`;
  $('#dockStatus').textContent = connected ? `${status.mode || ''} · 在线` : '等待连接';
}

function stripHeadings(text) {
  return String(text || '').replace(/^#+\s*/gm, '').replace(/^(此刻|心里|猜|打算)\s*$/gm, '').replace(/\n{2,}/g, '\n').trim();
}

function nowText() {
  if (!story?.now) return '没什么特别想的，先听他说。';
  return stripHeadings(story.now);
}

function renderToday() {
  const status = state.status || {};
  const scenes = Object.entries(state.scenes || {});
  const latest = scenes[0]?.[1]?.recent || '';
  $('#todayLede').textContent = latest ? `刚才：${latest}` : '先听她说。';
  $('#todayStatus').innerHTML = [
    `<span>模式 <b>${esc(status.mode || 'unknown')}</b></span>`,
    `<span>连接 <b>${status.connected ? '在线' : '离线'}</b></span>`,
    `<span>任务 <b>${esc(status.tasks ?? 0)}</b></span>`
  ].join('');
  const now = nowText();
  $('#todayNow').textContent = now;
  $('#todayPlan').textContent = now.includes('打算') ? now.split('打算').slice(-1)[0].replace(/^[\s:：]*/, '') : '没有特别的打算。';
  $('#todayScenes').innerHTML = scenes.length
    ? scenes.slice(0, 5).map(([key, item]) => `<div class="scene-item">${esc(item.recent || '')}<small>${esc(key)}</small></div>`).join('')
    : '<p class="muted">还没有对话。</p>';
  const episodes = story?.episodes || [];
  $('#todayMemory').innerHTML = episodes.length
    ? episodes.slice(-3).reverse().map((e) => `<div class="line-item">${esc(e.text.split('\n').slice(0, 2).join(' '))}</div>`).join('')
    : '<p class="muted">还没有被写下来的事。</p>';
  const speechLines = now.split('\n').map((x) => x.trim()).filter((x) => x && !/^(此刻|心里|猜|打算)$/.test(x));
  const speech = speechLines.slice(0, 2).join(' ');
  $('#speech').textContent = speech.length > 60 ? speech.slice(0, 60) + '…' : speech || '在。';
}

function renderCharacter() {
  const card = state.card || {};
  $('#charName').textContent = card.name || '小深';
  $('#charIdentity').textContent = card.identity || '';
  $('#charVoice').innerHTML = (card.voice || []).map((x) => `<div class="line-item">${esc(x)}</div>`).join('') || '<p class="muted">还没有写。</p>';
  $('#charBounds').innerHTML = (card.boundaries || []).map((x) => `<div class="line-item">${esc(x)}</div>`).join('') || '<p class="muted">还没有写。</p>';
  $('#charSelf').textContent = story?.self || '还没有 self.md。';
  $('#cardName').value = card.name || '';
  $('#cardIdentity').value = card.identity || '';
  $('#cardDrive').value = card.drive || '';
  $('#cardVoice').value = (card.voice || []).join('\n');
  $('#cardValues').value = (card.values || []).join('\n');
  $('#cardBounds').value = (card.boundaries || []).join('\n');
  autoGrowAll();
}

function renderDiscover() {
  const bili = state.bilibili || {};
  $('#biliState').textContent = bili.loggedIn ? `已登录：${bili.user?.name || bili.user?.mid || ''}` : '未登录';
  const auto = state.autonomy || {};
  $('#autoState').textContent = auto.enabled ? `已开启 · 今日 ${auto.countToday ?? 0}` : '已关闭';
  $('#autoResults').innerHTML = (auto.discoveries || []).length
    ? auto.discoveries.map((x) => `<div class="result-item">${esc(x.title)}<small>${esc(x.source)}${x.keyword ? ' · ' + esc(x.keyword) : ''}</small></div>`).join('')
    : '<p class="muted">还没有刷到。</p>';
}

function renderSettings() {
  const status = state.status || {};
  const rows = [
    ['模式', status.mode || 'unknown'],
    ['连接', status.connected ? '已连接' : '未连接'],
    ['Bot', status.selfId || '—'],
    ['运行', `${Math.round((status.uptimeSec || 0) / 60)} 分钟`],
    ['已发', status.sent ?? 0],
    ['任务', status.tasks ?? 0],
    ['Story', (state.story || []).join(' / ') || '—'],
    ['B站', state.bilibili?.loggedIn ? '已登录' : '未登录']
  ];
  $('#settingsList').innerHTML = rows.map(([k, v]) => `<div class="setting-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
  renderTasks();
  renderScenes();
}

function renderScenes() {
  const scenes = Object.entries(state.scenes || {});
  $('#sceneList').innerHTML = scenes.length
    ? scenes.map(([key, scene]) => `<div class="result-item"><code>${esc(key)}</code> · ${esc(scene.where || '')}<small>${esc(scene.recent || '')}</small></div>`).join('')
    : '<p class="muted">还没有场景。</p>';
}

async function loadCapabilities() {
  const data = await getJson('/api/capabilities');
  if (!data) return;
  const entries = Object.entries(data).filter(([key, value]) => key !== 'degraded' && value && typeof value === 'object');
  const color = (state) => state === 'up' ? 'var(--good, #7ce7b0)' : state === 'configured' ? 'var(--gold)' : 'var(--muted, #8b98a8)';
  $('#gwCapabilities').innerHTML = entries.map(([key, value]) => `<div class="result-item">${esc(key)} · <span style="color:${color(value.state)}">${esc(value.state || '—')}</span><small>${esc(value.model || value.voice || value.url || '')}</small></div>`).join('') || '<p class="muted">没有能力信息。</p>';
}

async function loadGatewayLog() {
  const type = $('#gwLogType')?.value || 'v2';
  const data = await getJson('/api/gateway/logs?type=' + encodeURIComponent(type));
  if (data && data.text) $('#gwLog').textContent = data.text;
}

async function testSend() {
  const text = $('#gwTestText').value.trim() || '在吗';
  try {
    const res = await fetch('/api/gateway/test-send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'private', text }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '发送失败');
    $('#gwTestText').value = '';
    $('#gwTestText').placeholder = '已发送';
  } catch (error) {
    $('#gwTestText').placeholder = String(error.message || error);
  }
}

async function restartV2() {
  if (!confirm('重启 v2？当前连接会短暂断开。')) return;
  $('#gwLog').textContent = '正在重启 v2…';
  try {
    const res = await fetch('/api/gateway/restart', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '重启失败');
    setTimeout(() => location.reload(), 8000);
  } catch (error) {
    $('#gwLog').textContent = String(error.message || error);
  }
}

async function startAllServices() {
  $('#gwLog').textContent = '正在提交启动脚本…';
  try {
    const res = await fetch('/api/gateway/start-all', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '启动失败');
    $('#gwLog').textContent = data.message || '已提交';
    setTimeout(loadGateway, 3000);
  } catch (error) {
    $('#gwLog').textContent = String(error.message || error);
  }
}

async function loadGateway() {
  const data = await getJson('/api/gateway/overview');
  if (!data) {
    $('#gwLog').textContent = '网关接口不可用。';
    return;
  }
  const v2 = data.v2 || {};
  const v1 = data.v1 || {};
  const snow = v1.snowluma || {};
  const v2Connected = Boolean(v2.status?.connected);
  const snowConnected = Boolean(snow.connected || v2Connected);
  $('#gwConnected').textContent = v2Connected ? '已连接' : '未连接';
  $('#gwSnow').textContent = (snow.connected || v2Connected) ? (snow.good || v2Connected ? '正常' : '已连接 · 未接收') : '未连接';
  $('#gwMode').textContent = v2.status?.mode || v1.mode || '—';
  const sessions = Array.isArray(data.sessions) ? data.sessions : (data.sessions?.sessions || Object.keys(v2.scenes || {}).map((key) => ({ key })));
  const pending = Array.isArray(data.pending) ? data.pending : (data.pending?.pending || []);
  $('#gwSessions').textContent = sessions.length;
  $('#gwPending').textContent = pending.length;
  const snowLines = [
    snowConnected ? '连接：正常' : '连接：断开',
    snow.accountOnline || v2Connected ? 'QQ 账号：在线' : 'QQ 账号：离线或未知',
    (snow.good || v2Connected) ? '上游收包：正常' : '上游收包：异常',
    snow.lastPacketKind ? `最近事件：${snow.lastPacketKind}` : '',
    snow.lastPacketAgoMs != null ? `最近收包：${Math.round(snow.lastPacketAgoMs / 1000)} 秒前` : '',
    snow.hint || ''
  ].filter(Boolean);
  $('#gwSnowDetail').textContent = snowLines.join('\n');
  const items = [...sessions.map((x) => ({ ...x, kind: 'session' })), ...pending.map((x) => ({ ...x, kind: 'pending' }))];
  $('#gwSessionDetail').innerHTML = items.length
    ? items.map((x) => `<div class="result-item">${esc(x.kind)} · ${esc(x.key || x.id || x.uin || x.qq || '')}<small>${esc(x.label || x.name || x.status || '')}</small></div>`).join('')
    : '<p class="muted">没有会话或待审批。</p>';
  $('#gwLog').textContent = v1.activity || '没有活动日志。';
  loadGatewayLog();
  loadCapabilities();
  if (data.errors?.status && !v2Connected) $('#gwSnowDetail').textContent += `\n\n网关状态读取失败：${data.errors.status}`;
}

function renderTasks() {
  const items = state.tasks || [];
  $('#taskList').innerHTML = items.length
    ? items.map((t) => `<div class="result-item">${esc(t.text || t.kind || '任务')}<small>${esc(t.key || '')} · ${esc(t.status || 'pending')}</small>${t.status === 'pending' ? `<button class="text-btn task-done" data-id="${esc(t.id)}" type="button">完成</button>` : ''}${t.result ? `<div class="task-result">${esc(t.result)}</div>` : ''}</div>`).join('')
    : '<p class="muted">还没有任务。</p>';
}

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
  $('#cfgMaxReply').value = cfg.actor?.maxReplyChars ?? 300;
  $('#cfgMaxChars').value = cfg.character?.maxChars ?? 6000;
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
    actor: { maxReplyChars: Number($('#cfgMaxReply').value) },
    character: {
      privateOnly: $('#cfgPrivateOnly').checked,
      maxChars: Number($('#cfgMaxChars').value),
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
    const res = await fetch('/api/config', {
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
    await fetch('/api/tasks/clear', { method: 'POST' });
    await loadState();
  } catch {
    $('#cfgStatus').textContent = '清空失败';
  }
}

async function markTaskDone(id) {
  try {
    await fetch('/api/tasks/done', {
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
    const res = await fetch('/api/tasks/run', {
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
    values: lines('#cardValues'),
    boundaries: lines('#cardBounds')
  };
}

function fillCardForm(card) {
  $('#cardName').value = card.name || '';
  $('#cardIdentity').value = card.identity || '';
  $('#cardDrive').value = card.drive || '';
  $('#cardVoice').value = (card.voice || []).join('\n');
  $('#cardValues').value = (card.values || []).join('\n');
  $('#cardBounds').value = (card.boundaries || []).join('\n');
  autoGrowAll();
}

async function personaRequest(path, body) {
  const res = await fetch(path, {
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
    values: lines('#cardValues'),
    boundaries: lines('#cardBounds')
  };
  $('#cardStatus').textContent = '保存中…';
  try {
    const res = await fetch('/api/character', {
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
    const res = await fetch('/api/character', {
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
    await fetch('/api/scenes/clear', { method: 'POST' });
    await loadState();
  } catch {
    $('#cfgStatus').textContent = '清空场景失败';
  }
}

async function loadStory(key) {
  if (!key) return;
  story = await getJson('/api/story?key=' + encodeURIComponent(key));
  if (!story) story = key === 'private_demo' ? demoStory : { self: '', relationship: '', now: '', episodes: [] };
  $('#storyNow').value = story.now || '';
  $('#storyRelation').value = story.relationship || '';
  $('#storyLife').value = story.life || '';
  autoGrowAll();
  $('#charSelf').textContent = story.self || '还没有 self.md。';
  $('#storyEpisodes').innerHTML = (story.episodes || []).length
    ? story.episodes.map((e) => `<article class="episode"><h3>${esc(e.title || '一件小事')}</h3><p>${esc(e.text || '')}</p></article>`).join('')
    : '<p class="muted">还没有 episode。</p>';
  renderToday();
}

async function saveStory() {
  const key = $('#storyKey').value;
  if (!key) return;
  for (const [section, el] of [['now', '#storyNow'], ['relationship', '#storyRelation'], ['life', '#storyLife']]) {
    const res = await fetch('/api/story/section', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key, section, text: $(el).value })
    });
    if (!res.ok) return alert('保存失败：' + section);
  }
  await loadStory(key);
}

async function loadPerson() {
  const key = $('#storyKey').value;
  const person = $('#storyPersonId').value.trim();
  if (!key || !person) return;
  const data = await getJson('/api/story/person?key=' + encodeURIComponent(key) + '&person=' + encodeURIComponent(person));
  if (!data) return;
  $('#storyPersonHead').value = data.head || '';
  $('#storyPersonMiddle').value = data.middle || '';
  $('#storyPersonTail').value = data.tail || '';
  autoGrowAll();
}

async function savePerson() {
  const key = $('#storyKey').value;
  const person = $('#storyPersonId').value.trim();
  if (!key || !person) return;
  const res = await fetch('/api/story/person', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      key,
      person,
      head: $('#storyPersonHead').value,
      middle: $('#storyPersonMiddle').value,
      tail: $('#storyPersonTail').value
    })
  });
  if (!res.ok) alert('保存人物失败');
}

async function forgetPerson() {
  const key = $('#storyKey').value;
  const person = $('#storyPersonId').value.trim();
  if (!key || !person || !confirm('忘记这个人在这个群里的侧写？')) return;
  await fetch('/api/story/person/forget', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key, person })
  });
  $('#storyPersonHead').value = '';
  $('#storyPersonMiddle').value = '';
  $('#storyPersonTail').value = '';
}

async function biliSearch() {
  const q = $('#biliQuery').value.trim();
  if (!q) return;
  const data = await getJson('/api/bilibili/search?q=' + encodeURIComponent(q) + '&limit=5', { list: [] });
  $('#biliResults').innerHTML = (data.list || []).map((x) => `<div class="result-item">${esc(x.title)}<small>${esc(x.owner || '')} · ${esc(x.tname || '')}</small></div>`).join('') || '<p class="muted">没有结果。</p>';
}

async function biliPopular() {
  const data = await getJson('/api/bilibili/popular?limit=5', { list: [] });
  $('#biliResults').innerHTML = (data.list || []).map((x) => `<div class="result-item">${esc(x.title)}<small>${esc(x.owner || '')}</small></div>`).join('') || '<p class="muted">没有结果。</p>';
}

async function biliContent() {
  const raw = $('#biliContentInput').value.trim();
  const bvid = raw.match(/BV[0-9A-Za-z]{10}/)?.[0];
  const box = $('#biliContentResult');
  if (!bvid) {
    box.textContent = '给我 BV 号或视频链接。';
    return;
  }
  box.textContent = '读取中…';
  try {
    const data = await getJson('/api/bilibili/content?bvid=' + encodeURIComponent(bvid), null);
    box.textContent = [
      data.title || '',
      data.owner ? 'UP：' + data.owner : '',
      data.text || '这个视频没有可读的字幕或简介。',
      data.url || ''
    ].filter(Boolean).join('\n\n');
  } catch (error) {
    box.textContent = String(error.message || error);
  }
}

function renderBiliList(list, empty) {
  const html = (list || []).map((item) => {
    const title = esc(item.title || '');
    const meta = [item.owner || item.author || '', item.folder || '', item.time || ''].filter(Boolean).map(esc).join(' · ');
    return `<div class="result-item">${title}${meta ? `<small>${meta}</small>` : ''}</div>`;
  }).join('');
  $('#biliResults').innerHTML = html || `<p class="muted">${esc(empty)}</p>`;
}

async function biliDynamics() {
  const data = await getJson('/api/bilibili/dynamics', { list: [] });
  renderBiliList(data.list, '没有关注动态。');
}

async function biliFavorites() {
  const data = await getJson('/api/bilibili/favorites', { list: [] });
  renderBiliList(data.list, '收藏夹是空的。');
}

async function biliHistory() {
  const data = await getJson('/api/bilibili/history', { list: [] });
  renderBiliList(data.list, '没有观看历史。');
}

async function biliLogin() {
  const box = $('#biliQr');
  box.innerHTML = '<span class="muted">正在生成二维码…</span>';
  try {
    const res = await fetch('/api/bilibili/login', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '登录失败');
    box.innerHTML = `<p class="muted">用 B 站 App 扫码</p><img alt="B站登录二维码" src="${data.qrImage}">`;
    const timer = setInterval(async () => {
      try {
        const poll = await fetch('/api/bilibili/poll', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ key: data.key })
        }).then((r) => r.json());
        if (poll.status === 'ok') {
          clearInterval(timer);
          box.innerHTML = '<p class="muted">登录成功。</p>';
          await loadState();
        }
      } catch {
        clearInterval(timer);
        box.innerHTML = '<p class="muted">登录轮询中断。</p>';
      }
    }, 2000);
  } catch (error) {
    box.innerHTML = `<p class="muted">${esc(error.message || error)}</p>`;
  }
}

async function qzoneLoad() {
  const data = await getJson('/api/qzone/feeds?count=5');
  const feeds = data?.feeds || data?.data?.feeds || [];
  $('#qzoneResults').innerHTML = feeds.map((x) => `<div class="result-item">${esc(x.nickname || x.uin || '')}：${esc(String(x.content || '').slice(0, 80))}</div>`).join('') || '<p class="muted">没有动态。</p>';
}

async function qzoneSend() {
  const content = $('#qzoneText').value.trim();
  if (!content) return;
  const ugcRight = Number($('#qzoneRight').value);
  const label = ugcRight === 1 ? '所有人可见' : ugcRight === 64 ? '仅自己可见' : '好友可见';
  if (!confirm(`发布到 QQ 空间？\n\n${label}`)) return;
  $('#qzoneStatus').textContent = '发布中…';
  try {
    const res = await fetch('/api/qzone/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content, ugcRight, confirm: true })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '发布失败');
    $('#qzoneStatus').textContent = '已发布：' + label;
    $('#qzoneText').value = '';
  } catch (error) {
    $('#qzoneStatus').textContent = String(error.message || error);
  }
}

async function biliLogout() {
  if (!confirm('退出 B 站登录？')) return;
  try {
    await fetch('/api/bilibili/logout', { method: 'POST' });
    await loadState();
  } catch {
    $('#biliState').textContent = '退出失败';
  }
}

async function autoTick() {
  const data = await getJson('/api/autonomy/tick', { count: 0 });
  await loadState();
  alert(`采集到 ${data.count || 0} 条`);
}

function switchPage(name) {
  activePage = name;
  $$('.rail-item').forEach((btn) => btn.classList.toggle('active', btn.dataset.page === name));
  $$('.page').forEach((page) => page.classList.toggle('active', page.id === `page-${name}`));
  autoGrowAll();
  if (name === 'gateway') loadGateway();
}

$$('.rail-item').forEach((btn) => btn.addEventListener('click', () => switchPage(btn.dataset.page)));
$('#storyLoad').addEventListener('click', () => loadStory($('#storyKey').value));
$('#storySave').addEventListener('click', saveStory);
$('#biliSearch').addEventListener('click', biliSearch);
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
$('#saveCard').addEventListener('click', saveCard);
$('#personaDraft').addEventListener('click', personaDraft);
$('#personaRefine').addEventListener('click', personaRefine);
$('#cardFile').addEventListener('change', importCard);
$('#clearScenes').addEventListener('click', clearScenes);
$('#saveConfig').addEventListener('click', saveConfig);
$('#gwExpand').addEventListener('click', () => {
  const expanded = $('#gwLog').classList.toggle('expanded');
  $('#gwExpand').textContent = expanded ? '收起' : '展开';
});
$('#gwRefresh').addEventListener('click', () => { loadGateway(); loadGatewayLog(); });
$('#gwLogType').addEventListener('change', loadGatewayLog);
$('#gwCapRefresh').addEventListener('click', loadCapabilities);
$('#gwTestSend').addEventListener('click', testSend);
$('#gwRestart').addEventListener('click', restartV2);
$('#gwStartAll').addEventListener('click', startAllServices);
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
