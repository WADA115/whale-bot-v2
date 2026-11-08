# 小鲸鱼 QQ 角色运行时：完整项目报告

## 1. 报告目的

这份文档不是某一阶段的进度摘要，而是对整个项目的完整说明：

- 它为什么存在；
- 它现在由哪些部分组成；
- 一次消息如何变成回复；
- 角色、记忆、工具、权限、语音、群聊和平台如何协作；
- 哪些设计是刻意的；
- 哪些地方失败了、绕过了或还没验证；
- 开源和长期运行需要注意什么。

---

## 2. 项目定位

这是一个自托管的 QQ 角色运行时。

目标不是做一个“回答问题”的机器人，而是让一个角色在 QQ 里持续存在：

- 有自己的身份和说话方式；
- 有连续的记忆和关系；
- 会主动观察、发呆、错过、等；
- 能在群聊和私聊里保持同一个人格；
- 能调用工具，但不会把工具调用写成角色的一部分；
- 需要越界时先问主人，而不是硬闯。

核心约束：

```text
不能要死文本、函数、数值
```

这里的“不能”指角色层：

- 不用好感度、信任值、情绪分数；
- 不用固定台词表；
- 不用动作枚举；
- 不用 `if 情绪=生气 -> 说某句`；
- 不把角色写成状态机。

运行时可以有超时、计数、日志和权限状态，  
但这些不属于角色本身。

---

## 3. 演进过程

### 3.1 从脚本到运行时

项目最早是单文件、单群、关键词触发的 QQ 机器人。  
后来拆成 v1 和 v2：

- v1 保留旧的网关、ASR、工具脚本；
- v2 是干净的运行时，负责角色、记忆、工具和面板；
- v2 使用独立的历史，不背 v1 的旧提交。

### 3.2 角色层

角色卡成为唯一身份来源。  
`self.md` 从角色卡同步，不让人格分裂成两份。

角色卡只保留：

```text
name
identity
boundaries
drive
world
voice
```

没有数值、函数、固定回复。

### 3.3 记忆和叙事

记忆拆成几层：

- `mind/`：她自己的内在状态、心跳、离线后的连续感、没想完的事；
- `story/`：关系、共同经历、场景、人物；
- `state/scenes.json`：每个会话的最近往返；
- `state/knowledge/`：可检索的本地资料；
- `training/observations.md`：盲测和观察记录。

### 3.4 语音

语音走过很长的弯路：

1. Edge 中文：清楚，但没有情绪；
2. ChatTTS：情绪有一点，但吐字不清；
3. GPT-SoVITS + ATRI：音色像，但中文发音和语气不对；
4. RVC ATRI：音色接近，但太软；
5. 满穗数据：中文和语气都更好，训练了 s2；
6. s1 语气训练：受本机内存限制，没有稳定完成；
7. 最终回退：Edge 中文 + RVC ATRI。

当前语音不是“像人”的最终形态，  
是清楚、稳定、不调情的可用版本。

### 3.5 表情包

本地表情库扩展到两百多张，  
QQ 收藏表情只同步了其中一小部分。

表情发送和文字颜文字是两条路：

- 文字颜文字：普通文本，不会被过滤；
- QQ 小黄脸/收藏表情：走 expression/gateway。

### 3.6 黑话

黑话观察器从群聊里提取候选，  
最初只靠模型猜，后来改成：

```text
群聊候选
→ Bing 搜索
→ 搜索结果 + 原句交给模型
→ 判断 meaning / usage / worth
→ 有来源且值得记才入库
```

没有固定词表，  
也没有“单个字一律不要”的死规则。

### 3.7 权限

权限从“只允许主人骂人”发展成一套双向临时许可：

```text
她请求
群聊 + 私聊同时收到
任一方批准
任一方撤回
口语改范围、改时间
主人也能主动给
面板可操作
```

---

## 4. 总体架构

