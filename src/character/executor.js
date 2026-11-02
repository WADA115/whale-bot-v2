import fs from 'node:fs';
import path from 'node:path';

const SYSTEM = [
  '你在执行一个具体任务，不是在扮演角色。',
  '直接给出可用的结果，不要写过程、不要写分析、不要写“好的”。',
  '需要代码时给完整可运行代码；需要文案时直接给成品；需要翻译时只给译文。',
  '不要编造搜索结果、链接、数据或引用。',
  '结果用中文，除非任务明确要求其他语言。'
].join('\n');

function classify(text) {
  const value = String(text ?? '').trim();
  if (/翻译|译成|英文|日文/.test(value)) return 'translate';
  if (/总结|摘要|概括|提炼/.test(value)) return 'summarize';
  if (/代码|脚本|函数|程序|bug|报错/.test(value)) return 'code';
  if (/方案|计划|规划|步骤/.test(value)) return 'plan';
  if (/查一下|搜索|搜一下|找一下|帮我查/.test(value)) return 'search';
  if (/写|文案|邮件|周报|日报|文档|整理|改/.test(value)) return 'write';
  return 'general';
}

export function createTaskExecutor({ tasks, textRouter, search = null, logger = null, outDir, maxResultChars = 6000, onResult = null } = {}) {
  async function execute(task) {
    if (!task || task.status === 'done' || task.status === 'running') return task;
    const kind = classify(task.text);
    tasks.update(task.id, { status: 'running', taskType: kind, startedAt: Date.now() });
    if (kind === 'search') {
      if (!search) {
        const message = '搜索类任务还没接联网搜索，先不做，避免编造结果。';
        tasks.update(task.id, { status: 'needs_tool', error: message, finishedAt: Date.now() });
        return tasks.get(task.id);
      }
      try {
        const query = String(task.text).replace(/^(?:请)?帮我/, '').replace(/^(?:搜索一下|搜一下|查一下|找一下|搜索|查|找)/, '').trim() || task.text;
        const results = await search(query, { limit: 5 });
        const text = results.map((x, i) => `${i + 1}. ${x.title}\n${x.snippet}\n${x.url}`).join('\n\n').slice(0, maxResultChars);
        fs.mkdirSync(outDir, { recursive: true });
        const file = path.join(outDir, `${task.id}.md`);
        fs.writeFileSync(file, `# 搜索结果：${query}\n\n${text}\n`, 'utf8');
        tasks.update(task.id, {
          status: 'done',
          taskType: 'search',
          result: text.slice(0, 2000),
          resultFile: file,
          sources: results,
          provider: 'bing',
          finishedAt: Date.now()
        });
        logger?.info('task.search_done', { id: task.id, count: results.length });
        const finished = tasks.get(task.id);
        if (onResult) {
          try { await onResult(finished); } catch (error) { logger?.warn('task.result_callback_failed', { id: task.id, error: String(error?.message ?? error) }); }
        }
        return finished;
      } catch (error) {
        const message = String(error?.message ?? error).slice(0, 500);
        tasks.update(task.id, { status: 'needs_tool', error: message, finishedAt: Date.now() });
        logger?.warn('task.search_failed', { id: task.id, error: message });
        return tasks.get(task.id);
      }
    }
    try {
      const user = [
        `任务类型：${kind}`,
        `任务原文：${task.text}`,
        '',
        '只输出任务结果。'
      ].join('\n');
      const result = await textRouter.generate({ system: SYSTEM, user });
      const text = String(result?.text ?? '').trim().slice(0, maxResultChars);
      if (!text) throw new Error('empty task result');
      fs.mkdirSync(outDir, { recursive: true });
      const file = path.join(outDir, `${task.id}.md`);
      fs.writeFileSync(file, `# 任务结果\n\n${text}\n`, 'utf8');
      tasks.update(task.id, {
        status: 'done',
        result: text.slice(0, 2000),
        resultFile: file,
        provider: result.provider,
        finishedAt: Date.now()
      });
      logger?.info('task.done', { id: task.id, type: kind, provider: result.provider });
      const finished = tasks.get(task.id);
      if (onResult) {
        try {
          await onResult(finished);
        } catch (error) {
          logger?.warn('task.result_callback_failed', { id: task.id, error: String(error?.message ?? error) });
        }
      }
      return finished;
    } catch (error) {
      const message = String(error?.message ?? error).slice(0, 500);
      tasks.update(task.id, { status: 'failed', error: message, finishedAt: Date.now() });
      logger?.warn('task.failed', { id: task.id, error: message });
      return tasks.get(task.id);
    }
  }

  async function runPending({ limit = 3 } = {}) {
    const pending = tasks.list({ status: 'pending', limit });
    const done = [];
    for (const task of pending) done.push(await execute(task));
    return done;
  }

  return { execute, runPending, classify };
}
