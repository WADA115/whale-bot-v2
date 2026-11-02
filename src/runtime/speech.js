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
  logger = null
}) {
  const bubbles = splitBubbles(text);
  if (!bubbles.length) return { bubbles: 0, deliveredText: '', stickerSent: false, voiceSent: false, interrupted: false };
  if (interrupted?.()) return { bubbles: 0, deliveredText: '', stickerSent: false, voiceSent: false, interrupted: true };

  const delivered = [];
  for (const bubble of bubbles) {
    if (interrupted?.()) break;
    await gateway.sendText(kind, id, bubble);
    delivered.push(bubble);
  }
  const stopped = Boolean(interrupted?.());
  if (!delivered.length) return { bubbles: 0, deliveredText: '', stickerSent: false, voiceSent: false, interrupted: true };

  let stickerSent = false;
  if (sticker && !stopped) {
    await gateway.sendMessage(kind, id, [{ type: 'image', data: { file: sticker.url } }]);
    stickerSent = true;
    logger?.info('expression.sent', { key: `${kind}:${id}`, desc: sticker.desc });
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
