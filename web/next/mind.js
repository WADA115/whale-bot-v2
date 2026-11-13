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
