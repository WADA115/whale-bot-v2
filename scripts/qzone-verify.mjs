import fs from 'node:fs';
const cfg = JSON.parse(fs.readFileSync(process.env.SNOWLUMA_CONFIG || 'state/snowluma-onebot.json', 'utf8'));
const token = cfg.networks.httpServers[0].accessToken;
const res = await fetch('http://127.0.0.1:3000/get_qzone_msg_list', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({ pos: 0, num: 3 })
});
const data = await res.json();
console.log(JSON.stringify(data.data?.msglist?.map((x) => ({ tid: x.tid, content: x.content, private: x.is_private })), null, 2));
