function renderChrome() {
  const status = state.status || {};
  const connected = Boolean(status.connected) && !offline;
  $('#topStatus').innerHTML = `<span class="dot ${connected ? 'on' : ''}"></span><span>${offline ? '离线 · 示例数据' : connected ? '已连接' : '未连接'}</span>`;
  $('#dockStatus').textContent = offline ? '离线，显示示例数据' : connected ? `${status.mode || ''} · 在线` : '等待连接';
}

function applyOfflineMode() {
  for (const el of document.querySelectorAll('button, input, textarea, select')) {
    if (el.classList.contains('rail-item')) continue;
    if (offline) {
      if (el.dataset.offlineDisabled === undefined) el.dataset.offlineDisabled = el.disabled ? '1' : '0';
      el.disabled = true;
    } else if (el.dataset.offlineDisabled !== undefined) {
      el.disabled = el.dataset.offlineDisabled === '1';
      delete el.dataset.offlineDisabled;
    }
  }
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
  $('#charBounds').innerHTML = (card.boundaries || []).map((x) => `<div class="line-item">${esc(x)}</div>`).join('') || '<p class="muted">还没有写。</p>';
  $('#charSelf').textContent = story?.self || '还没有 self.md。';
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

