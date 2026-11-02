const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function stripThink(text) {
  return String(text ?? '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*/gi, '')
    .replace(/<\/?think>/gi, '')
    .trim();
}

function providerRequest(provider, { system, user, fetchImpl }) {
  if (provider.type === 'openai') {
    if (!provider.apiKey) throw new Error('missing api key');
    return fetchImpl(`${String(provider.baseURL).replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${provider.apiKey}` },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          { role: 'user', content: user }
        ],
        max_tokens: Number(provider.maxTokens) || 500,
        temperature: Number(provider.temperature) || 0.7
      }),
      signal: AbortSignal.timeout(Number(provider.timeoutMs) || 15000)
    });
  }  if (provider.type === 'ollama') {
    return fetchImpl(`${String(provider.baseURL).replace(/\/+$/, '').replace(/\/v1$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          { role: 'user', content: user }
        ],
        stream: false,
        think: false,
        options: {
          num_ctx: Number(provider.numCtx) || 4096,
          num_predict: Number(provider.maxTokens) || 500,
          temperature: Number(provider.temperature) || 0.7
        }
      }),
      signal: AbortSignal.timeout(Number(provider.timeoutMs) || 25000)
    });
  }
  throw new Error(`unsupported provider type: ${provider.type}`);
}

async function parseResponse(provider, response) {
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`${provider.id} http ${response.status}${body ? ': ' + body.slice(0, 200) : ''}`);
  }
  const data = await response.json();
  if (provider.type === 'openai') {
    const content = String(data?.choices?.[0]?.message?.content ?? '').trim();
    if (!content && data?.choices?.[0]?.message?.reasoning_content) {
      throw new Error('empty content (reasoning used all max_tokens; raise maxTokens)');
    }
    return content;
  }
  return stripThink(data?.message?.content ?? '');
}

async function openaiToolTurn(provider, { messages, tools, fetchImpl }) {
  if (!provider.apiKey) throw new Error('missing api key');
  const response = await fetchImpl(`${String(provider.baseURL).replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${provider.apiKey}` },
    body: JSON.stringify({
      model: provider.model,
      messages,
      tools,
      tool_choice: 'auto',
      max_tokens: Number(provider.maxTokens) || 500,
      temperature: Number(provider.temperature) || 0.7
    }),
    signal: AbortSignal.timeout(Number(provider.timeoutMs) || 30000)
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`${provider.id} http ${response.status}${body ? ': ' + body.slice(0, 200) : ''}`);
  }
  return response.json();
}
export function createModelRouter({ providers = [], logger = null, fetchImpl = fetch, cooldownMs = 60000 } = {}) {
  if (!Array.isArray(providers) || !providers.length) throw new Error('providers required');
  const health = new Map(providers.map((p) => [p.id, { failures: 0, downUntil: 0 }]));

  async function generate({ system = '', user } = {}) {
    const errors = [];
    for (const provider of providers) {
      const state = health.get(provider.id) ?? { failures: 0, downUntil: 0 };
      if (Date.now() < state.downUntil) {
        errors.push(`${provider.id}: circuit-open`);
        continue;
      }
      try {
        const response = await providerRequest(provider, { system, user, fetchImpl });
        const text = stripThink(await parseResponse(provider, response));
        if (!text) throw new Error('empty response');
        state.failures = 0;
        state.downUntil = 0;
        logger?.info('router.ok', { provider: provider.id });
        return { text, provider: provider.id };
      } catch (error) {
        state.failures += 1;
        if (state.failures >= 2) state.downUntil = Date.now() + cooldownMs;
        health.set(provider.id, state);
        errors.push(`${provider.id}: ${String(error?.message ?? error)}`);
        logger?.warn('router.provider_failed', { provider: provider.id, error: String(error?.message ?? error) });
        await sleep(50);
      }
    }
    throw new Error(`all providers failed: ${errors.join(' | ')}`);
  }

  async function generateWithTools({ system = '', user, tools = [], execute } = {}) {
    if (!Array.isArray(tools) || !tools.length || typeof execute !== 'function') {
      return generate({ system, user });
    }
    for (const provider of providers) {
      if (provider.type !== 'openai') continue;
      const messages = [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: user }
      ];
      try {
        for (let round = 0; round < 3; round += 1) {
          const data = await openaiToolTurn(provider, { messages, tools, fetchImpl });
          const message = data?.choices?.[0]?.message || {};
          const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
          if (calls.length) {
            messages.push({
              role: 'assistant',
              content: message.content ?? null,
              tool_calls: calls
            });
            for (const call of calls) {
              let result = '';
              try {
                const args = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
                result = await execute(call.function?.name, args);
              } catch (error) {
                result = `读取失败：${String(error?.message ?? error)}`;
              }
              messages.push({
                role: 'tool',
                tool_call_id: String(call.id ?? ''),
                content: String(result ?? '')
              });
            }
            continue;
          }
          const text = stripThink(message.content ?? '');
          if (text) {
            logger?.info('router.ok', { provider: provider.id, tools: true });
            return { text, provider: provider.id, tools: true };
          }
          throw new Error('empty response');
        }
        throw new Error('tool loop exhausted');
      } catch (error) {
        logger?.warn('router.tools_failed', { provider: provider.id, error: String(error?.message ?? error) });
      }
    }
    return generate({ system, user });
  }
  return { generate, generateWithTools, health: () => Object.fromEntries(health) };
}
