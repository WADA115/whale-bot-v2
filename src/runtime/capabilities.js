export function createCapabilities({
  config,
  gateway,
  asr,
  tts,
  textRouter,
  visionProviders = [],
  bilibili,
  storyStore,
  character
}) {
  async function snapshot() {
    const [asrHealth, ttsHealth] = await Promise.all([
      asr?.health ? asr.health() : Promise.resolve(null),
      tts?.health ? tts.health() : Promise.resolve(null)
    ]);

    const connected = Boolean(gateway?.selfId && gateway?.ws?.readyState === 1);
    const textHealth = textRouter?.health?.() ?? {};
    const bili = bilibili?.status?.() ?? { enabled: false, loggedIn: false };
    const providers = visionProviders.map((provider) => ({
      id: provider.id,
      model: provider.model || '',
      type: provider.type || ''
    }));

    const result = {
      gateway: { state: connected ? 'up' : 'down' },
      snowluma: { state: connected ? 'up' : 'down' },
      qq: { state: connected ? 'up' : 'down' },
      text: {
        state: Object.values(textHealth).some((item) => item?.downUntil && item.downUntil > Date.now()) ? 'degraded' : 'configured',
        providers: textHealth
      },
      vision: { state: providers.length ? 'configured' : 'off', providers },
      asr: asrHealth ? { state: asrHealth.ok ? 'up' : 'down', ...asrHealth } : { state: 'off' },
      tts: ttsHealth ? { state: ttsHealth.ok ? 'up' : 'down', ...ttsHealth } : { state: 'off' },
      bilibili: { state: bili.loggedIn ? 'up' : (bili.enabled ? 'logged-out' : 'off') },
      story: { state: storyStore ? 'up' : 'off' },
      character: { state: character ? 'up' : 'off' },
      mode: config.mode
    };

    result.degraded = Object.entries(result)
      .filter(([, value]) => value && typeof value === 'object' && ['degraded', 'down', 'logged-out'].includes(value.state))
      .map(([key]) => key);

    return result;
  }

  return { snapshot };
}
