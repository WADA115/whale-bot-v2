import fs from 'node:fs';
const cfg = JSON.parse(fs.readFileSync(process.env.SNOWLUMA_CONFIG || 'state/snowluma-onebot.json', 'utf8'));
const token = cfg.networks.httpServers[0].accessToken;
const text = '他今天还是那副样子，嘴上说没事，其实累得很。希望他今晚能早点睡，别再跟那些破事较劲。';
const res = await fetch('http://127.0.0.1:3000/send_qzone_msg', {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8', authorization: `Bearer ${token}` },
  body: JSON.stringify({ content: text, ugc_right: 4 })
});
const raw = await res.text();
console.log(raw);
