# 三场景真实模型覆盖率报告

日期：2026-11-13
状态：阶段 1a 三条 P0 垂直线，hosted 模型主报告。
主模型：DeepSeek API `deepseek-flash`（当前由 `DeepSeek-V4.1-Flash-1017` 提供）。
对照模型：本地 Ollama `qwen2.5:14b`（历史结果，模型已删除，仅保留报告）。

## 1. 口径

- 每个场景在运行前固定注册 20 个任务，共 60 个任务；任务定义在 `bench/scenarios.mjs`。
- 覆盖率 = 该场景完成任务数 / 该场景预登记任务数。三个场景分别报告，不用全局平均分替代单场景门槛。
- 一个任务只有同时满足以下条件才算完成：
  - 首轮输出通过结构校验，包含任务要求的可用块；
  - 需要 Answer Envelope 的任务，首个 op 是合法 envelope，且声明的 action 在任务 manifest 中；
  - 需要交互的任务，真实的 `[iui-action]` 被回放，第二轮保留目标 block id 并应用选择值。
- 运行器允许最多两次“校验反馈修复”调用：第一次输出未通过结构校验时，把校验原因和上一次输出回传给模型，让它在同一任务内重写。修复次数在报告中单独计数，不隐藏为一次成功率。
- 参考 fixture 的 60/60 只证明契约和评分器可运行，不是模型覆盖率。
- API key 只通过本地环境变量提供给运行器，不写入报告、日志或 Git。

复现命令：

```bash
export DEEPSEEK_API_KEY=...
export DEEPSEEK_BASE_URL=https://api.deepseek.com
export DEEPSEEK_MODEL=deepseek-flash

npm run build:core
node bench/scenario-run.mjs --provider deepseek --model deepseek-flash \
  --concurrency 2 --timeout 300000 --repair 2 --require 0.9 \
  --out bench/results/scenarios/deepseek-flash-v1.json
```

## 2. 结果

| 场景 | 预登记 | 完成 | 覆盖率 | Answer Envelope | Action | 交互 | 修复调用 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 数据分析 (`data-analysis`) | 20 | 19 | 95.0% | 19/20 | 3/3 | 2/2 | 3 |
| 日常旅行规划 (`daily-travel`) | 20 | 20 | 100.0% | 2/2 | 2/2 | 3/3 | 1 |
| 日常生活 (`daily-life`) | 20 | 20 | 100.0% | 6/6 | 6/6 | 1/1 | 3 |

三个场景都独立达到 90% 门槛，阶段 1a 的三条 P0 垂直线通过。全局数字仅供参考：59/60 = 98.3%；共 7 次校验反馈修复调用。

## 3. 失败与修复

### 数据分析

- `data-campaign`：首轮和两次修复后都没有被评分器识别为“可用 matrix”。模型实际输出了一个 3 列 matrix，但把第一列当作 `Metric` 标签列，数据行只有 2 个值；评分器的 matrix 契约把 `columns` 当作值列，要求每行 `values.length >= columns.length`。这是块形状/列约定不匹配，不是渲染崩溃或空 block。
- 其余 19 个任务通过，包括此前本地 14B 失败的 `data-churn`；本场景交互 2/2，action 3/3。
- 本场景共 3 次校验反馈修复调用；`data-campaign` 占其中 2 次，任务仍判为未完成。

### 日常旅行规划

- 20/20 通过；此前本地 14B 失败的 `travel-hike` 本轮通过。
- 本场景共 1 次校验反馈修复调用。

### 日常生活

- 20/20 通过；此前本地 14B 失败的 `life-emergency` 本轮通过。
- 本场景共 3 次校验反馈修复调用。

## 4. DSH 真实宿主验收

宿主：DSH Web `0.2.2-rc.1`；适配器：`@intelligent-ui/dsh` `0.2.2`；模型：`deepseek-flash`（`DeepSeek-V4.1-Flash-1017`）。
运行时：Node `v26.11.1`、Playwright `1.64.1`、Google Chrome `157.0.8103.51`。

Playwright 驱动真实 DSH Web UI，结果如下：

