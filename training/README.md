# 训练场

离线跑情境，不接 QQ，不写真实 `state/`。

```powershell
cd E:\deepseek_qq.bot\qq-bridge-v2
node training\run.mjs --pack basic
node training\run.mjs --pack habit --remember
```

输出在：

```text
training/runs/<时间>/<pack>.md
```

这里只记录她的原始反应，不打分，不写标准答案。

## 现在有什么

```text
训练/run.mjs        读取真实角色卡，走真实叙事 prompt
训练/scenarios/     原始情境，不写预期回复
训练/runs/          每次运行的原文记录，已被 gitignore
--remember          把训练里的选择记到 training/memory/
```

## 后果

默认由另一个模型扮演对方：

```text
她说完
→ 对方根据她这句话回
→ 她再接
```

不是固定台词。

要回到写死的 followUps：

```text
--fixed
```

## 习惯

同一个 `memory` 键会保留以前的原始对话片段，下一次作为“以前类似的事”带进去。

不是“习惯值”，也不是“她学会了”。  
只是她以前真的这么做过。

## 还没有什么

```text
盲测对比
把沙盒结果转成真实记忆
自动判断哪句更像人
```

沙盒里练出来的东西，不能当成她真实经历过的人生。
