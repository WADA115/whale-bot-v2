# 小鲸鱼 QQ 角色运行时：完整项目报告

> 版本：v2  
> 更新时间：2026-11-10  
> 这份报告描述当前真实状态，不把计划写成已完成。

---

## 0. 摘要

小鲸鱼是一个自托管的 QQ 角色运行时。

它不是关键词机器人，也不是客服助手。它试图让一个角色在 QQ 里持续存在：

- 有自己的身份、立场、偏好和自我形象；
- 有连续的记忆、关系和没说完的话；
- 群聊和私聊里是同一个人；
- 会主动、会沉默、会错过、会事后想起；
- 能调用工具，但工具不写进角色；
- 需要越界时先问主人；
- 对主人偏心、护短，但不是没有判断。

当前状态：

```text
文字聊天       可用
私聊 / 群聊    可用
共享上下文     可用
权限请求/批准  可用
成员记忆       可用
日记           可用
关系节点       可用
旧记忆整理     可用
图片识别       可用，带缓存和重试
语音识别       可用，带 VAD 和缓存
语音发送       Edge + RVC，可用但情绪平
表情 / 引用    已修，真实 QQ 仍需复测
Web 面板       可用
Electron 桌面  可用，已打包单文件 exe
Live2D 桌宠    未做
情绪语音 s1    未完成
真实全链路     未完整验收
```

核心约束始终没变：

```text
角色层不写死：
不写固定回复
不写关键词映射
不写好感受 / 次数 / 等级
不写动作枚举
不写函数
```

运行时可以有超时、计数、缓存、日志、权限状态。  
这些是运行时的东西，不属于角色。

---

## 1. 项目定位

### 1.1 它是什么

```text
一个自托管的 QQ 角色运行时
一个长期存在的角色
一套跨会话记忆
一套双向权限
一组后台能力
```

### 1.2 它不是什么

```text
不是通用客服
不是关键词回复机器人
不是角色卡播放器
不是好感度养成游戏
不是无边界工具代理
```

### 1.3 硬边界

以下事情不因权限、调情、角色关系而开放：

```text
攻击现实家人
攻击现实中的真人
攻击受保护群体
威胁
开盒 / 人肉
身份攻击
```

权限只能打开“角色之间/角色与主人之间”的临时空间，  
不能打开这些底线。

---

## 2. 演进过程

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

没有数值、函数、固定台词。

### 2.3 记忆和叙事

记忆逐步分层：

```text
mind/           内在状态、心跳、离线连续感
story/          关系、共同经历、场景、人物
state/scenes    每个会话的最近往返
state/contacts  成员记忆
state/moments   她以后还会想起的事
state/diary     她自己写的日记
state/milestones 关系节点
state/memory-summary.md 整理后的旧事
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
口语批准 / 拒绝
范围和时长可改
主动给
撤回
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

### 2.8 外挂提速

外挂曾经很慢，原因是：

```text
视觉模型冷启动
原图直接送模型
每次语音都重新加载 RVC
识图 / ASR / RVC 互相抢资源
失败后没有明确状态
```

后来逐项处理：

```text
视觉模型常驻
图片缩放
图片按内容 / URL 缓存
ASR 裁静音
语音按音频缓存
媒体单并发
识图和 ASR 并行
RVC 常驻服务
失败状态显式化
```

### 2.9 桌面壳

从“只能开浏览器看面板”发展成：

```text
Electron 独立窗口
托盘
单实例
窗口状态记忆
打包单文件 exe
```

---

## 3. 设计原则

### 3.1 角色层

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

### 3.2 运行时

```text
模型路由
工具调用
权限
超时
缓存
日志
状态
上下文
```

### 3.3 明确不做

```text
好感度
信任值
情绪分数
动作枚举
固定台词表
if 情绪=生气 -> 说某句
```

### 3.4 “死文本”的判断

死文本指：

```text
固定回复
关键词 → 固定句子
工具失败 → 固定播报
每个场景 → 固定开场白
```

不是死文本：

```text
状态事实
[media:image_pending]
[action:speak_failed]
“这张图你现在没看到”
“不要描述图里的内容”
```

前者是让她知道发生了什么；  
后者是替她说话。

当前工具失败只返回事实标签，  
最终怎么说由模型判断。

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
 ├─ 面板 / API 3201
 ├─ Ollama 11434
 ├─ RVC 9881
 └─ GPT-SoVITS 9880（按需，当前不用）
```

