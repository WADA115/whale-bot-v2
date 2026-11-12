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

async function loadGatewayLog() {
  const type = $('#gwLogType')?.value || 'v2';
  const data = await getJson('/api/gateway/logs?type=' + encodeURIComponent(type));
  if (data && data.text) $('#gwLog').textContent = data.text;
}

async function testSend() {
  const text = $('#gwTestText').value.trim() || '在吗';
  try {
    const res = await api('/api/gateway/test-send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'private', text }) });
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
    const res = await api('/api/gateway/restart', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '重启失败');
    setTimeout(() => location.reload(), 8000);
  } catch (error) {
    $('#gwLog').textContent = String(error.message || error);
  }
}

async function startGateway() {
  $('#gwLog').textContent = '正在启动网关…';
  try {
    const res = await api('/api/gateway/start', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '启动失败');
    $('#gwLog').textContent = data.message || '已提交';
    setTimeout(loadGateway, 3000);
  } catch (error) {
    $('#gwLog').textContent = String(error.message || error);
  }
}

async function stopGateway() {
  $('#gwLog').textContent = '正在停止网关…';
  try {
    const res = await api('/api/gateway/stop', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '停止失败');
    $('#gwLog').textContent = data.message || '已提交';
    setTimeout(loadGateway, 2500);
  } catch (error) {
    $('#gwLog').textContent = String(error.message || error);
  }
}

async function stopAllRuntime() {
  if (!confirm('正常关闭全部服务？QQ 不会被关。')) return;
  $('#gwLog').textContent = '正在正常关闭…';
  try {
    const res = await api('/api/runtime/stop-all', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '关闭失败');
    $('#gwLog').textContent = '已提交，页面马上会断开。';
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

async function loadStory(key) {
  if (!key) return;
  story = await getJson('/api/story?key=' + encodeURIComponent(key));
  if (!story) story = key === 'private_demo' ? demoStory : { self: '', relationship: '', now: '', episodes: [] };
  $('#storyNow').value = story.now || '';
  $('#storyRelation').value = story.relationship || '';
  $('#storyLife').value = story.life || '';
  $('#storyWorld').value = story.world || '';
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
  for (const [section, el] of [['now', '#storyNow'], ['relationship', '#storyRelation'], ['life', '#storyLife'], ['world', '#storyWorld']]) {
    const res = await api('/api/story/section', {
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
  const res = await api('/api/story/person', {
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
  await api('/api/story/person/forget', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key, person })
  });
  $('#storyPersonHead').value = '';
  $('#storyPersonMiddle').value = '';
  $('#storyPersonTail').value = '';
}

function renderBiliResults(list) {
  $('#biliResults').innerHTML = (list || []).map((x) => {
    const title = esc(x.title || '');
    const meta = [x.owner || '', x.tname || ''].filter(Boolean).map(esc).join(' · ');
    const bvid = String(x.bvid || '').trim();
    const see = bvid ? `<button class="text-btn see-btn" type="button" data-see-bvid="${esc(bvid)}" data-see-title="${esc(x.title || '')}" data-see-owner="${esc(x.owner || '')}">给她看</button>` : '';
    return `<div class="result-item">${title}${see}<small>${meta}</small></div>`;
  }).join('') || '<p class="muted">没有结果。</p>';
}

async function biliSearch() {
  const q = $('#biliQuery').value.trim();
  if (!q) return;
  const data = await getJson('/api/bilibili/search?q=' + encodeURIComponent(q) + '&limit=5', { list: [] });
  renderBiliResults(data.list);
}

async function biliPopular() {
  const data = await getJson('/api/bilibili/popular?limit=5', { list: [] });
  renderBiliResults(data.list);
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
  box.textContent = '正在生成二维码…';
  try {
    const res = await api('/api/bilibili/login', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '登录失败');
    box.replaceChildren();
    const hint = document.createElement('p');
    hint.className = 'muted';
    hint.textContent = '用 B 站 App 扫码';
    const img = document.createElement('img');
    img.alt = 'B站登录二维码';
    img.src = String(data.qrImage || '');
    box.append(hint, img);
    let attempts = 0;
    const timer = setInterval(async () => {
      attempts += 1;
      if (attempts > 150) {
        clearInterval(timer);
        box.textContent = '二维码超时，请重新生成。';
        return;
      }
      try {
        const poll = await api('/api/bilibili/poll', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ key: data.key })
        }).then((r) => r.json());
        if (poll.status === 'ok') {
          clearInterval(timer);
          box.textContent = '登录成功。';
          await loadState();
        } else if (['expired', 'error', 'fail'].includes(String(poll.status || ''))) {
          clearInterval(timer);
          box.textContent = '二维码已过期，请重新生成。';
        }
      } catch {
        clearInterval(timer);
        box.textContent = '登录轮询中断。';
      }
    }, 2000);
  } catch (error) {
    box.textContent = String(error.message || error);
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
    const res = await api('/api/qzone/send', {
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
    await api('/api/bilibili/logout', { method: 'POST' });
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

function mindAgo(timestamp) {
  const value = Number(timestamp);
  if (!value) return '还没有记录';
  const diff = Date.now() - value;
  if (diff < 10 * 60 * 1000) return '刚刚还有声音';
  if (diff < 60 * 60 * 1000) return '有一阵没声音了';
  if (diff < 6 * 60 * 60 * 1000) return '安静了很久';
  return '很久没有声音了';
}

function renderSlang(list) {
  const html = (list || []).slice(-30).reverse().map((item) => {
    const term = esc(item.term || '');
    const meaning = esc(item.meaning || '');
    const usage = item.usage ? `用法：${esc(item.usage)}` : '';
    const source = item.source === 'group-observer' ? '群里刚收的' : '已有的';
    return `<div class="result-item">${term}<small>${meaning}${usage ? ' · ' + usage : ''} · ${source}</small></div>`;
  }).join('');
  $('#mindSlang').innerHTML = html || '<p class="muted">还没有。</p>';
}

function renderMindReads(reads) {
  const html = (reads || []).slice(0, 8).map((item) => {
    const title = esc(item.title || item.bvid || '一个视频');
    const meta = [item.source === 'subtitle' ? '字幕' : '简介', mindAgo(item.at)].filter(Boolean).join(' · ');
    return `<div class="result-item">${title}<small>${meta}</small></div>`;
  }).join('');
  $('#mindReads').innerHTML = html || '<p class="muted">还没有。</p>';
}

async function loadMind() {
  const data = await getJson('/api/mind', {});
  $('#mindSelf').value = data.self || '';
  $('#mindNow').value = data.now || '';
  $('#mindUndercurrent').value = data.undercurrent || '';
  $('#mindUnfinished').value = data.unfinished || '';
  $('#mindWorldview').value = data.worldview || '';
  $('#mindSeen').value = data.seen || '';
  $('#mindHeld').value = data.held || '';
  $('#mindPresence').textContent = mindAgo(data.presence?.lastContactAt);
  autoGrowAll();
}

async function saveMind() {
  const sections = [
    ['self', '#mindSelf'],
    ['now', '#mindNow'],
    ['undercurrent', '#mindUndercurrent'],
    ['unfinished', '#mindUnfinished'],
    ['worldview', '#mindWorldview'],
    ['seen', '#mindSeen']
  ];
  for (const [section, selector] of sections) {
    const res = await api('/api/mind/section', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ section, text: $(selector).value })
    });
    if (!res.ok) throw new Error('保存失败');
  }
  $('#mindStatus').textContent = '保存了。只在她自己的文件里。';
}

async function mindDaydream() {
  $('#mindStatus').textContent = '她在一个人待一会儿…';
  $('#mindDaydream').disabled = true;
  try {
    const data = await getJson('/api/mind/daydream', null);
    await loadMind();
    $('#mindStatus').textContent = data.text ? '刚才那段已经写进暗流，没有发出去。' : '她什么都没想。';
  } catch (error) {
    $('#mindStatus').textContent = String(error.message || error);
  } finally {
    $('#mindDaydream').disabled = false;
  }
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
async function loadPermissions() {
  const box = $('#permissionList');
  if (!box) return;
  box.textContent = '读取中…';
  try {
    const res = await api('/api/permissions', { cache: 'no-store' });
    const data = await res.json();
    box.replaceChildren();
    const add = (item, kind) => {
      const row = document.createElement('div');
      row.className = 'result-item';
      const text = document.createElement('div');
      const mins = kind === 'active' ? `｜还剩 ${Math.max(0, Math.round((Number(item.expiresAt) - Date.now()) / 60000))} 分钟` : '';
      text.textContent = `${kind === 'pending' ? '待批' : '有效'} ${item.id}｜${item.what}${mins}｜${(item.keys || []).join(', ') || '全部'}`;
      row.append(text);
      const make = (label, action, extra = {}) => {
        const b = document.createElement('button');
        b.className = 'text-btn';
        b.type = 'button';
        b.textContent = label;
        b.addEventListener('click', () => permissionAction(action, item.id, extra));
        row.append(b);
      };
      if (kind === 'pending') { make('同意', 'approve'); make('拒绝', 'deny'); }
      else { make('撤回', 'revoke'); make('+10 分钟', 'adjust', { addMinutes: 10 }); make('-10 分钟', 'adjust', { addMinutes: -10 }); }
      box.append(row);
    };
    for (const item of data.pending || []) add(item, 'pending');
    for (const item of data.active || []) add(item, 'active');
    if (!box.children.length) box.textContent = '没有待批或有效的许可。';
  } catch (error) {
    box.textContent = String(error.message || error);
  }
}

async function permissionAction(action, id, extra = {}) {
  try {
    const res = await api('/api/permissions/action', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, id, ...extra })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '操作失败');
    await loadPermissions();
  } catch (error) {
    const box = $('#permissionList');
    if (box) box.textContent = String(error.message || error);
  }
}

async function loadMilestones() {
  const box = $('#milestoneList');
  if (!box) return;
  box.textContent = '读取中…';
  try {
    const res = await api('/api/milestones', { cache: 'no-store' });
    const data = await res.json();
    box.replaceChildren();
    for (const entry of data.entries || []) {
      const row = document.createElement('div');
      row.className = 'result-item';
      const text = document.createElement('div');
      text.textContent = entry.what;
      row.append(text);
      const b = document.createElement('button');
      b.className = 'text-btn';
      b.type = 'button';
      b.textContent = '删掉';
      b.addEventListener('click', () => deleteMilestone(entry.at));
      row.append(b);
      box.append(row);
    }
    if (!box.children.length) box.textContent = '还没有节点。';
  } catch (error) {
    box.textContent = String(error.message || error);
  }
}

async function deleteMilestone(at) {
  try {
    const res = await api('/api/milestones/delete', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ at })
    });
    if (!res.ok) throw new Error('删除失败');
    await loadMilestones();
  } catch (error) {
    const box = $('#milestoneList');
    if (box) box.textContent = String(error.message || error);
  }
}

