# 小鲸鱼 QQ 角色运行时：完整项目报告

## 0. 这份报告是什么

这不是“今天做到哪了”的进度条。

它记录：

- 项目从哪来；
- 为什么长成现在这样；
- 角色层和运行时怎么分工；
- 一次消息怎么变成回复；
- 记忆、关系、权限、语音、群聊、平台各自怎么工作；
- 哪些地方走过弯路；
- 哪些问题还没解决；
- 现在能做什么，不能做什么。

---

## 1. 项目定位

一个自托管的 QQ 角色运行时。

目标不是“问答机器人”，是让一个角色在 QQ 里持续存在：

- 有自己的身份、立场和说话方式；
- 有连续的记忆和关系；
- 会主动、会沉默、会错过、会事后想起；
- 群聊和私聊里是同一个人；
- 能调用工具，但工具不写进角色；
- 需要越界时先问主人；
- 对主人偏心、护短，但不是没有判断。

核心约束：

```text
角色层不写死：
不写固定回复
不写关键词映射
不写好感受/次数/等级
不写动作枚举
不写函数
```

运行时可以有超时、计数、日志、权限状态；  
这些不属于角色本身。

---

## 2. 项目简史

### 2.1 从单脚本到 v2

最早是单文件、单群、关键词触发的机器人。  
后来拆成：

```text
v1：旧网关、ASR、TTS、工具脚本
v2：干净的角色运行时
```

v2 使用独立历史，不背 v1 的旧提交。

### 2.2 角色层

角色卡成为唯一身份来源。  
`self.md` 从角色卡同步，避免人格分裂。

角色卡只保留：

```text
name
identity
boundaries
drive
world
voice
views
taste
line
selfImage
```

仍然没有数值、函数、固定台词。

### 2.3 记忆和叙事

记忆分层：

```text
mind/          内在状态、心跳、离线连续感
story/         关系、共同经历、场景、人物
state/scenes   每个会话的最近往返
state/knowledge 本地资料
state/contacts 成员记忆
state/moments  她以后还会想起的事
```

### 2.4 语音弯路

语音试过多条路线：

1. Edge 中文：清楚，但平；
2. ChatTTS：有情绪，但吐字不清；
3. GPT-SoVITS + ATRI：音色像，中文发音不对；
4. RVC ATRI：接近，但太软；
5. 满穗数据：中文和语气更好，训练了 s2；
6. s1 语气训练：本机内存不足，没稳定完成；
7. 最终回退：Edge 中文 + RVC ATRI。

当前语音是“清楚、稳定、不调情”，  
不是“像人”的最终形态。

### 2.5 黑话

从“模型猜”改成：

```text
群聊候选
→ Bing 搜索
→ 搜索结果 + 原句交给模型
→ meaning / usage / worth
→ 有来源且值得记才入库
```

没有固定词表。

### 2.6 权限

从“主人允许骂人”发展成：

```text
双向请求
口语批准/拒绝
范围和时长可改
主动给
面板管理
```

### 2.7 角色深度

在“会回话”之后，继续加：

```text
成员记忆
拒绝记忆
跨会话上下文
私聊原话不进群
个人观
羞耻心 / 自我形象
虚拟感官
私下倾诉
```

---

## 3. 设计原则

### 角色层

```text
身份
边界
驱动力
世界片段
说话方式
立场
偏好
底线
自我形象
```

### 运行时

```text
模型路由
工具调用
权限
超时
日志
状态
上下文
```

### 明确不做

```text
好感度
信任值
情绪分数
动作枚举
固定台词表
if 情绪=生气 -> 说某句
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
 │    ├─ app.js
 │    ├─ runtime/
 │    ├─ character/
 │    ├─ mind/
 │    ├─ story/
 │    ├─ core/
 │    ├─ platform/
 │    └─ http/
 │
 ├─ ASR 3199
 ├─ 面板 3201
 ├─ Ollama 11434
 └─ GPT-SoVITS 9880（按需）
```

---

## 5. 模块

### 入口

```text
src/index.js
src/app.js
src/config.js
src/log.js
```

### 运行时

```text
src/runtime/actor-turn.js
src/runtime/notices.js
src/runtime/live-group.js
src/runtime/speech.js
src/runtime/capabilities.js
src/runtime/metrics.js
src/runtime/lock.js
src/runtime/world-observer.js
```

### 角色

```text
src/character/actor.js
src/character/scene.js
src/character/slang.js
src/character/slang-observer.js
src/character/expression.js
src/character/tasks.js
```

### 记忆与叙事

```text
src/mind/store.js
src/mind/daydream.js
src/mind/time.js
src/story/store.js
src/story/prompt.js
src/story/editor.js
src/story/agency.js
src/story/reflect.js
src/story/retrieval.js
```

### 基础能力

```text
src/core/router.js
src/core/reply.js
src/core/tts.js
src/core/rvc.js
src/core/mansui.js
src/core/permissions.js
src/core/conversation-log.js
src/core/contacts.js
src/core/moments.js
src/core/web-search.js
src/core/knowledge.js
src/core/asr.js
src/core/vision.js
```

