# 小深 QQ 运行时 · 朋友版

这是给朋友自己部署的版本。

不需要改现有运行中的配置，也不需要懂代码。  
按顺序做：装依赖、配 SnowLuma、运行 setup、跑 doctor、启动。

---

## 先准备

```text
Windows 10/11
Node.js 22 或更高
SnowLuma（并已登录 QQ）
一个 DeepSeek API Key
```

可选：

```text
Ollama（本地模型）
FFmpeg（语音）
```

---

## 第一步：解压

把压缩包解压到一个**单独目录**，例如：

```text
<项目目录>\
```

不要覆盖正在运行的那一份。

---

## 第二步：启动 SnowLuma

在 SnowLuma 里确认：

```text
OneBot HTTP 端口：3000
OneBot WS 端口：3001
```

并拿到：

```text
HTTP access token
WS access token
```

如果 SnowLuma 和这个目录不在同一台机器，把地址改成实际地址。

---

## 第三步：运行向导

在解压目录打开 PowerShell：

```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

它会问：

```text
SnowLuma HTTP 地址
SnowLuma WS 地址
HTTP token
WS token
DeepSeek API Key
你的 QQ 号
```

然后生成：

```text
config.friend.json
friend-state\secrets.json
```

不会碰 `config.json`，也不会碰原来的 `state`。

---

## 第四步：自检

```powershell
powershell -ExecutionPolicy Bypass -File .\doctor.ps1
```

它会检查：

```text
Node 版本
配置是否能读
端口是否在
SnowLuma 是否在线
Key 有没有
面板是否能起来
```

有阻塞项就按提示改，不要跳过。

---

## 第五步：启动

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

启动后打开：

```text
http://127.0.0.1:3211/next/
```

先只用私聊测试：

```text
在吗
```

确认能回，再加群。

---

## 加群

默认**不加任何群**。

要加群，编辑 `config.friend.json`：

```json
"allow": {
  "groups": ["群号"],
  "private": ["你的QQ号"]
}
```

或者在设置页里加。

默认仍然是：

```text
只有 @ 她 / 叫她名字才回
```

---

## 数据在哪

```text
friend-state\story     故事和人物
friend-state\secrets.json  Key
state\logs             日志
```

这些都在本地。  
不要把这个目录直接发人。

---

## 安全

```text
面板只绑本机
不要把 3211 暴露公网
不要拿主号跑公开群
建议小号
```

QQ、SnowLuma、模型服务都有自己的条款。  
这个包不保证账号安全，也不替这些服务做担保。

---

## 起不来

先跑：

```powershell
powershell -ExecutionPolicy Bypass -File .\doctor.ps1
```

常见原因：

```text
Node 不是 22+
SnowLuma 没开
3000 / 3001 不对
token 不对
Key 是空的
3211 被占用
```

日志：

```text
friend-state\logs
```