async function loadDiary() {
  const box = $('#diaryList');
  if (!box) return;
  box.textContent = '读取中…';
  try {
    const res = await api('/api/diary', { cache: 'no-store' });
    const data = await res.json();
    box.replaceChildren();
    for (const entry of data.entries || []) {
      const row = document.createElement('div');
      row.className = 'result-item';
      const text = document.createElement('div');
      text.textContent = entry.text;
      row.append(text);
      const b = document.createElement('button');
      b.className = 'text-btn';
      b.type = 'button';
      b.textContent = '删掉';
      b.addEventListener('click', () => deleteDiary(entry.at));
      row.append(b);
      box.append(row);
    }
    if (!box.children.length) box.textContent = '还没写过。';
  } catch (error) {
    box.textContent = String(error.message || error);
  }
}

async function deleteDiary(at) {
  try {
    const res = await api('/api/diary/delete', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ at })
    });
    if (!res.ok) throw new Error('删除失败');
    await loadDiary();
  } catch (error) {
    const box = $('#diaryList');
    if (box) box.textContent = String(error.message || error);
  }
}

async function loadMemory() {
  const box = $('#memoryList');
  if (!box) return;
  box.textContent = '读取中…';
  try {
    const res = await api('/api/memory/contacts', { cache: 'no-store' });
    const data = await res.json();
    box.replaceChildren();
    for (const c of data.contacts || []) {
      const row = document.createElement('div');
      row.className = 'result-item';
      const text = document.createElement('div');
      text.textContent = `${c.name || c.id}｜${(c.notes || []).map((n) => n.text).join(' / ') || '没有备注'}`;
      row.append(text);
      const make = (label, note) => {
        const b = document.createElement('button');
        b.className = 'text-btn';
        b.type = 'button';
        b.textContent = label;
        b.addEventListener('click', () => forgetMemory(c.id, note));
        row.append(b);
      };
      for (const n of (c.notes || []).slice(-2)) make('忘掉这句', n.text);
      make('忘掉这个人', '');
      box.append(row);
    }
    if (!box.children.length) box.textContent = '还没有记住的人。';
  } catch (error) {
    box.textContent = String(error.message || error);
  }
}

async function forgetMemory(id, text) {
  try {
    const res = await api('/api/memory/forget', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, text })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '删除失败');
    await loadMemory();
  } catch (error) {
    const box = $('#memoryList');
    if (box) box.textContent = String(error.message || error);
  }
}

$('#loadMemory').addEventListener('click', loadMemory);
loadMemory().catch(() => {});
loadDiary().catch(() => {});
loadMilestones().catch(() => {});
$('#loadMilestones').addEventListener('click', loadMilestones);
$('#loadDiary').addEventListener('click', loadDiary);
$('#saveCard').addEventListener('click', saveCard);
let personaHistory = [];
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