### 4.1 数据流

```text
QQ 消息
→ OneBot 标准化
→ 共享会话流
→ 成员记忆
→ 群聊观察 / 黑话
→ 权限判断
→ 会话 actor 队列
→ 上下文组装
→ 模型 / 工具
→ 回复清洗
→ 文字 / 语音 / 表情
→ 记录发出
```

---

## 5. 目录

```text
qq-bridge-v2/
├─ characters/          角色卡
├─ core/                基础能力
├─ desktop/             Electron 桌面壳
├─ docs/                文档
├─ scripts/             启动、维护、本地路径
├─ src/
│  ├─ runtime/          一次回合、能力、发言、锁
│  ├─ character/        场景、表达、黑话、任务
│  ├─ mind/             内在状态、daydream
│  ├─ story/            关系、共同经历、编辑
│  ├─ core/             模型路由、媒体、权限、记忆
│  ├─ platform/         B站
│  ├─ gateway/          OneBot
│  └─ http/             面板 API
├─ state/               运行数据（不进仓库）
├─ tests/               35 个测试文件
├─ training/            语音训练资料
├─ web/next/            面板前端
├─ config.example.json
├─ config.json          本地配置（不进仓库）
└─ package.json
```

---

## 6. 启动与端口

### 6.1 端口

```text
3000  OneBot HTTP
3001  OneBot WebSocket
3199  ASR
3201  面板 / API
5099  SnowLuma WebUI
9880  GPT-SoVITS（按需）
9881  RVC 常驻服务
11434 Ollama
```

### 6.2 启动

```text
scripts/start-core.ps1
scripts/start-gateway.ps1
scripts/start-all.ps1
scripts/stop-all.ps1
scripts/watchdog.ps1
```

`start-core.ps1` 会按需启动：

```text
ASR
RVC
Ollama
网关
v2 core
```

### 6.3 桌面

```text
desktop/main.js
desktop/launch.js
desktop/启动小鲸鱼.vbs
desktop/dist/小鲸鱼面板.exe
```

---

## 7. 一次消息的完整链路

### 7.1 入站

```text
SnowLuma 收到 QQ 消息
→ 网关标准化
→ 记录共享会话流
→ 记录成员记忆
→ 引用消息取原消息
→ 群聊给 live-group / 黑话观察器
→ 权限判断（不阻塞）
→ 决定是否处理
→ 进入对应会话的 actor 队列
```

### 7.2 引用

OneBot 的 `reply` 段只有消息 id，没有原话。

现在：

```text
reply 段
→ message.replyTo
→ gateway.getMessage()
→ 原消息发送者 / 文本
→ 进入提示
```

她能看到：

```text
他引用了一条：某某：原话
```

非文字引用会标记为“非文字消息”。

### 7.3 上下文组装

```text
当前会话最近往返
+ 其他会话背景
+ 角色卡
+ 个人观
+ 自我形象
+ 内在状态
+ 关系 / 共同经历
+ 成员记忆
+ 日记
+ 关系节点
+ 旧记忆整理（仅私聊）
+ 本地知识
+ 黑话
+ 虚拟感官
+ 图片 / 语音描述
+ 临时许可
+ 被拒绝的事
```

### 7.4 生成

```text
直接回复
或调用工具：

speak
request_permission
ask_owner
confide
forget_memory
note_moment
write_diary
remember_milestone
search_local
draw_picture
sing_song
bili_*
look_group_history
```

### 7.5 出站

```text
文字 → 当前会话
图片 / 语音 / 表情 → gateway
记录发出的文字到共享流
```

---

## 8. 角色层

### 8.1 当前内容

