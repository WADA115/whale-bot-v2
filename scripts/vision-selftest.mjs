import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, ROOT } from '../src/config.js';
import { createVisionRouter } from '../src/core/vision.js';
const { config } = loadConfig({ configPath: path.join(ROOT, 'config.json') });
const buf = fs.readFileSync(path.join(ROOT, 'web', 'assets', 'xiaoshen', 'avatar.png'));
const url = `data:image/png;base64,${buf.toString('base64')}`;
const message = { segments: [{ type: 'image', data: { url } }] };
for (const provider of config.vision.providers) {
  const router = createVisionRouter({ providers: [provider], logger: console });
  try {
    const r = await router.describe({ message, prompt: '只描述你看到的主体，20字以内。' });
    console.log(provider.id, 'OK', r.provider, r.text.slice(0, 80));
  } catch (e) {
    console.log(provider.id, 'FAIL', String(e.message || e).slice(0, 300));
  }
}
