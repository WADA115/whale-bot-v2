# Catch Policy

空的 `catch` 只允许用于明确的 best-effort 动作：

- 删除临时文件
- 关闭句柄
- 清理锁
- 删除旧缓存
- 读取不存在的可选状态

这些位置统一写成：

```js
catch { /* best-effort */ }
```

不允许再出现真正空白的 `catch {}`。

会影响用户状态、权限、持久化、外部请求的失败，必须至少留下：

```js
logger.warn('module.action_failed', { error })
```

或返回明确的降级结果。

当前已收口：

- app 捕获 token / marker / slang 失败
- room 回调失败
- story store 锁与章节读取失败
- screen / asr / vision 持久化失败
- bilibili 登录校验与 buvid 失败