```text
身份：蓝色小鲸鱼，被叫鱼鱼
关系：对主人有感情，偏心、护短
边界：不泄露、不假装现实操作、不攻击现实家人 / 群体、不威胁 / 挂人 / 开盒
驱动：不想只在被需要时出现
世界：一些关于被对待、被记住的片段
说话：短、嘴硬、会怼
```

### 8.2 个人观

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

### 8.3 护主

```text
别人说主人不好 → 先顶回去
主人难受 → 先站他这边
主人可以自己损她，别人不行
护主不是没判断
不替主人攻击现实家人 / 群体
不威胁、不挂人、不开盒
```

### 8.4 问题与倾诉

群里遇到问题：

```text
该私下问就用 ask_owner
能在群里问就在群里问
不按“问题大小”机械分类
```

有情绪又不想当众说：

```text
confide
→ 私下发给主人
```

不是每轮都用，  
不想说可以不说。

---

## 9. 记忆

### 9.1 成员记忆

`state/contacts.json`：

```text
昵称
出现过的会话
最近聊过的几句话
```

记忆条目带来源和时间，  
但没有次数、好感、等级。

面板可查看、忘掉某句、忘掉这个人。

### 9.2 moment

`state/moments.json`：

```text
以后还会想起的一幕
是当众还是私下
```

她可以主动用 `note_moment` 记，  
不是每句都记。

### 9.3 日记

`state/diary.json`：

```text
她以后会想起、想自己留一笔的事
```

工具：

```text
write_diary
```

特点：

```text
不是每轮都写
不写流水账
不是模板日记
内容由她自己写
```

她回复时会带最近两段，  
作为自己的记忆。

### 9.4 关系节点

`state/milestones.json`：

```text
第一次
答应过的事
重要的日子
一次没说完的话
```

工具：

```text
remember_milestone
```

不是好感度，  
没有评分，  
只是“发生过”。

### 9.5 旧记忆整理

`state/memory-summary.md`：

```text
从日记、关系节点、成员备注里整理出的一段旧事
```

特点：

```text
模型改写，不写报告
没有分数、天数、函数
只在私聊提示里使用
群聊不会拿到私聊旧事摘要
```

启动时整理一次，  
之后定期检查；  
内容没变就跳过。

### 9.6 拒绝记忆

被拒绝的事会留在权限状态里：

```text
之前没让做的：...
别纠缠；相关时再提。
```

### 9.7 内在状态

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

### 9.8 关系与故事

`story/`：

```text
关系
共同经历
场景
人物
生活线
```

---

## 10. 跨会话与隐私

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

记忆整理摘要只在私聊进入提示，  
群聊不读。

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

### 12.1 请求

角色调用 `request_permission`。

群聊请求同时发：

```text
当前群
主人私聊
```

私聊请求只发主人。

### 12.2 批准

当前设置：

```text
groupApprovers: owner
```

群里只有主人私聊能批。  
群里其他人说“行”不算。

### 12.3 口语

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

### 12.4 默认

```text
范围：群聊 + 私聊
时长：三十分钟
```

### 12.5 主动给

主人可以直接说：

```text
今天可以骂
这货可以骂
给你十分钟
```

不必等她请求。

### 12.6 撤回

批准后可以：

```text
算了
不给
不行
```

### 12.7 面板

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

### 12.8 边界

不能申请：

```text
家人
真人
群体
威胁
开盒
```

权限是提示层约束，不是硬沙箱。  
它约束模型，不替代系统级隔离。

---

## 13. 媒体能力

### 13.1 视觉

```text
Ollama
qwen3-vl:4b
```

当前配置：

```text
num_ctx 4096
num_predict 700
keep_alive 30m
provider timeout 30s
actor wait 10s
```

处理链路：

```text
下载原图
→ 长边缩到 1024
→ JPEG 质量 80
→ 内容 hash 缓存
→ URL 缓存
→ 视觉模型
```

缓存：

```text
state/cache/vision.json
```

特点：

```text
同一张图第二次不再调模型
同一 URL 不再下载
模型常驻 GPU
Ollama 未就绪时重试
```

实测：

```text
第一次识图约 4.3 秒
同一张图缓存命中约 1 毫秒
```

### 13.2 语音识别

