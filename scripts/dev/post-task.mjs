const res = await fetch('http://127.0.0.1:3201/simulate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: '帮我写个周报', userId: '10001', name: '阿杰' }) });
console.log(res.status, await res.text());
