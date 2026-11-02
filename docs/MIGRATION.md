# v2 迁移方案

## 目标

用静态模块替换 v1 的运行时字符串生成，消灭三类反复出现的问题：

```
并发刷屏
补丁互相覆盖
改一处坏一片
```

## 当前边界

v2 第一版接管：

- OneBot 收发
- 群/私聊白名单
- @ / 别名触发
- 每会话串行 actor
- 突发消息合并
- 文本模型降级
- 图片识别
- 只读知识库检索
- 本地 JSON 记忆
- 单气泡纯文本发送

v1 继续负责：

- 黑话候选
- 表情/贴纸
- 成长系统
- 主动发言
- 插件子进程
- DSH 会话与完整记忆

## 影子模式

`config.mode = "shadow"` 时：

- 不调模型（默认）
- 不发送 QQ
- 只记录 `state/logs/v2.jsonl`
- 健康检查在 `3201`

影子跑法：

```bash
node src/index.js --shadow
```

## 切流顺序

1. 影子跑 24 小时，确认无崩溃、无重复 turn
2. 开启 `shadow.callModels=true`，对比模型回复
3. 配置群白名单，`mode=live`，只接一个测试群
4. 观察刷屏、漏回、重复回
5. 扩到第二个群
6. 接入图片、记忆、知识库
7. v1 退出

## 回滚

任何一步只需：

```json
{ "mode": "shadow" }
```

v2 就不再发送，v1 继续运行。

## 不做

- 微服务
- 消息队列中间件
- 多 gateway 进程
- 运行时生成函数
- 全量重写人格和知识库

## 目录

```
src/gateway/onebot.js     协议适配
src/core/actor.js         每会话串行 + 合并
src/core/policy.js        白名单/@/别名
src/core/router.js        模型降级 + 熔断
src/core/reply.js         提示词 + 清洗
src/app.js                组装 + health
tests/                    静态测试
```
