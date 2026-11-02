function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cardBlock(card) {
  if (!card) return '<p class="muted">未启用角色卡</p>';
  return `
    <h2>${esc(card.name || '未命名')}</h2>
    <p>${esc(card.identity || '')}</p>
    <h3>说话方式</h3>
    <p>${esc((card.voice || []).join('；'))}</p>
    <h3>边界</h3>
    <p>${esc((card.boundaries || []).join('；'))}</p>
  `;
}

function listBlock(items, render) {
  if (!items?.length) return '<p class="muted">暂无</p>';
  return `<ul>${items.map((x) => `<li>${render(x)}</li>`).join('')}</ul>`;
}

function cardEditor(card) {
  if (!card) return '';
  return `
  <details>
    <summary>编辑角色卡</summary>
    <label>名字<input id="cardName" value="${esc(card.name || '')}"></label>
    <label>身份<textarea id="cardIdentity" rows="3">${esc(card.identity || '')}</textarea></label>
    <label>说话方式（每行一条）<textarea id="cardVoice" rows="4">${esc((card.voice || []).join('\n'))}</textarea></label>
    <label>在意什么（每行一条）<textarea id="cardValues" rows="4">${esc((card.values || []).join('\n'))}</textarea></label>
    <label>边界（每行一条）<textarea id="cardBoundaries" rows="3">${esc((card.boundaries || []).join('\n'))}</textarea></label>
    <button type="button" onclick="saveCard()">保存角色卡</button>
    <button type="button" class="danger" onclick="clearTasks()">清空任务</button>
    <button type="button" class="danger" onclick="clearScenes()">清空场景</button>
    <a class="button-link" href="/api/character/export">导出角色卡</a>
    <a class="button-link" href="/api/export">导出全部状态</a>
    <div class="row"><input type="file" id="cardFile" accept="application/json"><button type="button" onclick="importCard()">导入角色卡</button></div>
    <p class="muted">保存前会自动备份 .bak；清空操作不可撤销。</p>
  </details>`;
}

