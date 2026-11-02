function hash(text) {
  let value = 0;
  for (let i = 0; i < text.length; i += 1) value = (value * 31 + text.charCodeAt(i)) >>> 0;
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function splitBubbles(text, max = 3) {
  const value = String(text ?? '').replace(/\r/g, '').trim();
  if (!value) return [];
  if (value.length <= 90 && !value.includes('\n')) return [value];
  const pieces = value
    .split(/(?<=[。！？!?；;])|\n+/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (!pieces.length) return [value];
  const bubbles = [];
  for (const piece of pieces) {
    const last = bubbles[bubbles.length - 1];
    if (last && (last.length < 24 || piece.length < 8) && bubbles.length < max) bubbles[bubbles.length - 1] = `${last}${piece}`;
    else bubbles.push(piece);
    if (bubbles.length >= max && piece !== pieces[pieces.length - 1]) {
      bubbles[bubbles.length - 1] = `${bubbles[bubbles.length - 1]}${pieces.slice(pieces.indexOf(piece) + 1).join('')}`;
      break;
    }
  }
  return bubbles.filter(Boolean).slice(0, max);
}

export function replyPause(text, kind = 'private') {
  const value = String(text ?? '');
  const base = 420 + Math.min(900, value.length * 16);
  const variance = hash(value) % 360;
  return kind === 'group' ? Math.round((base + variance) * 0.8) : base + variance;
}

export function bubblePause(text) {
  return 260 + Math.min(520, String(text ?? '').length * 18);
}

export async function sendHumanReply({
  gateway,
  kind,
  id,
  text,
  sticker = null,
  tts = null,
  ttsAllowed = false,
  logger = null
}) {
  const bubbles = splitBubbles(text, 3);
  if (!bubbles.length) return { bubbles: 0, stickerSent: false, voiceSent: false };
  await sleep(replyPause(text, kind));
  for (let i = 0; i < bubbles.length; i += 1) {
    await gateway.sendText(kind, id, bubbles[i]);
    if (i < bubbles.length - 1) await sleep(bubblePause(bubbles[i]));
  }
  let stickerSent = false;
  if (sticker) {
    await gateway.sendMessage(kind, id, [{ type: 'image', data: { file: sticker.url } }]);
    stickerSent = true;
    logger?.info('expression.sent', { key: `${kind}:${id}`, desc: sticker.desc });
  }
  let voiceSent = false;
  if (ttsAllowed && tts) {
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
  return { bubbles: bubbles.length, stickerSent, voiceSent };
}