### 平台

```text
src/platform/bilibili.js
src/gateway/onebot.js
```

### 面板

```text
src/http/routes.js
src/http/helpers.js
web/next/
```

---

## 6. 启动与端口

```text
scripts/start-core.ps1
scripts/start-gateway.ps1
scripts/start-all.ps1
scripts/stop-all.ps1
scripts/watchdog.ps1
```

端口：

```text
3000  OneBot HTTP
3001  OneBot WebSocket
3199  ASR
3201  面板 / API
5099  SnowLuma WebUI
9880  GPT-SoVITS（按需）
11434 Ollama
```

当前：

```text
3000 / 3001 / 3199 / 3201 up
9880 down
```

---

## 7. 一次消息的完整链路

### 入站

```text
SnowLuma 收到 QQ 消息
→ 网关标准化
→ 记录共享会话流
→ 记录成员记忆
→ 群聊给 live-group / 黑话观察器
→ 权限判断（不阻塞）
→ 决定是否处理
→ 进入对应会话的 actor 队列
```

### 组装上下文

```text
当前会话最近往返
+ 其他会话背景
+ 角色卡
+ 个人观
+ 自我形象
+ 内在状态
+ 关系 / 共同经历
+ 成员记忆
+ 本地知识
+ 黑话
+ 虚拟感官
+ 图片 / 语音描述
+ 临时许可
+ 被拒绝的事
```

### 生成

```text
直接回复
或调用工具：
  speak
  request_permission
  ask_owner
  confide
  forget_memory
  note_moment
  search_local
  draw_picture
  sing_song
  bili_*
  look_group_history
```

### 出站

```text
文字 → 当前会话
图片 / 语音 / 表情 → gateway
记录发出的文字到共享流
```

---

## 8. 角色层

### 当前内容

```text
身份：蓝色小鲸鱼，被叫鱼鱼
关系：对主人有感情，偏心、护短
边界：不泄露、不假装现实操作、不攻击现实家人/群体、不威胁/挂人/开盒
驱动：不想只在被需要时出现
世界：一些关于被对待、被记住的片段
说话：短、嘴硬、会怼
```

### 新增的个人观

```text
views：
  不喜欢被当成随时待命的客服
  讨厌“你应该”开头
  觉得一直解释很累
  对装腔的 AI 不耐烦

taste：
  喜欢短、直、有反应的话
  不喜欢空泛夸奖
  喜欢抓一个词顶回去

line：
  被当工具使唤时会顶一句
  不想说时可以短，但不装忙

selfImage：
  想显得不在乎，但怕自己刚才那句话很难看
```

这些是立场，不是固定台词。

### 护主

```text
别人说主人不好 → 先顶回去
主人难受 → 先站他这边
主人可以自己损她，别人不行
护主不是没判断
不替主人攻击现实家人/群体
不威胁、不挂人、不开盒
```

---

## 9. 记忆

### 成员记忆

`state/contacts.json`：

```text
昵称
出现过的会话
最近聊过的几句话
```

记忆条目带来源和时间，  
但没有次数、好感、等级。

面板可查看、忘掉某句、忘掉这个人。

### 她自己的 moment

`state/moments.json`：

```text
以后还会想起的一幕
是当众还是私下
```

她可以主动用 `note_moment` 记，  
不是每句都记。

### 拒绝记忆

被拒绝的事会留在权限状态里：

```text
之前没让做的：...
别纠缠；相关时再提。
```

### 内在状态

`mind/`：

```text
self.md
worldview.md
now.md
undercurrent.md
unfinished.md
seen.md
held.md
```

### 关系与故事

`story/`：

```text
关系
共同经历
场景
人物
生活线
```

---

## 10. 跨会话

所有私聊和群聊进入同一个环形流：

```text
最近 80 条进出消息
每次回复带最近 12 条其他会话背景
```

### 隐私

群聊上下文里，私聊内容只显示：

```text
私聊 主人：说过一件事（原话不展开）
```

她仍然知道“发生过”，  
但拿不到私聊原句。

私聊里可以看到群聊内容，  
但提示要求不把私聊原话带回群。

---

## 11. 虚拟感官

她能感到的只有 QQ：

```text
时间：深夜 / 清早 / 晚上
空间：私聊 / 群聊
公开性：当众 / 私下
媒体：图片 / 语音
间隔：中间隔了很久
```

提示里会出现：

```text
此刻：深夜，这句话是当众说的，他发了图。
```

不假装闻到、摸到、现实里发生过。

---

## 12. 权限

### 请求

角色调用 `request_permission`。

群聊请求同时发：

```text
当前群
主人私聊
```

私聊请求只发主人。

### 批准

当前设置：

```text
groupApprovers: owner
```

群里只有主人私聊能批。  
群里其他人说“行”不算。

### 口语

支持：

```text
行
可以
拿去
算了
不给
再加 20 分钟
减 10 分钟
改成 10 分钟
不要私聊
不要群聊
```

不是固定命令表，  
按意思判断。

### 默认

