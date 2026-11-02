# whale-bot-v2

一个独立的 QQ 角色运行时。不是机器人框架，也不是功能堆叠面板。

目标不是“让模型扮演角色”，而是让角色拥有一份会变化的叙事状态：

```text
我是谁
我们是什么关系
最近发生了什么
我现在怎么想
我猜可能是什么
我打算怎么做
```

角色层不出现分数、等级、概率、衰减、函数或意图枚举。  
这些只存在于运行层，不进入角色看到的文本。

[![CI](https://github.com/WADA115/whale-bot-v2/actions/workflows/ci.yml/badge.svg)](https://github.com/WADA115/whale-bot-v2/actions/workflows/ci.yml)

## 它是什么

```text
OneBot v11 WebSocket
  → 每个会话一个串行 actor
  → 白名单 / @ / 别名 / 图片 / 语音
  → 视觉描述
  → ASR 转写
  → 叙事 prompt
  → 文本模型降级链
  → QQ 文本 / 图片 / 语音
  → story editor 异步写回
```

同时带一个本地 Web 工作台：

```text
今天
角色
故事
发现
设置
网关
```

## 主要能力

- **每会话串行 actor**：同一会话同一时间只有一轮，突发消息合并
- **U 形叙事上下文**：人设和关系在头，刚发生的事在尾，中间按相关性取
- **文件叙事状态**：`self.md` / `relationship.md` / `now.md` / episode / chapter
- **写入安全**：每会话 `.lock`、原子写、`.meta.json` 版本号、冲突不覆盖
- **图片识别**：多 provider 降级，先付费、再本地、最后免费
- **语音**：ASR 入站转写，Edge TTS 出站；只在对方发语音或明确要求时回语音
- **任务**：总结、翻译、写文案、计划、代码、搜索；结果落盘后可发回
- **群聊**：白名单 + @ / 别名触发；没点她也旁听最近群消息，只在被点或叫到时开口
- **QQ 空间**：读取动态、发布动态
- **B 站**：搜索、热门、扫码登录
- **Web 网关页**：状态、日志、启动、重启、测试发送、SnowLuma 入口
- **离线测试**：不依赖 QQ、不依赖模型、不依赖面板

## 快速开始

要求：

```text
Node.js >= 22
SnowLuma（OneBot v11 HTTP + WS）
可选：Ollama、ASR、FFmpeg、Edge TTS
```

## 模型与依赖

### 运行时

```text
Node.js >= 22
不需要 npm 依赖
使用 Node 内置 http / crypto / sqlite / WebSocket
```

`node:sqlite` 用于只读知识库；没有它时知识库自动降级为空结果。

### 文本模型

默认顺序由 `config.json` 的 `models.text` 决定，示例配置是：

```text
DeepSeek      deepseek-flash     云端
Ollama        qwen3:4b           本地
```

一个 provider 失败会降级到下一个。  
两个都可以换，模型名不是写死的。

### 视觉模型

示例顺序：

```text
zhipu-paid    glm-4.6v           云端付费
local         qwen3-vl:4b        本地 Ollama
zhipu-flash   glm-4.6v-flash     云端免费
```

实际顺序以 `vision.providers` 为准。免费模型限流时会继续降级。

### 语音

```text
ASR     sherpa-onnx Paraformer（本机 HTTP 服务，默认 3199）
TTS     Edge TTS，默认 zh-CN-XiaoyiNeural
```

语音是可选的；关闭后只走文本。

### 外部进程

```text
SnowLuma      QQ / OneBot v11 网关
Ollama        本地文本和视觉模型
Python        ASR 服务和 Edge TTS token
FFmpeg        语音转码
```

这些都不在本仓库内，版本和许可由各自项目决定。  
SnowLuma 不是 OSI 开源软件，使用前请阅读它的许可。

### 不依赖

```text
没有 Express / Fastify / Nest
没有数据库 ORM
没有前端框架
没有 npm 运行时依赖
```

### 模型和依赖的边界

```text
模型名来自配置，不是协议
provider 失败自动降级
外部进程挂掉不应拖死文本链路
角色层不读取任何模型参数
```


```bash
git clone https://github.com/WADA115/whale-bot-v2.git
cd whale-bot-v2
cp config.example.json config.json
```

编辑 `config.json`：

```json
{
  "mode": "shadow",
  "gateway": {
    "enabled": false,
    "httpUrl": "http://127.0.0.1:3000",
    "wsUrl": "ws://127.0.0.1:3001"
  },
  "allow": {
    "groups": [],
    "private": ["你的 QQ 号"]
  }
}
```

先跑影子模式：

```bash
node src/index.js --shadow
```

它只记录，不调用模型、不发送 QQ。

确认正常后，在 `config.json` 里改：

```json
{
  "mode": "live",
  "gateway": {
    "enabled": true
  }
}
```

然后：

```bash
node src/index.js
```

打开本地工作台：

```text
http://127.0.0.1:3201/next/
```

> `gateway.enabled=false` 时只启动健康检查和 actor，不会连接 OneBot。  
> `mode=shadow` 时默认不调用模型、不发送。

## 配置

完整示例在 [`config.example.json`](config.example.json)。

密钥不写进 `config.json`，放在 `state/secrets.json`：

```json
{
  "deepseekApiKey": "...",
  "zhipuApiKey": "...",
  "snowlumaAccessToken": "...",
  "snowlumaWsAccessToken": "..."
}
```

也支持 `apiKeyEnv` 指向环境变量。

`state/`、`config.json`、`config.preview.json`、`scripts/local.paths.ps1` 都不进 git。

### 模型

```json
"models": {
  "text": [
    {
      "id": "deepseek",
      "type": "openai",
      "baseURL": "https://api.deepseek.com/v1",
      "model": "deepseek-flash",
      "apiKeyEnv": "DEEPSEEK_API_KEY"
    },
    {
      "id": "local",
      "type": "ollama",
      "baseURL": "http://127.0.0.1:11434",
      "model": "qwen3:4b"
    }
  ]
}
```

一个 provider 失败会降级到下一个；每个 provider 独立熔断。

### 视觉

```json
"vision": {
  "enabled": true,
  "providers": [
    {
      "id": "zhipu-paid",
      "type": "openai",
      "baseURL": "https://open.bigmodel.cn/api/paas/v4",
      "model": "glm-4.6v",
      "secretName": "zhipuApiKey"
    },
    {
      "id": "local",
      "type": "ollama",
      "baseURL": "http://127.0.0.1:11434",
      "model": "qwen3-vl:4b"
    }
  ]
}
```

图片会先下载，再按 provider 顺序尝试。

### 语音

ASR 是可选的外部 HTTP 服务：

```json
"asr": {
  "enabled": true,
  "url": "http://127.0.0.1:3199"
}
```

TTS 使用 Edge TTS 脚本：

```json
"tts": {
  "enabled": true,
  "voice": "zh-CN-XiaoyiNeural",
  "privateOnly": true
}
```

语音规则是按场景，不按概率：

```text
对方发语音 → 回语音
明确说“语音 / 念一下 / 读一下 / 唱” → 回语音
其他 → 只文本
```

## 叙事状态

```text
state/story/<chat>/self.md
state/story/<chat>/relationship.md
state/story/<chat>/now.md
state/story/<chat>/episodes/<event>/episode.md
state/story/<chat>/episodes/<event>/trace.md
state/story/<chat>/chapters/*.md
state/story/<chat>/people/<person>.md
state/story/<chat>/.meta.json
```

写入规则：

```text
每会话 .lock
temp + rename 原子写
版本号递增
editor 用旧版本写入会冲突并跳过
Editor 按会话排队，连续消息不抢版本
过期锁自动接管
```

### 人物 U 型

```text
头部
  他对我意味着什么
  我确定他是什么样的人
  我们的默契
  不能碰的线

中部
  他做过的、让我改观的事
  他矛盾的地方
  我还没看懂的地方

尾部
  他今天是什么状态
  我现在怎么看他
  我猜他在想什么
```

人物按群、按人独立。  
头部不因一句话改写，尾部允许看错，中部允许矛盾和遗忘。

尾部可以记她的猜测，但不能自动变成头部或事实。  
只有对方确认，Editor 才允许把被确认的猜测写进中部或头部。

### 心理成熟

心理成熟是作者写角色时用的备注，不进入每轮 prompt，也不当检查表。

```text
可爱是外观，不是心智
可以生气、吃醋、不安，但不操控、不冷暴力、不用沉默惩罚
不把猜测当事实，不把自己的情绪全丢给对方
能承认不知道、错了，也能修复
亲密但不依附，给彼此空间
```

成熟不是没有情绪，是能为情绪负责。  
它由具体经历长出来，不靠每轮提醒。

### 说话执行层

```text
她写下的换行就是节奏
不在运行时另算停顿或拆句
语音在文字之后发
不写括号动作和舞台说明
```

运行层只负责按她写下的换行发送，不替她决定在哪停。  
如果她正在分几条说，新消息进来会打断剩余气泡。

### 通报

运行层只给客观事实，不替她判断情绪：

```text
【通报·事实】对方是张三。
【通报·安全】对方在问现实住址。
```

没有硬编码的情绪反应。  
安全也只作为通报进入她的视角，不规定她必须说什么。

### U 形上下文

```text
头部：self.md + relationship.md
中间：相关 episode trace / chapter
尾部：now / 心里 / 猜 / 打算 / 最近对话
```

超长时先让中间层让位，头尾保留。

### 角色层约束

```text
不出现：
  分数
  等级
  概率
  衰减
  天数
  函数
  意图枚举
```

## Web 工作台

```text
/next/                    今天
/next/?page=character     角色
/next/?page=story         故事
/next/?page=discover      发现
/next/?page=settings      设置
/next/?page=gateway       网关
```

网关页可以：

```text
查看 v2 / watchdog 日志
能力矩阵
启动全部
测试私聊
重启 v2
打开 SnowLuma 控制台
查看会话
```

## 健康与指标

```text
GET /healthz            进程与连接状态
GET /api/capabilities   能力矩阵
GET /metrics            Prometheus 文本
GET /api/metrics        JSON 快照
```

## 目录

```text
src/app.js                 组合根
src/runtime/actor-turn.js  actor 回合
src/http/routes.js         HTTP 路由
src/http/helpers.js        响应 / 配置 / 日志
src/gateway/onebot.js      OneBot 适配
src/core/                  actor / policy / router / vision / asr / tts
src/character/             角色卡 / 场景 / 任务 / 表达
src/story/                 叙事状态 / prompt / editor / agency
src/platform/              B 站
src/autonomy/              主动发现
web/next/                  本地工作台
tests/                     离线测试
```

## 测试

```bash
npm test
```

当前覆盖：

```text
actor 串行 / 合并 / 队列上限
白名单 / @ / 别名 / 自己消息 / 图片
模型降级 / 输出清洗
图片下载 / provider 调用
知识库只读检索
任务入队 / 执行 / 搜索
故事读写 / U 形上下文 / editor
story 锁 / 版本 / 冲突
OneBot 模拟联调
B 站二维码
主动采集
```

CI 在 Windows 上跑语法检查和完整测试，包含 OneBot 模拟联调。

## 安全

- 群和私聊都走白名单
- shadow 模式没有 QQ 发送路径
- 密钥只从 `state/secrets.json` 或环境变量读取
- 知识库只读打开
- 默认只监听 `127.0.0.1`
- 不把 `state/` 提交进仓库

## 已知边界

```text
B 站登录需要扫码
SnowLuma 是外部进程
LoRA 前端图只替换了角色立绘和头像
真实群聊 canary 还没跑
```

这些是外部条件或验收项，不影响当前私聊、识图、语音和任务链路。

## 与 v1 的关系

v1 是 `WADA115/whale-bot`，包含更早的插件、成长、DSH 会话和旧控制台。

v2 是独立的运行时，目标是把 v1 的运行时字符串生成、多实例竞态和补丁覆盖问题，换成可测试的固定结构。

两边可以并行运行，按会话和群逐步切流。

## License

MIT。见 [`LICENSE`](LICENSE)。
