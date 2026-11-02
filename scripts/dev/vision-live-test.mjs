import fs from 'node:fs';
import http from 'node:http';
import { loadConfig } from '../src/config.js';
import { createVisionRouter } from '../src/core/vision.js';

const { config } = loadConfig();
const image = fs.readFileSync('E:/NapCat/qq-login3.png');
const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'image/png' });
  res.end(image);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const router = createVisionRouter({
  providers: config.vision.providers,
  logger: { info: (e, f) => console.error('[info]', e, f), warn: (e, f) => console.error('[warn]', e, f) }
});
try {
  const out = await router.describe({
    message: { segments: [{ type: 'image', data: { url: `http://127.0.0.1:${port}/test.png` } }] }
  });
  console.log(JSON.stringify({ provider: out.provider, text: out.text }, null, 2));
} catch (error) {
  console.error('VISION FAILED', error?.message ?? error);
  process.exitCode = 1;
} finally {
  server.close();
}