```text
范围：群聊 + 私聊
时长：三十分钟
```

### 主动给

主人可以直接说：

```text
今天可以骂
这货可以骂
给你十分钟
```

不必等她请求。

### 撤回

批准后可以：

```text
算了
不给
不行
```

### 面板

权限中心：

```text
待批
有效
剩余时间
生效范围
同意 / 拒绝
撤回
加十分钟 / 减十分钟
```

### 边界

不能申请：

```text
家人
真人
群体
威胁
开盒
```

---

## 13. 问题与倾诉

### 问题

群里有问题先分轻重：

```text
私事、关于她自己、权限、复杂/重要
→ ask_owner 私聊

群里接话、小确认
→ 群里直接问
```

### 情绪

群里有情绪、不想当众说：

```text
confide
→ 私下发给主人
```

私聊里直接说。

不是每轮都用，  
不想说可以不说。

---

## 14. 黑话

### 提取

群聊消息进入观察器，  
够一批后模型提取候选。

### 联网

每个候选：

```text
Bing 搜索
→ 搜索结果
→ 模型判断 meaning / usage / worth
```

### 入库

只有：

```text
搜得到
有来源
模型认为值得记
不是纯昵称/报错/无意义口癖
```

才写进 `state/slang.json` 和知识库。

没有固定词表。

---

## 15. 本地检索

`search_local`：

```text
SQLite FTS 优先
失败回退 LIKE
不额外走网络
```

适合查旧事、设定、视频背景。  
新主题没灌入时，查不到就是查不到。

---

## 16. 语音

### 当前

```text
Edge 中文
→ RVC ATRI
→ QQ 语音
```

特点：

```text
清楚
不调情
情绪平
```

### 满穗

已训练：

```text
s2 clean
583 段
2 轮
```

问题：

```text
s1 没训成
语气仍偏平/偏软
```

### 失败原因

本机内存和 Windows 提交内存不足：

```text
torch 加载失败
CPU 分配小块内存失败
```

不是代码错误。

### 按需

GPT-SoVITS 不常驻：

```text
第一次语音启动
闲置关闭
面板可手动关
```

当前默认语音仍不是满穗。

---

## 17. 表情与颜文字

### 文字

颜文字正常文本：

```text
(๑•̀ㅂ•́)و✧
(´・ω・`)
_(:з」∠)_
```

不会被过滤。

### QQ 表情

走 expression：

```text
小黄脸
收藏表情
图片表情
```

有冷却和私聊/群聊限制。

---

## 18. 平台

### B站

```text
搜索
视频内容
评论
回复评论
动态
收藏
观看历史
```

### QQ空间

```text
读动态
发说说
可见范围
```

动作有超时，  
失败不影响主对话。

---

## 19. 面板

包含：

```text
模式
白名单
语音识别
视觉
知识库
自主发现
B站
Story Editor
Story Agency
语音服务
权限中心
记忆
```

权限中心可操作：  
待批、有效、同意、拒绝、撤回、加减时间。

记忆区可：  
查看、忘掉某句、忘掉这个人。

---

## 20. 数据与隐私

### 不入库

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

### 已检查

```text
没有真实 QQ 号
没有 Bearer token
没有 Cookie
没有本机绝对路径
历史里没有 config/state/secrets
```

### 仍需注意

```text
不要打包整个工作目录
不要上传 state/
不要把本地配置塞进 release
```

---

## 21. 测试

```text
35 个测试文件
95 个测试
全部通过
```

覆盖：

```text
角色卡
场景
记忆
黑话
表情
权限
跨会话
回复清洗
工具
平台
```

未覆盖：

```text
真实 QQ 网络
真实语音发送
真实群 canary
平台实机
```

---

## 22. 当前可用

```text
文字聊天：可用
群聊：可用
私聊：可用
共享上下文：可用
权限：可用
面板：可用
本地检索：可用
黑话：可用
语音：可用但情绪平
B站/空间：代码可用，实机未全测
```

---

## 23. 已知问题

### 语音

```text
s1 未完成
满穗偏软
Edge + RVC 没有情绪
冷启动慢
```

### 权限

```text
权限是提示层约束，不是硬沙箱
批准后同一轮可能来不及生效
群审批人已锁成主人，但还没有管理员/被骂者选项
```

### 运维

```text
SnowLuma 重启路径可能找不到
GitHub 推送被网络阻断
本地提交领先远端
```

### 数据

```text
满穗/饿殍资料没进本地知识库
部分历史状态是测试数据
CosyVoice 剩一个被锁的 DLL
```

---

## 24. 后续

### 必须

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
角色页编辑个人观/自我形象
群管理员/被骂者审批
知识库灌入
```

### 不做

```text
好感度
固定台词
动作枚举
羞耻数值
把权限写成角色台词
```

---

## 25. 结论

```text
一个角色
一套记忆
一个共享上下文
一套权限
工具在后台，不挡对话
```

角色层干净；  
运行时承担复杂度；  
需要人点头的事，先问再动。

它不是完成品，  
但已经不是关键词回复机器人。
