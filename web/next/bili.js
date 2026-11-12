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

