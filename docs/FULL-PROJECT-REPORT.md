# 小鲸鱼角色运行时：完整项目报告

> 版本：v2 / 本地优先版  
> 更新时间：2026-11-10  
> 这份报告描述当前真实状态，不把计划写成已完成。

---

## 0. 摘要

小鲸鱼原本是一个自托管的 QQ 角色运行时。

现在它是一个**本地优先**的角色运行时：

```text
本地桌面对话是主入口
QQ 适配层保留，但暂不继续投入
角色、记忆、关系、日记、媒体都在本机
```

当前可以做到：

```text
本地文字聊天
本地发图
本地发表情
本地录语音
图片识别
语音识别
语音发送
颜文字
媒体历史
两套本地媒体库
桌面通知 / 托盘未读
权限系统
成员记忆
日记
关系节点
旧记忆整理
Web 面板
Electron 独立窗口
```

当前不做：

```text
继续和 QQ 风控对抗
换号 / 买号 / 借号
把权限写成硬沙箱
给角色加好感度 / 情绪分数 / 固定台词
```

核心约束仍然没变：

```text
角色层不写死：
不写固定回复
不写关键词映射
不写好感受 / 次数 / 等级
不写动作枚举
不写函数
```

运行时可以有状态、超时、缓存、日志、权限。  
这些不属于角色。

---

## 1. 项目定位

### 1.1 它是什么

```text
一个长期存在的角色
一套跨会话记忆
一套本地媒体库
一套双向权限
一个本地桌面入口
一个可替换的平台适配层
```

### 1.2 它不是什么

```text
不是通用客服
不是关键词回复机器人
不是角色卡播放器
不是好感度养成游戏
不是无边界工具代理
不是 QQ 风控对抗工具
```

### 1.3 为什么转向本地

QQ 的第三方客户端存在风控和封禁风险。

继续做：

```text
换号
买号
借号
绕风控
频繁重连
```

会把角色、账号和更多关联账号一起拖进去。

所以当前决策是：

```text
QQ 先不动
本地桌面作为主入口
等平台环境变化，再换适配层
```

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
state/scenes    会话往返
state/contacts  成员记忆
state/moments   她以后还会想起的事
state/diary     她自己写的日记
state/milestones 关系节点
state/memory-summary.md 整理后的旧事
state/local-history.json 本地对话历史
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

### 2.10 本地优先

QQ 被暂停后，新增：

```text
本地聊天窗
本地发图 / 表情 / 语音
颜文字
本地媒体库
媒体历史
媒体库管理
桌面通知
托盘未读
```

本地聊天走同一套角色、记忆和工具，  
但不经过 OneBot。

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
本地桌面 / 可选 QQ
 │
 ├─ Electron 桌面
 │    ├─ 主面板
 │    ├─ 本地对话窗
 │    ├─ 托盘 / 通知
 │    └─ 单文件 exe
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
 ├─ 本地面板 / API 3201
 ├─ ASR 3199
 ├─ RVC 9881
 ├─ Ollama 11434
 ├─ SnowLuma / OneBot 3000 / 3001（保留，不主用）
 └─ GPT-SoVITS 9880（按需，当前不用）
