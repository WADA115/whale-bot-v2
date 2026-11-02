const res = await fetch('http://127.0.0.1:3201/simulate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'group', groupId: '20001', userId: '10001', name: '甲', text: '@小鲸鱼 在不', dryRun: true }) });
console.log(res.status, await res.text());
