# 验收证据

本目录保存可提交的验收证据。完整模型响应保存在本地
`bench/results/scenarios/`，该目录被 `.gitignore` 忽略，不进入提交。
这里只保存去掉响应正文的逐任务结果和宿主事件摘要，避免把大量模型输出或
会话内容写入仓库。

| 文件 | 内容 |
|---|---|
| `scenario-coverage.json` | Hosted DeepSeek 三场景 60 个预登记任务的逐任务结果、失败原因、修复次数和耗时 |
| `scenario-coverage-local-qwen.json` | 本地 Qwen 2.5 14B 的历史对照结果 |
| `dsh-smoke.json` | DSH 0.2.2-rc.1 浏览器 smoke 的步骤和结果；包含 DeepSeek V4.1 Flash 的 hosted-provider 验收和显式完整 ops 恢复说明 |

`scenario-coverage.json` 由三份原始 JSON 生成。生成命令和报告口径见
[`../SCENARIO-COVERAGE.md`](../SCENARIO-COVERAGE.md)。原始报告中的
`firstResponse`、`secondResponse`、`issues` 和 `repairs` 字段用于复核失败和
修复路径。