```

### 4.1 本地链路

```text
本地对话窗
→ POST /api/local/chat
→ 构造 private:local 消息
→ 同一套 actor
→ 输出被本地 gateway 拦截
→ 不发送到 QQ
→ 文字 / 图片 / 语音返回窗口
```

### 4.2 QQ 链路（保留）

```text
QQ 消息
→ SnowLuma
→ OneBot 标准化
→ 同一套 actor
→ 发送回 QQ
```

当前不作为主入口。

---

## 5. 目录

```text
qq-bridge-v2/
├─ characters/          角色卡
├─ desktop/             Electron 桌面壳
│  ├─ main.js
│  ├─ launch.js
│  ├─ assets/
│  └─ dist/
├─ docs/                文档
├─ scripts/             启动、维护、本地路径
├─ src/
│  ├─ runtime/          回合、能力、语音、本地对话
│  ├─ character/        场景、表达、黑话、任务
│  ├─ mind/             内在状态、daydream
│  ├─ story/            关系、共同经历、编辑
│  ├─ core/             模型路由、媒体、权限、记忆
│  ├─ platform/         B站
│  ├─ gateway/          OneBot
│  └─ http/             面板 API
├─ state/               运行数据（不进仓库）
│  ├─ media/
│  │  ├─ her/
│  │  └─ user/
│  ├─ local-history.json
│  ├─ diary.json
│  ├─ milestones.json
│  └─ memory-summary.md
├─ tests/               35 个测试文件
├─ training/            语音训练资料
├─ web/next/            面板 + 本地对话前端
├─ config.example.json
├─ config.json          本地配置（不进仓库）
└─ package.json
```

---

## 6. 启动与端口

### 6.1 端口

```text
3000  OneBot HTTP（保留）
3001  OneBot WebSocket（保留）
3199  ASR
3201  面板 / API / 本地媒体
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
desktop/小鲸鱼面板.exe
desktop/启动小鲸鱼.vbs
```

桌面启动器会清除：

```text
ELECTRON_RUN_AS_NODE
```

否则 Electron 会被当成 Node 跑。

---

## 7. 一次消息的完整链路

### 7.1 本地入站

```text
本地对话窗输入
→ /api/local/chat
→ 附件校验
→ 构造 private:local
→ 本地历史记录用户消息
→ actor 队列
```

### 7.2 QQ 入站

```text
SnowLuma 收到 QQ 消息
→ 网关标准化
→ 引用消息取原消息
→ 共享会话流
→ 成员记忆
→ 群聊观察 / 黑话
→ 权限判断
→ actor 队列
```

### 7.3 上下文

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

### 7.4 工具

```text
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

### 7.5 本地出站

```text
reply 文字
→ 本地 gateway 拦截
→ 写入 local-history
→ 返回聊天窗
```

图片 / 表情 / 语音：

```text
sendMessage 段
→ 缓存到 state/media/her
→ 返回 /media/her/...
→ 聊天窗显示
```

### 7.6 QQ 出站

```text
文字 → 当前会话
图片 / 语音 / 表情 → OneBot gateway
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

没有次数、好感、等级。

### 9.2 moment

`state/moments.json`：

```text
以后还会想起的一幕
是当众还是私下
```

工具：

```text
note_moment
```

### 9.3 日记

`state/diary.json`：

```text
她以后会想起、想自己留一笔的事
```

工具：

```text
write_diary
```

不是每轮都写，  
不写流水账，  
不是模板日记。

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

### 9.6 本地对话历史

`state/local-history.json`：

```text
本地用户消息
她的回复
图片 / 表情 / 语音段
```

用于刷新后恢复聊天，  
不进入 QQ。

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

## 10. 本地媒体库

### 10.1 两套库

```text
state/media/her    她自己的
state/media/user   你的
```

各有：

```text
index.json
图片 / 表情 / 语音文件
```

按内容 hash 去重，  
通过 `/media/her/...`、`/media/user/...` 读取。

### 10.2 你的库

来源：

```text
粘贴图片
拖入图片
录音
从表情面板选择
```

接口：

```text
POST /api/local/upload
GET  /api/media/list?scope=user
POST /api/media/delete
```

### 10.3 她的库

来源：

```text
她发的图片
她发的表情
她发的语音
```

本地 gateway 拦截后自动缓存：

```text
image → state/media/her
sticker → state/media/her
record → state/media/her
```

聊天窗直接读取本地文件，  
不依赖 QQ 临时链接。

### 10.4 媒体历史

`state/local-history.json` 记录：

```text
user：文字 + 附件段
assistant：文字 + 附件段
```

刷新后：

```text
图片还能显示
语音还能播放
表情还能显示
```

### 10.5 管理

本地对话窗有：

```text
库
├─ 我的
└─ 她的
```

可以：

```text
看缩略图
点图发送
删除
```

---

## 11. 本地对话界面

### 11.1 独立窗口

```text
desktop/main.js
→ window.open('/next/local.html')
→ Electron 独立 BrowserWindow
```

不是面板里的输入框。

### 11.2 操作

QQ 式：

```text
Ctrl+V 粘贴图片
拖图片进窗口
表情面板
颜文字面板
点“说话”录音
Enter 发送
Shift+Enter 换行
```

没有文件选择框。

### 11.3 显示

```text
用户消息靠右
她的回复靠左
图片直接显示
语音带播放器
表情显示为图
```

### 11.4 通知

主进程轮询本地历史：

```text
有新 assistant 消息
且对话窗没聚焦
→ Windows 通知
→ 托盘未读 +1
```

点通知：

```text
打开对话窗
清空未读
```

---

## 12. 视觉

### 12.1 模型

```text
Ollama
qwen3-vl:4b
```

配置：

```text
num_ctx 4096
num_predict 700
keep_alive 30m
provider timeout 30s
actor wait 10s
```

链路：

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

实测：

```text
第一次识图约 4.3 秒
同一张图缓存命中约 1 毫秒
```

### 12.2 失败状态

```text
[media:image_pending]
这张图你现在没看到，不是没看清内容。
不要描述图里的任何内容，不要猜。
```

工具失败：

```text
[action:draw_failed]
[action:read_failed]
```

这些是事实标签，不是台词。

---

## 13. 语音

### 13.1 识别

```text
sherpa-onnx paraformer-zh-small
int8
本地 3199
```

链路：

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
WAV 第一次约 550 毫秒
同一段缓存命中 0 毫秒
WebM/Opus 上传也能转写
```

