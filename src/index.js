import { main } from './app.js';

main().catch((error) => {
  console.error(`[v2] 启动失败: ${error?.stack ?? error}`);
  process.exit(1);
});
