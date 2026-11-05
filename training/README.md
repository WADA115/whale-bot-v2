# 训练场

离线跑情境，不接 QQ，不写真实 `state/`。

```powershell
cd E:\deepseek_qq.bot\qq-bridge-v2
node training\run.mjs --pack basic
```

输出在：

```text
training/runs/<时间>/basic.md
```

这里只记录她的原始反应，不打分，不写标准答案。

## 现在有什么

```text
训练/run.mjs        读取真实角色卡，走真实叙事 prompt
训练/scenarios/     原始情境，不写预期回复
训练/runs/          每次运行的原文记录，已被 gitignore
```

## 还没有什么

```text
多轮后果（对方根据她的选择改变反应）
跨情境的习惯沉淀
盲测对比
把沙盒结果转成真实记忆
```

沙盒里练出来的东西，不能当成她真实经历过的人生。