```text
sherpa-onnx paraformer-zh-small
int8
本地 3199
```

处理链路：

```text
下载 / 读取语音
→ 裁首尾静音
→ 16k 单声道 WAV
→ ASR
→ 音频 hash 缓存
```

缓存：

```text
state/cache/asr.json
```

实测：

```text
第一次约 550 毫秒
同一段缓存命中 0 毫秒
```

### 13.3 语音合成

```text
Edge 中文
→ RVC ATRI
```

RVC 当前：

```text
9881 常驻服务
GPU
半精度
```

实测：

```text
CPU 单次约 22 秒
GPU CLI 约 9.6 秒
GPU 常驻第一次约 3.77 秒
GPU 常驻后续约 0.12 秒
```

服务失败会回退 CLI。

### 13.4 并发

```text
识图：单并发
ASR：单并发
RVC：单并发
```

避免多张图、识图和 RVC 互相抢 GPU。

### 13.5 失败状态

视觉超时或失败：

```text
[media:image_pending]
这张图你现在没看到，不是没看清内容。
不要描述图里的任何内容，不要猜。
```

语音超时或失败：

```text
[media:voice_pending]
这条语音你没听清。
不要复述语音内容。
```

工具失败：

```text
[action:speak_failed]
[action:draw_failed]
[action:sing_failed]
[action:read_failed]
```

这些是事实标签，不是台词。  
模型需要说明哪一步没成、没做成什么，  
不能假装成功。

---

## 14. 表达、表情与引用

### 14.1 文字

正常文字。

### 14.2 颜文字

颜文字是正常文本，不会被过滤：

```text
(๑•̀ㅂ•́)و✧
(´・ω・`)
_(:з」∠)_
```

### 14.3 QQ 表情

小黄脸走 `face`。

收藏表情走 `mface`：

```text
emojiId       = md5（32 位）
emojiPackageId
emojiKey      = resId
text          = 表情备注
```

失败回退普通 image。

### 14.4 引用

收到：

```text
reply 段 → get_msg → 原消息
```

发送：

```text
当前没有主动引用工具
她能看到别人的引用
```

真实 QQ 仍需复测引用读取。

---

## 15. 主动性与时间

### 15.1 daydream

`src/mind/daydream.js`

目标：

```text
她有自己的时间
不是只在被叫到时启动
```

当前能力：

```text
离线连续感
间隔感知
内在状态推进
```

未验证：

```text
她真的会自己想起一件事并发出来
```

### 15.2 主动性

现有：

```text
daydream
note_moment
write_diary
remember_milestone
```

她可以记录，  
不一定会主动发消息。

主动私聊仍受运行时策略约束。

---

## 16. 黑话与知识

### 16.1 黑话

群聊消息进入观察器，  
够一批后模型提取候选。

每个候选：

```text
Bing 搜索
→ 搜索结果
→ 模型判断 meaning / usage / worth
```

只有：

```text
搜得到
有来源
模型认为值得记
不是纯昵称 / 报错 / 无意义口癖
```

才写进 `state/slang.json` 和知识库。

没有固定词表。

### 16.2 本地检索

`search_local`：

```text
SQLite FTS 优先
失败回退 LIKE
不额外走网络
```

适合查旧事、设定、视频背景。  
新主题没灌入时，查不到就是查不到。

---

## 17. 平台

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

当前代码可用，  
真实平台操作未全测。

---

## 18. 面板

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
她的日记
关系节点
```

权限中心可操作：

```text
待批、有效、同意、拒绝、撤回、加减时间
```

记忆区可：

```text
查看、忘掉某句、忘掉这个人
```

日记 / 关系节点可：

```text
查看
删掉
```

---

## 19. 桌面壳

### 19.1 技术

```text
Electron
```

### 19.2 入口

```text
desktop/main.js
desktop/launch.js
desktop/启动小鲸鱼.vbs
desktop/dist/小鲸鱼面板.exe
```

### 19.3 功能

```text
独立窗口
无浏览器地址栏 / 标签页
托盘
单实例
关闭收进托盘
窗口大小 / 位置记忆
面板服务未起时自动启动 core
```

