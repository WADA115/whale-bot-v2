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