### 13.2 合成

```text
Edge 中文
→ RVC ATRI
```

RVC：

```text
9881 常驻
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

### 13.3 本地录音

```text
MediaRecorder
→ WebM / Opus
→ 上传到 user 库
→ ASR
```

Electron 麦克风权限：

```text
getUserMedia({audio:true}) → ok
```

### 13.4 失败状态

```text
[media:voice_pending]
这条语音你没听清。
不要复述语音内容。
```

---

## 14. 表达

### 14.1 文字

正常文字。

### 14.2 颜文字

本地对话窗有颜文字面板：

```text
(๑•̀ㅂ•́)و✧
(´・ω・`)
_(:з」∠)_
(づ｡◕‿‿◕｡)づ
(╯°□°）╯︵ ┻━┻
```

点击插入输入框，  
不是固定回复。

### 14.3 QQ 表情

小黄脸走 `face`。

收藏表情走 `mface`：

```text
emojiId       = md5（32 位）
emojiPackageId
emojiKey      = resId
text          = 表情备注
```

本地模式走：

```text
local-sticker
→ 下载到 state/media/her
```

失败回退普通 image。

### 14.4 引用

QQ 入站：

```text
reply 段
→ get_msg
→ 原消息
→ 进入提示
```

当前没有主动引用工具。

---

## 15. 权限

### 15.1 请求

角色调用 `request_permission`。

群聊请求同时发：

```text
当前群
主人私聊
```

私聊请求只发主人。

### 15.2 批准

当前设置：

```text
groupApprovers: owner
```

群里只有主人私聊能批。

### 15.3 口语

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

不是固定命令表。

### 15.4 默认

```text
范围：群聊 + 私聊
时长：三十分钟
```

### 15.5 主动给 / 撤回

```text
今天可以骂
这货可以骂
给你十分钟
算了
不给
不行
```

### 15.6 边界

不能申请：

```text
家人
真人
群体
威胁
开盒
```

权限是提示层约束，不是硬沙箱。

### 15.7 本地对话的限制

本地 `private:local` 不走 QQ 权限审批。

她可以说话、用工具，  
但本地没有群审批界面。

---

## 16. 主动性与时间

### 16.1 daydream

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

未完成：

```text
本地主动发消息
```

### 16.2 现有主动性

```text
note_moment
write_diary
remember_milestone
```

她可以记录，  
不一定会主动发消息。

---

## 17. 黑话与知识

### 17.1 黑话

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

### 17.2 本地检索

`search_local`：

```text
SQLite FTS 优先
失败回退 LIKE
不额外走网络
```

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

当前代码保留，  
QQ 平台实机不主用。

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
她的日记
关系节点
```

权限中心：

```text
待批
有效
同意 / 拒绝
撤回
加减时间
```

记忆区：

```text
查看
忘掉某句
忘掉这个人
```

日记 / 关系节点：

```text
查看
删掉
```

---

## 20. 桌面壳

### 20.1 技术

```text
Electron
```

### 20.2 入口

```text
desktop/main.js
desktop/launch.js
desktop/启动小鲸鱼.vbs
desktop/dist/小鲸鱼面板.exe
```

### 20.3 功能

```text
独立窗口
无浏览器地址栏 / 标签页
托盘
单实例
关闭收进托盘
窗口大小 / 位置记忆
面板服务没起时自动启动 core
```

### 20.4 本地对话窗口

```text
window.open('/next/local.html')
→ 独立 BrowserWindow
→ 680 × 860
```

### 20.5 通知

```text
轮询 /api/local/history
→ 新 assistant 消息
→ 对话窗没聚焦
→ Windows 通知
→ 托盘未读
```

### 20.6 图标

```text
desktop/assets/icon.png
desktop/assets/icon.ico
```

深色圆角底、蓝鲸。

### 20.7 打包

```text
electron-builder
target: portable
输出: desktop/dist/小鲸鱼面板.exe
```

单文件约 110 MB。

### 20.8 已知限制

```text
自动启动只保证 core
Windows 图标缓存可能显示旧图标
exe 未签名，可能触发 SmartScreen
通知靠轮询，不是推送
```

---

## 21. 数据与隐私

### 21.1 不入库

```text
config.json
state/
state/secrets.json
state/bilibili.json
state/logs/
state/voice/
state/media/
state/local-history.json
scripts/local.paths.ps1
desktop/node_modules/
desktop/dist/
```

### 21.2 仓库内

```text
config.example.json
characters/小鲸鱼.json
docs/
training/
friend-kit/
desktop 源码 / 图标
```

### 21.3 隐私

```text
本地媒体只在本机
媒体库不自动上传
旧记忆整理只在私聊使用
群聊上下文不展开私聊原话
```

### 21.4 仍需注意

```text
不要打包整个 state/
不要把本地配置塞进 release
不要把媒体库当公开静态目录暴露到公网
```

---

## 22. 测试与验收

### 22.1 自动测试

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

### 22.2 本地媒体实测

```text
图片上传 → 视觉识别 → 回复
WebM/Opus 语音上传 → ASR → 回复
她的表情 → 自动缓存到 her 库
历史 → 图片 / 语音段保留
媒体库 → 列表 / 删除
Electron 麦克风 → 权限 ok
Windows 通知 → supported / unread +1
```

### 22.3 未覆盖

```text
真实按住录音全链路
真实粘贴图片
真实拖拽图片
桌面通知点击行为
真实 QQ 全链路
Live2D
```

---

## 23. 当前可用

```text
本地文字聊天：可用
本地发图：可用
本地发表情：可用
本地录语音：可用
图片识别：可用
语音识别：可用
语音发送：可用但情绪平
颜文字：可用
媒体历史：可用
媒体库：可用
桌面通知：可用
托盘未读：可用
权限：可用
面板：可用
QQ：代码保留，暂不主用
```

---

## 24. 已知问题

### 24.1 本地对话

```text
通知靠轮询，可能有 2-3 秒延迟
粘贴 / 拖拽 / 录音交互未完全自动化验收
媒体库没有容量统计和清理策略
删除媒体会让历史里的旧引用失效
```

### 24.2 语音

```text
s1 未完成
满穗偏软
Edge + RVC 没有情绪
RVC GPU 半精度可能改变音色
```

### 24.3 权限

```text
权限是提示层约束，不是硬沙箱
本地对话没有群审批界面
批准后同一轮可能来不及生效
```

### 24.4 桌面

```text
自动启动只保证 core
未签名，可能触发 SmartScreen
图标缓存可能显示旧图
```

### 24.5 QQ

```text
账号 / 客户端风控
不继续对抗
真实 QQ 全链路未验收
```

---

## 25. 后续

### 必须

```text
本地通知点击行为验收
粘贴 / 拖拽 / 录音全链路验收
媒体库容量和清理
备份 / 导出
```

### 想做

```text
开机自启
本地主动消息
Live2D 桌宠
情绪语音 s1
```

### 不做

```text
好感度
固定台词
动作枚举
羞耻数值
把权限写成角色台词
换号 / 买号绕 QQ 风控
```

---

## 26. 结论

```text
一个角色
一套记忆
一个本地入口
两套媒体库
一套权限
工具在后台，不挡对话
```

角色层干净；  
运行时承担复杂度；  
需要人点头的事，先问再动。

它不是完成品，  
但已经不再依赖 QQ 才能存在。

---

## 27. 变更记录

近期关键提交：

```text
feat: add local desktop chat
feat: add standalone local chat window
feat: add local media libraries and attachments
feat: paste drag record local media
feat: add kaomoji picker to local chat
feat: persist local media history and library UI
feat: desktop notifications and unread tray
fix: media ext and webm mime
fix: desktop notifications
docs: refresh full project report
```

---

## 28. 一句话版本

```text
QQ 可以没有；
她得还在。
```