```text
QQ
 │
 ├─ SnowLuma / OneBot
 │    ├─ HTTP 3000
 │    └─ WebSocket 3001
 │
 ├─ v2 运行时
 │    ├─ app.js          装配与消息分发
 │    ├─ runtime/        回合、通知、群现场
 │    ├─ character/      角色、场景、黑话、表情
 │    ├─ mind/           内在状态与连续感
 │    ├─ story/          关系与共同经历
 │    ├─ core/           模型、语音、权限、搜索
 │    ├─ platform/       B站、QQ空间
 │    └─ http/           面板与 API
 │
 ├─ ASR 3199
 ├─ 面板 3201
 ├─ Ollama 11434
 └─ GPT-SoVITS 9880（按需）
```

---

## 5. 目录与模块

### 入口

```text
src/index.js       进程入口
src/app.js         运行时装配、消息分发、权限、共享上下文
src/config.js      配置、角色卡、密钥和路径
src/log.js         日志
```

### 运行时

```text
src/runtime/actor-turn.js   一次角色回合
src/runtime/notices.js      唤醒和临时通知
src/runtime/live-group.js   群聊现场
src/runtime/speech.js       语音/表情发送
src/runtime/capabilities.js 能力清单
src/runtime/metrics.js      运行指标
src/runtime/lock.js         单实例锁
src/runtime/world-observer.js 世界观察
```

### 角色

```text
src/character/actor.js      角色卡装载
src/character/scene.js      会话场景
src/character/slang.js      黑话命中
src/character/slang-observer.js 黑话提取与联网核验
src/character/expression.js 表情选择
src/character/tasks.js      角色任务
src/core/actor.js           工具循环与执行
src/autonomy/engine.js      自主发现
```

### 记忆与叙事

```text
src/mind/store.js       内在状态
src/mind/daydream.js    发呆与自主行动
src/story/store.js      会话与故事
src/story/prompt.js     叙事提示
src/story/editor.js     叙事编辑
src/story/agency.js     主动叙事
```

### 基础能力

```text
src/core/router.js       模型路由
src/core/reply.js        回复清洗
src/core/tts.js          Edge TTS
src/core/rvc.js          RVC 转换
src/core/mansui.js       满穗 GPT-SoVITS，按需启动
src/core/permissions.js  权限状态
src/core/conversation-log.js 跨会话上下文
src/core/web-search.js   Bing 搜索
src/core/knowledge.js    本地检索
src/core/asr.js          语音识别
src/core/vision.js       图片理解
src/core/rvc.js          音色转换
```

### 平台

```text
src/platform/bilibili.js B站
src/gateway/onebot.js    QQ 空间动作入口
```

### 面板

```text
src/http/routes.js   API 与静态页面
src/http/helpers.js  请求、配置、日志
web/next/            面板前端
```

---

## 6. 启动与部署

```text
scripts/start-core.ps1      启动 v2、ASR、Ollama，必要时拉起网关
scripts/start-gateway.ps1   启动 SnowLuma 和 QQ
scripts/start-all.ps1       完整启动
scripts/stop-all.ps1        关闭
scripts/watchdog.ps1        看门狗
```

端口：

```text
3000  OneBot HTTP
3001  OneBot WebSocket
3199  ASR
3201  面板/API
5099  SnowLuma WebUI
9880  GPT-SoVITS（按需）
11434 Ollama
```

当前机器上：

```text
3000 / 3001 / 3201 up
9880 down
```

---

## 7. 一次消息如何变成回复

### 入站

```text
SnowLuma 收到 QQ 消息
→ 网关标准化
→ app.dispatchMessage
→ 记录到共享会话流
→ 群聊先给 live-group / 黑话观察器
→ 权限判断
→ 决定是否处理
→ 进入 actor 队列
```

### 组装上下文

```text
当前会话最近往返
+ 其他会话最近背景
+ 角色卡
+ 内在状态
+ 关系/共同经历
+ 本地知识
+ 黑话
+ 图片/语音描述
+ 临时许可
+ 当前消息
```

### 生成

```text
模型可以直接回一句话
或调用工具：
  speak
  request_permission
  ask_owner
  search_local
  draw_picture
  sing_song
  bili_*
  look_group_history
```

### 出站

```text
文本 → 当前会话
图片/语音/表情 → gateway
记录发出的文字到共享会话流
```

---

## 8. 角色层

角色卡是唯一身份来源。

当前结构：