- 首轮 `render_iui` 渲染了 table/tabs toolview。
- `save_note` action 打开宿主确认对话框。
- 取消关闭对话框，没有写入 `localStorage`，也没有新增 toolview。
- 确认写入恰好一条 note，并把一条 `[iui-action]` 消息发回会话。
- 模型对自动 `[iui-action]` 轮次只回了 prose，没有调用工具。按预登记的 smoke 协议，宿主随后把精确的完整 replacement ops 作为用户消息发送；模型调用 `render_iui`，第二轮完整界面成功渲染，并出现 `copy_text`。
- 故意无效的 op 被模型在调用工具前拒绝，因此没有产生 invalid tool row；上一版有效界面仍然可用，宿主没有进入不可恢复状态。
- 最终仍有一个可用的 `copy_text` action；浏览器 console 无错误。

结论：DSH 首轮渲染、确认/取消、`[iui-action]`、第二轮完整替换和失败保护路径通过。需要明确的是：这次验收使用“精确完整 ops”恢复第二轮，因此验证的是宿主更新路径，不是模型的自动第二轮合规；无效 op 分支由协议测试覆盖，不由该模型实际触发。

可提交的脱敏记录在 [`evidence/dsh-smoke.json`](evidence/dsh-smoke.json)。截图和会话记录只保存在本地 `.dsh-smoke/`、`.dsh-home/`，均被 Git 忽略。

## 5. 本地 Qwen 对照

本地 Ollama `qwen2.5:14b` 的历史结果保留作对照；模型文件已按要求删除，不能从当前机器重新运行。

| 场景 | 预登记 | 完成 | 覆盖率 | Answer Envelope | Action | 交互 |
|---|---:|---:|---:|---:|---:|---:|
| 数据分析 (`data-analysis`) | 20 | 19 | 95.0% | 19/20 | 3/3 | 1/2 |
| 日常旅行规划 (`daily-travel`) | 20 | 19 | 95.0% | 2/2 | 2/2 | 3/3 |
| 日常生活 (`daily-life`) | 20 | 19 | 95.0% | 5/6 | 5/6 | 1/1 |

本地对照的失败任务：

- `data-churn`：第二轮没有应用选中的 `Qualitative` 值。
- `travel-hike`：缺少可用 `dayList`。
- `life-emergency`：首轮 JSON 行损坏，缺少可用 `packing`。

三个场景当时分别为 3、10、3 次修复调用；这一结果只说明本地 14B 在相同契约下的表现，不代表 hosted 模型。

## 6. 限制

- 主报告是一个 hosted 模型、一次 60 任务运行；没有多模型统计或置信区间。
- 评分器是结构 + 关键词 + 交互状态检查，不是 LLM judge；它不能证明内容事实正确，也不评价视觉质量。
- `data-campaign` 的 matrix 失败来自列约定不匹配；它说明模型没有完全遵守评分器的矩阵列契约，保留为真实失败，没有通过改分或删除样本隐藏。
- 修复调用是宿主校验后的真实重试，不是把失败样本删除。原始报告保留首轮、修复后的输出、问题列表和耗时。
- DSH 的第二轮使用精确完整 ops 恢复；无效 op 由模型拒绝，未实际走到 `render_iui` 的校验器分支。这两点已在第 4 节明确。
- travel/pass、issuer、快照 seal、Wallet、DSH travel 凭证适配属于阶段 1b，仍受 issuer 门槛阻塞，本报告没有启动这些工作。
- npm 发布暂停；本报告对应源码工作树和真实模型运行。

## 7. 原始报告

hosted DeepSeek 原始 JSON/Markdown 报告（不提交到 Git）：

- `bench/results/scenarios/deepseek-flash-v1.json`
- `bench/results/scenarios/deepseek-flash-v1.md`

本地 Qwen 历史报告（不提交到 Git）：

- `bench/results/scenarios/ollama-qwen2.5-14b-data-analysis-v3.{json,md}`
- `bench/results/scenarios/ollama-qwen2.5-14b-daily-travel-v3.{json,md}`
- `bench/results/scenarios/ollama-qwen2.5-14b-daily-life-v1.{json,md}`
- `bench/results/scenarios/fixture-v2.{json,md}`（契约 fixture，60/60）

报告中的 `firstResponse`、`secondResponse`、`reasons`、`repairs` 字段用于复核失败和修复路径。

可提交的脱敏逐任务证据：

- [`evidence/scenario-coverage.json`](evidence/scenario-coverage.json)：hosted DeepSeek 主结果。
- [`evidence/scenario-coverage-local-qwen.json`](evidence/scenario-coverage-local-qwen.json)：本地 Qwen 对照结果。
- [`evidence/dsh-smoke.json`](evidence/dsh-smoke.json)：DSH hosted-provider smoke。
