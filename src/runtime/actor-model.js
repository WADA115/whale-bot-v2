import { sanitizeReply } from '../core/reply.js';

export async function generateActorReply({ textRouter, prompt, tools, execute }) {
  const result = textRouter.generateWithTools
    ? await textRouter.generateWithTools({ ...prompt, tools, execute })
    : await textRouter.generate(prompt);
  return { text: sanitizeReply(result?.text, 0), provider: result?.provider || '' };
}