```json
{
  "name": "小鲸鱼",
  "identity": "...",
  "boundaries": ["..."],
  "drive": "...",
  "world": ["..."],
  "voice": ["..."]
}
```

`voice` 是说话方式的锚点，  
不是固定台词表；运行时不会按关键词复读这些句子。

角色层没有：

```text
好感度
信任值
情绪数值
动作枚举
固定回复映射
函数
```

---

## 9. 记忆与连续感

### 内在状态

`mind/` 保存：

- 当前在想什么；
- 没想完的事；
- 暗流；
- 离线了多久；
- 心跳；
- 是否该主动出现。

### 关系

`story/` 保存：

- 和某个人的关系；
- 共同经历；
- 场景里的“现在”；
- 人物卡。

### 会话场景

`state/scenes.json` 保存每个会话的最近往返，  
用于当前对话的短期连续。

### 共享上下文

`core/conversation-log.js` 保存最近所有会话的进出消息，  
让群聊和私聊共享同一个“她刚看到什么”。

它只作为背景，  
不等于把私聊内容公开到群里。

---

## 10. 工具系统

工具由运行时提供，角色只决定“用不用”。

当前工具：

```text
speak              发语音
request_permission 请求许可
ask_owner          群里私下问主人
search_local       查本地资料
draw_picture       画简笔画
sing_song          唱歌
bili_search        B站搜索
bili_video_content 视频内容
bili_comments      评论
bili_reply_comment 回复评论
bili_dynamics      关注动态
bili_favorites     收藏
bili_history       观看历史
look_group_history  看群历史
```

工具失败只影响该工具，  
不把整轮回复拖死。

---

## 11. 权限系统

### 请求

角色判断“这件事必须做，但规则不让我做”，  
调用 `request_permission`。

群里请求会同时发：

```text
当前群
主人私聊
```

私聊请求只发主人。

### 批准

任一方批准就生效：

```text
群里：行
私聊：可以
```

默认范围：

```text
群聊 + 私聊
```

### 范围

可以口语排除：

```text
不要私聊
私聊不行
不要群聊
群里不行
```

### 时间

默认三十分钟。

可以口语改：

```text
再加 20 分钟
减 10 分钟
改成 10 分钟
```

### 撤回

批准后任一方可以撤回：

```text
算了
不给
不行
```

### 主动给

不必等她请求：

```text
今天可以骂
这货可以骂
给你十分钟
```

### 面板

配置页有权限中心：

- 待批；
- 有效；
- 剩余时间；
- 生效范围；
- 同意/拒绝/撤回；
- 加减时间。

### 边界

权限不能用于：

```text
家人
真人
群体
威胁
开盒
```

这些是硬底线，  
不是“再问一次就能开”的东西。

---

## 12. 跨会话共享

所有私聊和群聊进入同一个环形流：

```text
最近 80 条进出消息
每次回复带最近 12 条其他会话背景
```

效果：

- 不会出现两个她；
- 群聊知道私聊近况；
- 私聊知道群聊近况；
- 不自动跨会话复述。

提示里明确：

```text
这些只是背景
不要在别的群或私聊里复述私事
```

---

## 13. 黑话系统

### 提取

群聊消息先进入观察器，  
达到一批后交给模型提取候选。

### 联网核验

每个候选：

```text
Bing 搜索
→ 搜索结果
→ 模型二次判断
→ meaning / usage / worth
```

### 入库

只有满足：

```text
搜得到
模型认为值得记
有来源
不是纯昵称/报错/无意义口癖
```

才写入 `state/slang.json` 和知识库。

没有固定词表，  
所以不会因为“霸”这种字被写死规则误伤或误收。

---

## 14. 本地检索

`search_local` 使用 SQLite：

- FTS 优先；
- 失败回退 LIKE；
- 不再额外调用网络。

适合查：

```text
视频背景
旧事
设定
资料
```

当前本地库有资料，  
但满穗、饿殍等新主题还没有系统灌入。

---

## 15. 语音系统

### 当前链路

```text
Edge 中文
→ RVC ATRI
→ QQ 语音
```

### 满穗模型

已训练：

```text
s2 clean
583 段
2 轮
```

问题：

