import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { OneBotGateway } from '../src/gateway/onebot.js';

test('gateway 登录与发送文本', async () => {
  const received = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      received.push({ url: req.url, body: JSON.parse(body || '{}') });
      res.setHeader('content-type', 'application/json');
      if (req.url === '/get_login_info') {
        res.end(JSON.stringify({ status: 'ok', retcode: 0, data: { user_id: 10002, nickname: '鱼鱼' } }));
      } else if (req.url === '/send_group_msg') {
        res.end(JSON.stringify({ status: 'ok', retcode: 0, data: { message_id: 1 } }));
      } else {
        res.end(JSON.stringify({ status: 'failed', retcode: 1400, message: 'bad' }));
      }
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const gateway = new OneBotGateway({
    httpUrl: `http://127.0.0.1:${port}`,
    wsUrl: 'ws://127.0.0.1:1',
    accessToken: 'secret'
  });
  const login = await gateway.getLoginInfo();
  assert.equal(login.id, '10002');
  assert.equal(login.nickname, '鱼鱼');
  const out = await gateway.sendText('group', '20001', '在');
  assert.equal(out.message_id, 1);
  assert.equal(received[1].body.group_id, '20001');
  assert.match(received[1].body.message[0].data.text, /在/);
  server.close();
});

test('gateway 规范化群消息', () => {
  const gateway = new OneBotGateway({ httpUrl: 'http://x', wsUrl: 'ws://x' });
  const message = gateway.normalize({
    post_type: 'message',
    message_type: 'group',
    self_id: 100,
    group_id: 200,
    user_id: 300,
    message_id: 400,
    sender: { user_id: 300, card: '甲' },
    message: [{ type: 'at', data: { qq: '100' } }, { type: 'text', data: { text: ' 在吗 ' } }, { type: 'image', data: { url: 'https://example.com/a.png' } }, { type: 'record', data: { url: 'https://example.com/a.amr' } }]
  });
  assert.equal(message.key, 'group:200');
  assert.equal(message.text, '在吗');
  assert.deepEqual(message.at, ['100']);
  assert.equal(message.images.length, 1);
  assert.equal(message.images[0].url, 'https://example.com/a.png');
  assert.equal(message.voices.length, 1);
  assert.equal(gateway.isSelf({ selfId: '100', userId: '100' }), true);
});
