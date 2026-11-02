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
  logger = null
}) {
  const bubbles = splitBubbles(text);
  if (!bubbles.length) return { bubbles: 0, stickerSent: false, voiceSent: false };

  for (const bubble of bubbles) {
    await gateway.sendText(kind, id, bubble);
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