### 19.4 图标

```text
desktop/assets/icon.png
desktop/assets/icon.ico
```

深色圆角底、蓝鲸。  
窗口、托盘、exe 共用。

### 19.5 打包

```text
electron-builder
target: portable
输出: desktop/dist/小鲸鱼面板.exe
```

单文件约 110 MB。

### 19.6 已知限制

```text
自动启动只拉起 core，不保证 ASR / RVC / Ollama 也起来
Windows 图标缓存可能让旧快捷方式继续显示旧图
旧快捷方式可能仍指向 v1
```

---

## 20. 数据与隐私

### 20.1 不入库

```text
config.json
state/
state/secrets.json
state/bilibili.json
state/logs/
state/voice/
scripts/local.paths.ps1
desktop/node_modules/
desktop/dist/
```

### 20.2 仓库内

```text
config.example.json
characters/小鲸鱼.json
docs/
training/
friend-kit/
desktop 源码 / 图标
```

### 20.3 已检查

```text
没有真实 QQ 号
没有 Bearer token
没有 Cookie
没有本机绝对路径
历史里没有 config / state / secrets
```

### 20.4 仍需注意

```text
不要打包整个工作目录
不要上传 state/
不要把本地配置塞进 release
桌面 exe 只包含壳，不包含 state
```

---

## 21. 测试与验收

### 21.1 自动测试

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

### 21.2 已做的人工 / 模块验收

```text
私聊模拟回合
router.ok
simulate.would_send
图片识图 + 缓存
ASR + VAD + 缓存
RVC 常驻服务
桌面 exe 启动
桌面 exe 自动拉起 core
```

### 21.3 未覆盖

```text
真实 QQ 私聊投递
真实 QQ 群聊 canary
真实语音发送
真实图片消息
真实引用回复
QQ空间 / B站实机
Live2D
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
图片识别：可用
语音识别：可用
语音发送：可用但情绪平
日记：可用
关系节点：可用
旧记忆整理：可用
桌面壳：可用
```

---

## 23. 已知问题

### 23.1 语音

```text
s1 未完成
满穗偏软
Edge + RVC 没有情绪
RVC GPU 半精度可能改变音色
```

### 23.2 权限

```text
权限是提示层约束，不是硬沙箱
批准后同一轮可能来不及生效
群审批人已锁成主人，但还没有管理员 / 被骂者选项
```

### 23.3 媒体

```text
Ollama 未启动时视觉不可用
图片下载可能超时
RVC 和视觉同时占用显存
GPU 半精度音色需要试听确认
```

### 23.4 桌面

```text
打包版自动启动只保证 core
Windows 图标缓存
旧快捷方式可能指向 v1
exe 未签名，可能触发 SmartScreen
```

### 23.5 运维

```text
GitHub 推送被网络阻断
本地提交领先远端
SnowLuma 重启路径可能找不到
```

### 23.6 未完成

```text
真实 QQ 全链路
情绪语音
Live2D 桌宠
QQ空间 / B站实机
```

---

## 24. 后续

### 必须

```text
真实私聊 + 群聊各跑一条
真实语音发送
真实图片消息
引用读取复测
SnowLuma 重启路径
GitHub 推送
```

### 想做

```text
s1 云端训练
Live2D 桌宠
群内人物关系
她自己的时间
桌面 exe 自动启动完整服务
正式图标 / 签名
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

---

## 26. 变更记录

近期关键提交：

```text
feat: add her own diary
feat: add relationship milestones and panel
feat: consolidate her old memories
perf: keep vision model warm and cheaper
perf: shrink and cache images before vision
perf: trim silence and cache speech recognition
perf: serialize media work and use gpu rvc
perf: use persistent rvc server
fix: read quoted messages and send stickers as mface
fix: never bluff about unseen images
fix: retry vision when ollama is still starting
refactor: remove remaining canned tool wording
feat: add standalone electron panel
feat: package portable electron panel
feat: package icon and direct core startup
```

---

## 27. 一句话版本

```text
她不是靠一句句写死的回复活着；
她靠身份、记忆、关系和运行时状态活着。
```