export function renderPanel({ status, card, scenes, tasks, bilibili, autonomy, story }) {
  const sceneEntries = Object.entries(scenes ?? {});
  const taskList = tasks ?? [];
  const bili = bilibili ?? { enabled: false, loggedIn: false };
  const auto = autonomy ?? { enabled: false, discoveries: [] };
  const storyChats = story ?? [];
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>小鲸鱼 · Character Runtime</title>
  <style>
    :root { color-scheme: light dark; --bg:#0b1220; --card:#121c2e; --text:#e6edf7; --muted:#8ea3bf; --accent:#5cc8ff; }
    * { box-sizing: border-box; }
    body { margin:0; font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif; background:var(--bg); color:var(--text); }
    main { max-width: 980px; margin: 0 auto; padding: 28px 20px 60px; }
    h1 { font-size: 24px; margin: 0 0 4px; }
    h2 { font-size: 18px; margin: 22px 0 8px; }
    h3 { font-size: 14px; color: var(--accent); margin: 14px 0 4px; }
    .muted { color: var(--muted); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(260px,1fr)); gap: 14px; }
    .card { background: var(--card); border: 1px solid #22324d; border-radius: 14px; padding: 16px 18px; }
    .pill { display:inline-block; padding:2px 9px; border-radius:999px; background:#17324d; color:#9fdcff; font-size:12px; margin-right:6px; }
    ul { padding-left: 18px; }
    li { margin: 3px 0; }
    code { color:#ffd479; }
    details { margin-top: 14px; }
    summary { cursor: pointer; color: var(--accent); }
    label { display:block; margin: 10px 0 4px; font-size: 13px; color: var(--muted); }
    input, textarea { width:100%; padding:8px 10px; border-radius:8px; border:1px solid #2a3b58; background:#0d1728; color:var(--text); font:inherit; }
    button { margin-top:10px; margin-right:8px; padding:8px 12px; border-radius:8px; border:1px solid #2a6d95; background:#123a55; color:#d9f3ff; cursor:pointer; }
    button.danger { border-color:#7a3040; background:#3a1620; color:#ffd6de; }
    .button-link { display:inline-block; margin:10px 8px 0 0; padding:7px 11px; border-radius:8px; border:1px solid #2a6d95; color:#d9f3ff; text-decoration:none; font-size:13px; }
    .row { display:flex; gap:8px; align-items:center; margin-top:10px; flex-wrap:wrap; }
    .row input { flex:1; min-width:140px; }
    select { padding:8px 10px; border-radius:8px; border:1px solid #2a3b58; background:#0d1728; color:var(--text); }
  </style>
</head>
<body>
<main>
  <h1>小鲸鱼 · Character Runtime</h1>
  <p class="muted">v2 私聊角色运行时 · 本地只读面板 · ${esc(new Date().toLocaleString('zh-CN'))}</p>
  <div class="grid">
    <section class="card">
      <span class="pill">${esc(status.mode)}</span>
      <span class="pill">${status.connected ? 'OneBot connected' : 'OneBot disconnected'}</span>
      <span class="pill">tasks ${esc(status.tasks ?? 0)}</span>
      <p class="muted">uptime ${esc(status.uptimeSec)}s · sent ${esc(status.sent)}</p>
      ${cardBlock(card)}
      ${cardEditor(card)}
    </section>
    <section class="card">
      <h2>场景</h2>
      ${listBlock(sceneEntries, ([key, scene]) => `<code>${esc(key)}</code> · ${esc(scene.where)} · ${esc(scene.recent || '')}`)}
    </section>
    <section class="card">
      <h2>QQ 动态</h2>
      <button type="button" onclick="qzoneFeeds()">看好友动态</button>
      <textarea id="qzoneText" rows="3" placeholder="发一条说说（仅自己可见）"></textarea>
      <button type="button" onclick="qzoneSend()">发仅自己可见</button>
      <div id="qzoneList"></div>
    </section>
    <section class="card">
      <h2>B站</h2>
      <p>${bili.loggedIn ? `已登录：${esc(bili.user?.name || bili.user?.mid || '未知')}` : '未登录'}</p>
      <button type="button" onclick="biliLogin()">扫码登录</button>
      <button type="button" onclick="biliPopular()">看热门</button>
      <button type="button" class="danger" onclick="biliLogout()">退出</button>
      <div class="row"><input id="biliQuery" placeholder="关键词搜索 B站视频"><button type="button" onclick="biliSearch()">搜索</button></div>
      <div id="biliBox" class="muted"></div>
      <div id="biliList"></div>
    </section>
    <section class="card">
      <h2>自主发现</h2>
      <p class="muted">${auto.enabled ? '已开启' : '已关闭'} · 今日通知 ${esc(auto.countToday ?? 0)}</p>
      <button type="button" onclick="autonomyTick()">立即采集</button>
      ${listBlock(auto.discoveries ?? [], (x) => `${esc(x.title)} <span class="muted">(${esc(x.source)})</span>`)}
    </section>
    <section class="card">
      <h2>故事</h2>
      <div class="row">
        <select id="storyKey">${storyChats.map((k) => `<option value="${esc(k)}">${esc(k)}</option>`).join('')}</select>
        <button type="button" onclick="loadStory()">读取</button>
        <button type="button" onclick="saveStory()">保存</button>
      </div>
      <label>此刻<textarea id="storyNow" rows="8" placeholder="此刻 / 心里 / 猜 / 打算"></textarea></label>
      <label>我们<textarea id="storyRelation" rows="5" placeholder="关系章节"></textarea></label>
    </section>
    <section class="card">
      <h2>任务入站箱</h2>
      ${listBlock(taskList.slice(-20).reverse(), (x) => `${esc(x.text)} <span class="muted">(${esc(x.status)})</span>`)}
    </section>
  </div>
  <p class="muted" style="margin-top:24px">本地面板，只监听 127.0.0.1。角色卡保存有 .bak 备份。</p>
</main>
<script>
  const val = (id) => document.getElementById(id)?.value ?? '';
  const lines = (id) => val(id).split('\\n').map((x) => x.trim()).filter(Boolean);
  async function saveCard() {
    const body = {
      name: val('cardName'),
      identity: val('cardIdentity'),
      voice: lines('cardVoice'),
      values: lines('cardValues'),
      boundaries: lines('cardBoundaries')
    };
    const res = await fetch('/api/character', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) location.reload();
    else alert('保存失败：' + (await res.text()));
  }
  async function clearTasks() {
    if (!confirm('确定清空任务入站箱？')) return;
    const res = await fetch('/api/tasks/clear', { method: 'POST' });
    if (res.ok) location.reload();
  }
  async function clearScenes() {
    if (!confirm('确定清空全部场景？角色会忘记当前话题。')) return;
    const res = await fetch('/api/scenes/clear', { method: 'POST' });
    if (res.ok) location.reload();
  }
  async function importCard() {
    const file = document.getElementById('cardFile')?.files?.[0];
    if (!file) return alert('先选一个 JSON 角色卡');
    try {
      const card = JSON.parse(await file.text());
      const res = await fetch('/api/character', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(card) });
      if (res.ok) location.reload();
      else alert('导入失败：' + (await res.text()));
    } catch (error) {
      alert('JSON 解析失败：' + error.message);
    }
  }
  async function loadStory() {
    const key = document.getElementById('storyKey')?.value;
    if (!key) return alert('还没有 story');
    const res = await fetch('/api/story?key=' + encodeURIComponent(key));
    if (!res.ok) return alert('读取失败');
    const data = await res.json();
    document.getElementById('storyNow').value = data.now || '';
    document.getElementById('storyRelation').value = data.relationship || '';
  }
  async function saveStory() {
    const key = document.getElementById('storyKey')?.value;
    if (!key) return;
    const now = document.getElementById('storyNow')?.value || '';
    const relationship = document.getElementById('storyRelation')?.value || '';
    for (const [section, text] of [['now', now], ['relationship', relationship]]) {
      const res = await fetch('/api/story/section', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key, section, text }) });
      if (!res.ok) return alert('保存失败：' + section);
    }
    location.reload();
  }
  async function biliLogin() {
    const box = document.getElementById('biliBox');
    box.textContent = '生成二维码…';
    const res = await fetch('/api/bilibili/login', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) { box.textContent = '登录失败：' + (data.error || res.status); return; }
    box.innerHTML = '<p>用 B 站 App 扫码</p><img alt="B站登录二维码" style="width:260px;height:260px;border-radius:12px;background:#fff" src="' + data.qrImage + '">';
    const timer = setInterval(async () => {
      const r = await fetch('/api/bilibili/poll', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: data.key }) });
      const p = await r.json();
      if (p.status === 'ok') { clearInterval(timer); location.reload(); }
      else if (p.status === 'scanned') box.querySelector('p').textContent = '已扫码，请在手机上确认';
      else if (p.status === 'expired' || p.status === 'failed') { clearInterval(timer); box.textContent = '二维码失效，请重新生成'; }
    }, 2000);
  }
  async function biliLogout() {
    if (!confirm('退出 B 站登录？')) return;
    await fetch('/api/bilibili/logout', { method: 'POST' });
    location.reload();
  }
  async function biliPopular() {
    const box = document.getElementById('biliList');
    box.textContent = '加载中…';
    const res = await fetch('/api/bilibili/popular?limit=5');
    const data = await res.json();
    if (!res.ok) { box.textContent = '加载失败：' + (data.error || res.status); return; }
    box.innerHTML = '';
    const ul = document.createElement('ul');
    for (const item of data.list || []) {
      const li = document.createElement('li');
      li.textContent = item.title + ' · ' + item.owner;
      ul.appendChild(li);
    }
    box.appendChild(ul);
  }
  async function biliSearch() {
    const q = document.getElementById('biliQuery')?.value?.trim();
    if (!q) return alert('先输入关键词');
    const box = document.getElementById('biliList');
    box.textContent = '搜索中…';
    const res = await fetch('/api/bilibili/search?q=' + encodeURIComponent(q) + '&limit=5');
    const data = await res.json();
    if (!res.ok) { box.textContent = '搜索失败：' + (data.error || res.status); return; }
    box.innerHTML = '';
    const ul = document.createElement('ul');
    for (const item of data.list || []) {
      const li = document.createElement('li');
      li.textContent = item.title + ' · ' + item.owner;
      ul.appendChild(li);
    }
    box.appendChild(ul);
  }
  async function qzoneFeeds() {
    const box = document.getElementById('qzoneList');
    box.textContent = '加载中…';
    const res = await fetch('/api/qzone/feeds?count=5');
    const data = await res.json();
    if (!res.ok) { box.textContent = '加载失败：' + (data.error || res.status); return; }
    const feeds = data.data?.feeds || data.feeds || [];
    box.innerHTML = '';
    const ul = document.createElement('ul');
    for (const item of feeds) {
      const li = document.createElement('li');
      li.textContent = (item.nickname || item.uin || '') + '：' + String(item.content || '').slice(0, 80);
      ul.appendChild(li);
    }
    box.appendChild(ul);
  }
  async function qzoneSend() {
    const content = document.getElementById('qzoneText')?.value?.trim();
    if (!content) return alert('先写内容');
    if (!confirm('发一条仅自己可见的说说？')) return;
    const res = await fetch('/api/qzone/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content, confirm: true }) });
    const data = await res.json();
    if (res.ok) { alert('已发，仅自己可见'); location.reload(); }
    else alert('发送失败：' + (data.error || res.status));
  }
  async function autonomyTick() {
    const res = await fetch('/api/autonomy/tick', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) return alert('采集失败：' + (data.error || res.status));
    alert('采集到 ' + (data.count || 0) + ' 条');
    location.reload();
  }
</script>
</body>
</html>`;
}
