# Stage 1a 实施计划：Beachhead 无关契约

| 项目 | 内容 |
|---|---|
| 状态 | **已实现（核心契约层，2026-11-04）** |
| 依据 | `INTELLIGENT-UI-PLAN.md` §6.3、§6.5、§6.7、§11；`specs/PROTOCOL-SPEC.md`；`specs/DOMAIN-ARTIFACT-SPEC.md` |
| 代码基线 | `33e8abb`（计划批准 + Domain Spec 提交） |
| 边界 | 只做阶段 1a：Answer Envelope、Capability Manifest、Action 生命周期基础、Provenance 两级、answer 级 i18n、适配器接线、测试与文档 |

---

## 0. 两份文件的分析结论

### 0.1 `INTELLIGENT-UI-PLAN.md`

1. 方案已批准，但批准是**有条件的**：travel/pass beachhead 采用"自建测试 issuer 起步 + 阶段 1a 末 issuer 主动门槛 + day plan 回退"。
2. 阶段 1 被拆成 1a 与 1b。**1a 与 traveler 无关，必须先做且可完全复用**；1b（pass profile、双层 seal、快照/TTL/登出、DSH 适配）只有在 issuer 门槛通过后才启动。
3. 1a 的交付范围是：Answer Envelope、Host Capability Manifest、action 基础（intent/state/授权/幂等/错误/审计，只读 + 可逆子集）、provenance 两级预算。
4. 计划把 i18n 吸收进 Answer Envelope（P0-0a）；因此 answer 级 `locale/timeZone/currency/units` 属于 1a，不是后续优化。
5. 1a 的退出标准不是"代码写完"，而是：契约测试通过、只读降级路径可用、槽位/布局断言通过、失败/未知/补偿有测试、无副作用 action 默认不开放。
6. 开源约束：npm 发布与 issuer 外联并行；PROTOCOL-SPEC 英译和证据进 CI 是阶段 1 退出条件，不是 1a 代码的前置。

### 0.2 `specs/DOMAIN-ARTIFACT-SPEC.md`

1. 它是阶段 1b–2 的 travel/pass 实现依据，**不是 1a 的依赖**；1a 不得提前实现 `pass` 块或快照 seal。
2. 三个核心决定必须在 1a 的通用契约中预留位置：双轴 `integrity × freshness`、信任只走宿主 attestation、结论与 artifact 新鲜度绑定。
3. 字段、QR、issuer、Wallet、DSH、快照、隐私和 C26–C32 都属于 1b/2；1a 只提供它们将来使用的 envelope/action/provenance/capability 原语。
4. Domain Spec 的"测试 issuer 私钥不进前端"和"双层 seal"不是 1a 能验证的内容；1a 只写扩展点，不写实现。

### 0.3 由此得到的实施决策

- **先做 1a，不碰 pass。** 当前没有通过 issuer 门槛，启动 1b 会违反计划 §6.7。
- 1a 的验收以协议 conformance 为准：C1–C15、C19、C20，以及 C21 的契约层部分（槽位可见、主行动可达）；C16–C18、C22–C32 留给 1b/2。
- 不新增第 13 个隐藏契约。新增的 `fieldProvenance` 载体是 §14 已定义类型的 additive 载体，需要回写 Protocol Spec。
- 不宣称 1a 等于"可开放副作用 action"。1a 只开放 `read`/`reversible` 的运行时；`irreversible` 在 manifest 和运行时都被拒绝。

---

## 1. 范围

| # | 工作包 | 交付 | 主要文件 |
|---|---|---|---|
| A1 | Answer Envelope | `answer` op、槽位类型、locale/timeZone/currency/units、`fieldProvenance`、legacy mode、槽位 DOM 标记 | `clone/src/iui/contracts.ts`、`protocol.ts`、`compiler.ts`、`sdk/index.ts` |
| A2 | Capability Manifest | manifest 类型/校验、action 白名单、prompt 与 tool schema 同源、未声明 action 拒绝 | `contracts.ts`、`validate.ts`、`sdk/agent.ts` |
| A3 | Action 生命周期 | intent/state/事件、授权、幂等、错误、重试约束、对账、补偿、审计链 | `clone/src/iui/action-machine.ts` |
| A4 | Provenance | answer 级摘要、字段级高风险记录、authority 分离、两级预算校验 | `contracts.ts`、`validate.ts` |
| A5 | answer 级 i18n | locale 解析、数字/日期/货币格式化、核心 chrome/ARIA 字典、chart/matrix/calendar 接入 | `clone/src/iui/i18n.ts`、`registry.ts`、组件 |
| A6 | 适配器接线 | manifest 感知的 action 策略、模型 action 转发、异步失败可见 | `packages/adapter/src/index.ts` |
| A7 | 测试与文档 | 单元测试、浏览器自测、Protocol/SDK/Adapter 文档、计划状态回写 | `tests/`、`SDK.md`、`ADAPTERS.md`、`specs/`、`CHANGELOG.md` |

## 2. 非目标（本计划明确不做）

- 不实现 `pass` 块、QR、issuer、快照、撤销、Wallet、DSH travel 适配。
- 不实现 `storage` profile 的真实后端；只保留类型扩展点，等 1b 的快照需求落地。
- 不开放 `irreversible` action；不实现支付/发送/删除。
- 不宣称 C16–C18、C22–C32 通过；这些依赖 1b/2 的 profile 与真实宿主。
- 不做完整 30 块的本地化重写；1a 只保证 answer 级 locale 生效路径、核心 chrome、action envelope 和代表性数据块。
- 不宣称 npm 已发布；发布仍是并行轨道。

