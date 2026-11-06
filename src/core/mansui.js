import fs from 'node:fs';
import path from 'node:path';

export function createMansui({
  url = 'http://127.0.0.1:9880/tts',
  refAudio = 'E:/AI/GPT-SoVITS/dataset/mansui-ref.wav',
  promptText = '我怕他问的多了会起疑心便干脆装成鸭吧',
  promptLang = 'zh',
  outDir = 'state/voice',
  timeoutMs = 90000,
  logger = null
} = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  async function speak(text) {
    const body = JSON.stringify({
      text, text_lang: 'zh',
      ref_audio_path: refAudio, prompt_text: promptText, prompt_lang: promptLang,
      text_split_method: 'cut5', batch_size: 1, media_type: 'wav', streaming_mode: false
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: controller.signal });
      if (!res.ok) throw new Error(`mansui http ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1000) throw new Error('mansui empty');
      const file = path.join(outDir, `mansui-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.wav`);
      fs.writeFileSync(file, buf);
      logger?.info('mansui.synthesized', { chars: text.length, bytes: buf.length });
      return file;
    } finally { clearTimeout(timer); }
  }
  async function health() {
    try { const r = await fetch('http://127.0.0.1:9880/health', { signal: AbortSignal.timeout(3000) }); return { ok: r.ok, url }; }
    catch { return { ok: false, url }; }
  }
  return { speak, health };
}