```text
s1 没训成
语气仍然偏平/偏软
```

### s1 失败原因

本机内存和 Windows 提交内存不足：

```text
torch 加载失败
CPU 分配 4MB 失败
```

不是代码错误。

### 按需服务

GPT-SoVITS 不常驻：

- 第一次语音启动；
- 闲置关闭；
- 面板可手动关。

当前默认语音仍是 Edge + RVC，  
不是满穗。

---

## 16. 表情与颜文字

### 文字颜文字

正常文本，  
不会被 `sanitizeReply` 过滤。

```text
(๑•̀ㅂ•́)و✧
(´・ω・`)
_(:з」∠)_
```

### QQ 表情

走 expression：

- 小黄脸；
- 收藏表情；
- 图片表情。

有冷却和私聊/群聊限制。

---

## 17. 平台功能

### B站

- 搜索；
- 视频内容；
- 评论读取；
- 评论回复；
- 动态；
- 收藏；
- 观看历史。

### QQ空间

- 读取动态；
- 发说说；
- 可见范围。

平台动作都有超时，  
失败不会影响主对话。

---

## 18. 面板

配置页包含：

- 模式；
- 白名单；
- 语音识别；
- 视觉；
- 知识库；
- 自主发现；
- B站；
- Story Editor；
- Story Agency；
- 语音服务关闭；
- 权限中心。

权限中心可以：

```text
看待批
看有效
同意
拒绝
撤回
加十分钟
减十分钟
```

---

## 19. 数据与隐私

### 不会进仓库

```text
config.json
state/
state/secrets.json
state/bilibili.json
state/logs/
state/voice/
scripts/local.paths.ps1
```

### 仓库内

```text
config.example.json
characters/小鲸鱼.json
docs/
training/
friend-kit/
```

### 已做检查

- tracked 代码没有真实 QQ 号；
- 没有 Bearer token；
- 没有 Cookie；
- 没有本机绝对路径；
- 历史里没有 config/state/secrets；
- 角色卡没有真人信息。

### 仍需注意

- 不要打包整个工作目录；
- 不要上传 `state/`；
- 不要把本地配置塞进 release。

---

## 20. 测试

```text
35 个测试文件
95 个测试
全部通过
```

覆盖：

- 角色卡；
- 场景；
- 记忆；
- 黑话；
- 表情；
- 权限；
- 跨会话；
- 回复清洗；
- 工具；
- 平台。

尚未覆盖：

- 真实 QQ 网络；
- 真实语音发送；
- 真实群 canary；
- 平台实机操作。

---

## 21. 当前可用状态

```text
文字聊天：可用
群聊：可用
私聊：可用
共享上下文：可用
权限：可用
面板：可用
本地检索：可用
黑话提取：可用
语音：可用但情绪平
B站/空间：代码可用，实机未全测
```

---

## 22. 已知问题与技术债

### 语音

- s1 未完成；
- 满穗语音偏软；
- Edge + RVC 没有情绪；
- 冷启动慢。

### 权限

- 群审批人限制默认仍是任何人；
- 权限是提示层约束，不是硬沙箱；
- 批准后同一轮可能来不及生效（为了不阻塞）。

### 运维

- SnowLuma 路径在重启后可能找不到；
- GitHub 推送被网络阻断；
- 本地提交领先远端。

### 数据

- 满穗/饿殍资料没进本地知识库；
- 部分历史状态是测试数据；
- CosyVoice 半成品占空间。

---

## 23. 后续路线

### 必须做

```text
真实私聊语音
真实群 canary
QQ空间/B站实测
GitHub 推送
SnowLuma 重启路径
```

### 想做

```text
s1 云端训练
群审批人限制
面板权限样式
知识库灌入
CosyVoice 清理
```

### 不做

```text
好感度/分数
固定台词表
动作枚举
把权限写成角色台词
```

---

## 24. 结论

这个项目的核心不是“工具多”，  
而是：

```text
一个角色
一套记忆
一个共享上下文
一套权限
工具在后台，不挡对话
```

角色层保持干净；  
运行时承担复杂度；  
需要人类点头的事，先问再动。

它不是完成品，  
但已经不是“关键词回复机器人”。