## 3. 验收

### 3.1 自动检查

| 检查 | 方式 | 通过标准 |
|---|---|---|
| `npm run build` | 六包构建 | 无 TS/构建错误 |
| `npm run test:unit` | Node 测试 | 现有测试 + 新契约测试全过 |
| `npm run selftest` | Playwright + Chrome | 自测总数更新后全过 |
| `npm run check:docs` | 文档检查 | 英文文档无新增违规 |
| `npm run typecheck` | 六包类型检查 | 通过 |

### 3.2 协议 conformance 映射

| 用例 | 覆盖位置 |
|---|---|
| C1 合法 answer | `validateAnswer`、浏览器自测 |
| C2 缺 conclusion | `validateAnswer` |
| C3 两个 primaryArtifact | `validateAnswer`（重复字段/重复 id） |
| C4 模型写 attested | `validateAnswer` |
| C5 跨凭证 attestation | 1b（Domain Spec C27） |
| C6 模型写 operationId/idempotencyKey | `validateAnswer`、props 扫描 |
| C7 未声明 action | `validateAnswer` + manifest |
| C8 需要确认 | `ActionRuntime` |
| C9 重复点击 | `ActionRuntime` 幂等 |
| C10 同键不同参数 | `ActionRuntime` |
| C11 超时 → unknown → reconciling | `ActionRuntime` |
| C12 执行中取消 | `ActionRuntime` 的 `cancel_requested` |
| C13 授权后权限撤销 | `ActionRuntime` 的 manifest/策略检查 |
| C14 乱序/重复 event | `ActionRuntime.applyEvent` |
| C15 补偿失败 → `manual_review` | `ActionRuntime.completeCompensation` |
| C19 离线结论 | 1b（需要 pass freshness） |
| C20 locale | `i18n` + 浏览器自测 |
| C21 容器溢出 | 现有自测保留；1a 加槽位可达性断言 |

## 4. 执行顺序

1. 写契约类型与 canonical/hash 工具。
2. 扩展协议与验证器；先让非法 answer 可拒绝。
3. 实现 action runtime；先测状态机，再接 UI。
4. 接 runtime：answer op、槽位标记、action bar、legacy mode。
5. 接 i18n 与代表性块；补适配器。
6. 补浏览器自测、文档、spec 回写与计划状态。
7. 运行 build/typecheck/unit/e2e/docs；记录失败与限制。

## 5. 执行结果（2026-11-04）

| 检查 | 结果 |
|---|---|
| `npm run build` | 通过（六包） |
| `npm run typecheck` | 通过（六包） |
| `npm run test:unit` | 54/54 通过 |
| `npm run test:e2e` | 29/29 浏览器自测通过；MCP App 启动通过 |
| `npm run check:docs` | 通过（21 个 Markdown 文件） |

新增测试覆盖：Answer Envelope/槽位/legacy、answer 非首项回退、manifest 校验、authority/verification 分离、field provenance、不可逆 action 拒绝、args 白名单、幂等冲突、确认→授权→执行、超时→reconciling、执行中取消、乱序/重复事件、补偿失败→manual_review、审计链、manifest 撤销（C13）、answer 级 locale 数字与 chrome/ARIA。

## 6. 已知限制（完成时必须保留）

- Action runtime 默认内存实现；宿主必须替换为持久 ledger 才能跨进程对账。
- 自动重试预算尚未实现；runtime 只暴露 `retryable` 错误并阻止 `unknown` 直接重试，重试入口由宿主策略控制。
- 审计链是哈希链，不是不可篡改存储；防篡改依赖宿主持久化。
- Answer Envelope 的 slot 只解析 `answer.actions[]`；block action 的稳定 id 需要 1b 的 pass 块一起定。
- i18n 是契约与核心路径，不是全部 30 块的完整翻译。
- V11 的“高风险字段必须有 field-level provenance”只实现了记录形状与 authority/verification 校验；字段路径到高风险字段的映射依赖 1b 的 pass profile。
- 模型提供的 `verification.schema` 保留为 claim，不作为可信结论；`integrity`、`sourceIdentity`、`crossSource` 已降级，宿主 attestation 接入前不得显示为已验证。
- 本计划不改变 issuer 门槛结论：1a 完成后仍需外联检查，未通过则切 day plan。

## 7. 三场景真实模型验收（2026-11-11）

在已冻结的 1a 契约之上，新增三个场景各 20 个预登记任务，共 60 个。首轮真实模型使用本地 Ollama `qwen2.5:14b`，单并发，最多 2 次校验反馈修复。2026-11-13 在同一契约上补跑 hosted DeepSeek `deepseek-flash`（`DeepSeek-V4.1-Flash-1017`），双并发。

Hosted 主结果：

| 场景 | 预登记 | 完成 | 覆盖率 | 结论 |
|---|---:|---:|---:|---|
| 数据分析 | 20 | 19 | 95.0% | 通过 |
| 日常旅行规划 | 20 | 20 | 100.0% | 通过 |
| 日常生活 | 20 | 20 | 100.0% | 通过 |

本地 Qwen 对照：三个场景各 19/20，均 95.0%。两组都分别过线，不用全局平均分替代单场景门槛。完整失败原因、修复次数、复现命令和 DSH 宿主验收见 [`SCENARIO-COVERAGE.md`](SCENARIO-COVERAGE.md)。

本轮没有启动 travel/pass、issuer、快照 seal、Wallet 或 DSH travel 凭证适配。这些仍属于 1b，受 issuer 门槛阻塞。npm 发布仍暂停。
