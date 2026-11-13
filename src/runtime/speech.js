function hash(text) {
  let value = 0;
  for (let i = 0; i < text.length; i += 1) value = (value * 31 + text.charCodeAt(i)) >>> 0;
  return value;
}

function pauseMs(text, kind) {
  const value = String(text ?? '');
  const base = 900 + Math.min(1800, value.length * 13);
  const variance = hash(value) % 420;
  return Math.round((base + variance) * (kind === 'group' ? 0.8 : 1));
}

function typingMs(text) {
  const value = String(text ?? '');
  const marks = (value.match(/[，,。！？!?；;：:]/g) || []).length;
  return 240 + Math.min(1900, value.length * 34 + marks * 90);
}

function wait(ms, interrupted) {
  return new Promise((resolve) => {
    const started = Date.now();
    const timer = setInterval(() => {
      let stop = false;
      try { stop = Boolean(interrupted?.()); } catch { stop = true; }
      if (stop || Date.now() - started >= ms) {
        clearInterval(timer);
        resolve(!stop);
      }
    }, 90);
  });
}

export function splitBubbles(text) {
  const value = String(text ?? '').replace(/\r/g, '').trim();
  if (!value) return [];
  return value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function sendHumanReply({
  gateway,
  kind,
  id,
  text,
  sticker = null,
  tts = null,
  ttsAllowed = false,
  interrupted = null,
  timing = true,
  logger = null
}) {
  const bubbles = splitBubbles(text);
  if (!bubbles.length) return { bubbles: 0, deliveredText: '', stickerSent: false, voiceSent: false, interrupted: false };
  if (interrupted?.()) return { bubbles: 0, deliveredText: '', stickerSent: false, voiceSent: false, interrupted: true };

  if (timing) {
    const ready = await wait(pauseMs(text, kind), interrupted);
    if (!ready) return { bubbles: 0, deliveredText: '', stickerSent: false, voiceSent: false, interrupted: true };
  }

  const delivered = [];
  for (let i = 0; i < bubbles.length; i += 1) {
    if (interrupted?.()) break;
    await gateway.sendText(kind, id, bubbles[i]);
    delivered.push(bubbles[i]);
    if (timing && i < bubbles.length - 1) {
      const ready = await wait(typingMs(bubbles[i]), interrupted);
      if (!ready) break;
    }
  }
  const stopped = Boolean(interrupted?.());
  if (!delivered.length) return { bubbles: 0, deliveredText: '', stickerSent: false, voiceSent: false, interrupted: true };

  let stickerSent = false;
  if (sticker && !stopped) {
    const emojiId = String(sticker.md5 || (String(sticker.resId || sticker.id || '').match(/[0-9a-fA-F]{32}/)?.[0]) || '');
    const segment = String(id) === 'local'
      ? { type: 'local-sticker', data: { url: sticker.url || '', text: sticker.desc || '[表情]' } }
      : emojiId
        ? { type: 'mface', data: { emojiId, emojiPackageId: String(sticker.emojiPackageId || ''), emojiKey: String(sticker.resId || sticker.id || ''), text: sticker.desc || '[表情]' } }
        : { type: 'image', data: { file: sticker.url } };
    try {
      await gateway.sendMessage(kind, id, [segment]);
      stickerSent = true;
    } catch (error) {
      logger?.warn('expression.mface_failed', { error: String(error?.message ?? error) });
      try {
        await gateway.sendMessage(kind, id, [{ type: 'image', data: { file: sticker.url } }]);
        stickerSent = true;
      } catch (fallbackError) {
        logger?.warn('expression.fallback_failed', { error: String(fallbackError?.message ?? fallbackError) });
      }
    }
    if (stickerSent) logger?.info('expression.sent', { key: `${kind}:${id}`, desc: sticker.desc });
  }

  let voiceSent = false;
  if (ttsAllowed && tts && !stopped) {
    try {
      const file = await tts.synthesize(text);
      if (file) {
        await gateway.sendMessage(kind, id, [{ type: 'record', data: { file } }]);
        voiceSent = true;
      }
    } catch (error) {
      logger?.warn('tts.failed', { key: `${kind}:${id}`, error: String(error?.message ?? error) });
    }
  }

  return { bubbles: delivered.length, deliveredText: delivered.join('\n'), stickerSent, voiceSent, interrupted: stopped };
}
