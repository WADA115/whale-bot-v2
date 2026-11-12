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

