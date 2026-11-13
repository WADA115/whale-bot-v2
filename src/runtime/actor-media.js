function withDeadline(promise, ms) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; resolve(null); } }, Math.max(100, Number(ms) || 0));
    Promise.resolve(promise).then((value) => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } }).catch(() => { if (!settled) { settled = true; clearTimeout(timer); resolve(null); } });
  });
}
export async function readMediaContext({ current, config, visionRouter, visionLimiter, asr, asrLimiter, mind, stats, metrics, logger, key }) {
    let imageDesc = '';
    let imagePending = false;
    if (current.images?.length && config.vision?.enabled !== false) {
      const visionWaitMs = Number(config.media?.visionWaitMs) || 10000;
      const visionPromise = visionLimiter ? visionLimiter.run(() => visionRouter.describe({ message: current })) : visionRouter.describe({ message: current });
      try {
        const described = await withDeadline(visionPromise, visionWaitMs);
        if (described?.text) {
          imageDesc = described.text;
          if (imageDesc) mind?.noteImage?.(imageDesc);
          stats.imageCount += 1;
          metrics?.inc('qqbot_vision_requests_total', { provider: described.provider, outcome: 'ok' });
          logger.info('vision.described', { key, provider: described.provider, chars: imageDesc.length });
        } else {
          imageDesc = '';
          imagePending = true;
          visionPromise.then((late) => {
            if (!late?.text) return;
            mind?.noteImage?.(late.text);
            logger.info('vision.late', { key, chars: late.text.length });
          }).catch(() => {});
          metrics?.inc('qqbot_vision_requests_total', { provider: 'unknown', outcome: 'timeout' });
          logger.warn('vision.timeout', { key });
        }
      } catch (error) {
        imageDesc = '';
        imagePending = true;
        metrics?.inc('qqbot_vision_requests_total', { provider: 'unknown', outcome: 'error' });
        logger.warn('vision.failed', { key, error: String(error?.message ?? error) });
      }
    }
    let voiceDesc = '';
    let voicePending = false;
    if (current.voices?.length && asr) {
      const asrWaitMs = Number(config.media?.asrWaitMs) || 5000;
      const asrPromise = asrLimiter ? asrLimiter.run(() => asr.transcribe(current.segments)) : asr.transcribe(current.segments);
      try {
        const heard = await withDeadline(asrPromise, asrWaitMs);
        if (heard) {
          voiceDesc = heard;
          metrics?.inc('qqbot_asr_requests_total', { outcome: 'ok' });
          logger.info('asr.described', { key, chars: voiceDesc.length });
        } else {
          voiceDesc = '';
          voicePending = true;
          asrPromise.then((late) => {
            if (!late) return;
            mind?.noteVoice?.(late);
            logger.info('asr.late', { key, chars: late.length });
          }).catch(() => {});
          metrics?.inc('qqbot_asr_requests_total', { outcome: 'timeout' });
          logger.warn('asr.timeout', { key });
        }
      } catch (error) {
        voiceDesc = '';
        voicePending = true;
        metrics?.inc('qqbot_asr_requests_total', { outcome: 'error' });
        logger.warn('asr.failed', { key, error: String(error?.message ?? error) });
      }
    }

  return { imageDesc, imagePending, voiceDesc, voicePending };
}
