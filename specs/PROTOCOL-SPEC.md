# Intelligent UI Protocol Spec

| 项目 | 内容 |
|---|---|
| 状态 | **草案 0.1，待审；未批准、未实现、不是产品承诺** |
| 适用范围 | IUI-1 op stream 之上的 answer / action / provenance / capability 契约；与 beachhead 无关的公共部分 |
| 依据 | `INTELLIGENT-UI-PLAN.md` §6.3、§6.3.1–6.3.4、§6.4、§8.2；`experiments/pass-spike/` 的 B1–B7 |
| 代码基线 | `dcd1cc6`（`v0.2.2-3-gdcd1cc6`） |
| 规范用语 | **MUST** = 必须；**SHOULD** = 除非有记录的理由，否则必须；**MAY** = 可选 |

> 本文是契约草案，不是实现说明。文中出现的字段、错误码和状态名，只有在对应的 Protocol Spec 条目通过评审后才进入代码。当前 SDK 只实现了 §3.1 的 8 种 op。

---

## 0. 摘要

当前协议只有 8 种 op：`model`、`p`、`md`、`table`、`comp`、`set`、`ask`、`done`。它能表达“显示什么”，不能表达：

- answer 级 locale / timeZone / currency / units；
- 结论、主 artifact、主行动、解释、provenance 的槽位；
- 模型提出的 action intent 与宿主执行结果；
- action 状态、授权、幂等、对账、补偿、审计；
- 宿主能力清单；
- 可信验证结果与模型声明的分离；
- 离线快照的完整性；
- 持久状态的归属与冲突。

本草案把这 12 项写成可测试的契约。**P0 只覆盖选中 beachhead 所需子集**；没有选 beachhead 之前，不应把 12 项一次实现。

---

## 1. 范围与非目标

### 1.1 在范围内

- answer 级 envelope 与槽位；
- action intent、授权、状态机、结果、错误、重试、对账、补偿、审计；
- host capability manifest；
- provenance 的分级、信任边界与预算；
- credential / pass profile（travel 选中时启用）；
- storage / state ownership profile（day plan 选中时启用）；
- 验证规则、兼容策略、conformance 测试矩阵。

### 1.2 不在范围内

- 具体 UI 布局、视觉 token、动画；
- issuer 的真实接入、签名算法实现、Wallet 写入；
- 支付、退款、消息发送等不可逆 action 的开放；
- 宿主身份认证、密钥管理、后端存储实现；
- 真实用户研究、无障碍审计、渗透测试；
- 25/25 mock benchmark 作为产品能力证明。

### 1.3 P0 子集（选中 beachhead 后裁剪）

> **2026-11-03：beachhead 已有条件选定 travel/pass**（计划 §7.6.1；自建测试 issuer 起步，真实 issuer 为阶段 2 门槛，day plan 回退）。**Travel 列即为 P0 裁剪结果**；Day plan 列降级为回退参考，仅在触发放弃条件①时启用。

| 契约 | Travel pass | Day plan |
|---|---|---|
| Answer Envelope | **P0（生效）** | 回退参考 |
| Capability Manifest | **P0（生效）** | 回退参考 |
| Action lifecycle / 授权 / 幂等 / 对账 / 补偿 / 审计 | **P0（只读/可逆）** | 回退参考 |
| Provenance | **P0（凭证/时间/登机口字段）** | 回退参考 |
| Pass profile | **P0（生效；seal 首期用宿主 HMAC，见 §20 建议 7）** | 不启用 |
| Storage / state profile | **P0（快照/TTL/登出）** | 回退参考（任务/冲突/离线队列） |
| i18n（locale/timeZone/currency/units） | **P0（生效）** | 回退参考 |

**未选中的 profile 只保留 schema 与扩展点，不实现。** 这张表是裁剪依据，不是并列开发许可。

### 1.4 十二项映射

| # | 契约 | 本文 |
|---|---|---|
| 1 | Intent Schema | §5 |
| 2 | Action State Machine | §8.1–8.2 |
| 3 | Transition Rules | §8.2–8.4 |
| 4 | Authorization Contract | §7 |
| 5 | Idempotency Contract | §9 |
| 6 | Error Model | §10.1–10.2 |
| 7 | Retry Policy | §10.3 |
| 8 | Reconciliation Protocol | §11 |
| 9 | Compensation Protocol | §12 |
| 10 | Audit Event Schema | §13 |
| 11 | Answer Envelope | §4 |
| 12 | Host Capability Manifest | §6 |

另：provenance §14；credential/pass §15；storage/state §16；验证 §17；conformance §18。

---

## 2. 角色、信任边界与基本原则

### 2.1 角色

| 角色 | 能做什么 | 不能做什么 |
|---|---|---|
| **Model** | 产生 prose、block props、action 提议、provenance **声明** | 不能授权、执行、写 audit、生成 `operationId`/`idempotencyKey`、声明 `authority:"attested"` |
| **Host runtime** | 验证、授权、执行、持久化、审计、渲染状态 | 不能把模型声明直接升级为可信验证 |
| **Block** | 渲染、产生本地交互、发出 action 事件 | 不能自行执行副作用、不能自行判定凭证有效 |
| **Trusted verifier** | 校验签名/issuer/撤销，产出 attestation | 不能替用户确认、不能绕过宿主策略 |
| **Issuer** | 签发凭证、撤销、刷新 | 不直接控制 UI |
| **User** | 确认、取消、拒绝、查看来源 | 不写协议字段 |

### 2.2 信任等级

```text
claimed（模型声明） < attested（宿主/验证者签名或校验） < authoritative（issuer/宿主权威记录）
```

规则：

1. 模型产出的 `verification`、`integrity`、`sourceIdentity` 一律视为 **claimed**，MUST NOT 直接渲染为 Verified 徽章。
2. `authority:"attested"` 只能由宿主或 trusted verifier 写入。
3. UI 的“已验证/可出示”状态 MUST 来自宿主计算，不得来自 block props。
4. 模型不能生成 `operationId`、`idempotencyKey`、`authorizedAt`、`auditId`、`confirmedBy`；出现即拒绝或剥离，并记录 validation issue。

### 2.3 基本原则

| # | 原则 | 含义 |
|---|---|---|
| P1 | 模型输出是不可信输入 | 所有字段都要验证；模型不能决定权限或有效性 |
| P2 | 宿主是唯一执行者 | 模型只提议，宿主授权/执行/审计 |
| P3 | 一个 answer 一个主 artifact、一个主行动 | 比较型可无主行动，但不能多个同级主行动 |
| P4 | 不宣称 exactly-once | 只承诺 at-least-once + 幂等去重 + 对账 |
| P5 | 离线可显示 ≠ 离线仍有效 | 快照必须密封；新鲜度与完整性分开 |
| P6 | 只做 additive 演进 | 新字段/新 op 不改变旧语义；breaking 需要 major |
| P7 | 证据先于声明 | 没有证据包，不写“已验证” |

---

## 3. 线格式与版本

### 3.1 现有 IUI-1 op（基线，不变）

| op | 作用 | 备注 |
|---|---|---|
| `{"t":"model","v":"…"}` | 模型标识/元信息 | 不承载 answer 级契约 |
| `{"t":"p","lvl":0\|2\|3\|4}` | 段落/标题 | 可增加可选 `id` 供槽位引用 |
| `{"t":"md","v":"…"}` | markdown 内容 | 可增加可选 `id` |
| `{"t":"table","head":[…],"rows":[[…]]}` | 表格 | 可增加可选 `id` |
| `{"t":"comp","id":"c1","type":"…","props":{…}}` | 挂载块 | `id` 已存在 |
| `{"t":"set","id":"c1","path":"…","v":…}` | 更新块状态 | 现有语义不变 |
| `{"t":"ask","v":[…]}` | 建议回复 | 1–6 条 |
| `{"t":"done"}` | 结束 | 之后不再产生内容 op |

**兼容规则：** 新增 `id` 字段是 additive；旧宿主可以忽略，但新宿主 MUST 保留它用于槽位解析。

### 3.2 新增 `answer` op（answer envelope 的规范载体）

`answer` op **MUST** 是 op 列表的第一项，**MUST** 最多出现一次，且不直接渲染。它承载 answer 级 locale、槽位、provenance 摘要和 action 提议。不支持该 op 的旧宿主 MUST 忽略它并进入 legacy mode，不能把 JSON 渲染成文本。

```json
{"t":"answer","schemaVersion":"1.0","locale":"zh-CN","timeZone":"Europe/Amsterdam","currency":"EUR","units":"metric","slots":{"conclusion":{"kind":"op","id":"conclusion"},"primaryArtifact":{"kind":"comp","id":"c1"},"primaryAction":{"kind":"action","id":"a1"},"explanation":[{"kind":"op","id":"why"}],"provenance":[{"kind":"op","id":"src"}]},"actions":[{"id":"a1","name":"open_qr","args":{},"confirmHint":"出示二维码","riskHint":"read"}],"provenance":{"authority":"claimed","source":{"id":"issuer:MR","kind":"issuer"},"retrievedAt":"2026-11-03T17:40:00Z","verification":{"sourceIdentity":"unverified","integrity":"unverified","schema":"valid","crossSource":"not_checked"}},"assumptions":["登机口以最后在线校验为准"]}
```

### 3.3 槽位引用

```ts
type SlotRef =
  | { kind: "op"; id: string }       // p / md / table
  | { kind: "comp"; id: string }     // comp
  | { kind: "action"; id: string };  // answer.actions[] 或 block action

type AnswerSlots = {
  conclusion: SlotRef;               // 必需
  primaryArtifact?: SlotRef;         // artifact 型 answer 必需，且只能一个
  primaryAction?: SlotRef;           // 有 action 时必需
  explanation?: SlotRef[];
  provenance?: SlotRef[];
};
```

规则：

- 所有 `SlotRef` MUST 能解析到实际 op/comp/action；悬空引用是 validation error。流式渲染允许暂时未解析，但 `done` 后仍未解析必须失败，不能把未解析槽位当真。
- `id` 在一个 answer 内 MUST 唯一（`p`/`md`/`table`/`comp`/`action` 共用命名空间）；重复 id 是 validation error。
- `conclusion` MUST 指向 prose 或 table，不能指向图片/媒体块。
- `primaryArtifact` MUST 指向 `comp`；一个 answer 最多一个。
- `primaryAction` MUST 指向一个已声明的 action；若存在可执行主行动（`actions` 非空，或主 artifact 暴露 block action），槽位缺失即不合法。
- 块产生的 action MUST 有稳定 `name`；若同一个块可发出多个同名 action，MUST 提供稳定 `id` 供槽位引用。
- `explanation` 与 `provenance` 是可见内容，不能藏在折叠区之外不可达。

### 3.4 版本与兼容

- `answer.schemaVersion` 采用 `major.minor`；本草案为 `1.0`。
- **minor**：新增可选字段/枚举值；旧宿主 MUST 忽略未知字段，不得崩溃。
- **major**：改变字段含义、删除字段、改变状态机语义；必须新 op 或新版本，不得静默升级。
- 没有 `answer` op 的旧 answer 进入 **legacy mode**：宿主可以按启发式推断槽位，但 MUST 标记 `legacy:true`，且不能声称满足本文的 Answer Envelope。
- capability manifest 与 `answer` 版本独立协商；不匹配时宿主 MUST 拒绝新字段而不是猜测。

---

## 4. Answer Envelope

### 4.1 字段

| 字段 | 必需 | 类型 | 规则 |
|---|---|---|---|
| `t` | 是 | `"answer"` | 固定 |
| `schemaVersion` | 是 | string | `1.0` |
| `answerId` | 否 | string | 宿主可覆盖；模型值不可信 |
| `locale` | 是 | BCP 47 | 例如 `zh-CN`、`en-US`；不能是空串 |
| `timeZone` | 是 | IANA | 例如 `Europe/Amsterdam`；不能只写 `CET` |
| `currency` | 条件 | ISO 4217 | 出现金额时必需 |
| `units` | 否 | `metric`/`imperial` | 默认由宿主决定，不能静默混用 |
| `slots` | 是 | `AnswerSlots` | 见 §3.3 |
| `actions` | 否 | `ProposedAction[]` | 最多 8 个；模型提议，宿主可拒绝 |
| `provenance` | 条件 | `ProvenanceSummary` | 所有含数据/`comp`/action 的 answer 必需；纯 prose 可省略；模型值只能是 claim |
| `assumptions` | 否 | string[] | 最多 12 条，每条 ≤ 280 字符 |

### 4.2 locale / timeZone / currency / units

- `locale` 作用于 **整个 answer**：prose、block chrome、ARIA label、action envelope、错误文案。
- `timeZone` 用于所有绝对时间与“今天/明天”的边界；不得由 block 各自猜。
- `currency` 只影响金额显示与解析，不改变实际扣款币种；扣款币种由宿主 action 结果给出。
- `units` 只影响显示；原始值 MUST 保留 SI/ISO 单位，避免舍入后再换算。
- 日期/时间 MUST 使用强类型：`instant`（UTC ISO 8601）、`localDate`、`localTime`、`zonedDateTime`、`recurrence`。禁止把本地时间当 UTC 存储。
- 若宿主未提供 locale/timeZone，宿主 MUST 显式填入默认值并标记 `assumed:true`；不能悄悄使用 `en-US`/UTC。

### 4.3 槽位与布局断言

Answer Envelope 让以下断言可测试：

1. `conclusion` 存在，且在首屏可见（首屏高度由宿主声明，600–800 px 只是默认估计）。
2. artifact 型 answer 的 `primaryArtifact` 在首屏可见，且只有一个。
3. 有 action 时 `primaryAction` 在首屏可达；不能被 hover-only 交互替代。
4. `explanation` 与 `provenance` 可从首屏或一次显式展开到达。
5. 窄容器折叠顺序：先解释、再次要字段，**不先收主行动**。

> 这些是布局契约的输入，不是视觉规范。具体像素/断点由 Evaluation Spec 的布局矩阵验证。

### 4.4 provenance 摘要

Answer 级 provenance 是**所有含数据、`comp` 或 action 的 answer 的必需摘要**，不是每个字段的完整副本；纯 prose 回答可以省略。

```ts
type ProvenanceSummary = {
  authority: "claimed" | "attested" | "authoritative";
  source: { id: string; kind: "issuer" | "host" | "user" | "model" | "derived"; url?: string };
  retrievedAt: string;              // ISO instant
  observedAt?: string;
  validFrom?: string;
  validUntil?: string;
  staleAfter?: string;
  verification: Verification;
  assumptions?: string[];
};

type Verification = {
  sourceIdentity: "verified" | "unverified";
  integrity: "verified" | "unverified" | "invalid" | "revoked";
  schema: "valid" | "invalid";
  crossSource: "consistent" | "conflict" | "not_checked";
  verifiedBy?: "host" | "trusted_verifier";
  keyId?: string;
  checkedAt?: string;
};
```

规则：

- 模型只能写 `provenance.authority:"claimed"`；写 `attested`/`authoritative` 是协议违规。
- 宿主 MUST 用自己的 attestation 覆盖 `provenance.authority` 与 `verification`，并保留模型 claim 作为调试信息（不展示为可信）。
- `retrievedAt` 是数据获取时间；`observedAt` 是数据描述的事件时间；两者不能混用。
- `validUntil` 是数据/凭证有效期；`staleAfter` 是新鲜度阈值；两者不能互相替代。
- 高风险字段（金额、价格、凭证、医疗、时间/登机口、外部链接）必须有 field-level provenance；其余继承 answer 级。

### 4.5 验收用例（对应 B4/B7）

| 用例 | 断言 |
|---|---|
| 离线重载后结论仍写旧登机口 | 结论必须与 artifact 的 freshness 一致；不能同时显示“实时 D7”和“最后在线 D2” |
| zh-CN / en-US 切换 | 一次切换 answer 级 locale；prose、chrome、ARIA、action envelope 同步 |
| 缺少 `conclusion` | 拒绝该 answer，或降级为 legacy 并标记不满足契约 |
| 两个 `primaryArtifact` | 拒绝；要求模型选择一个主 artifact |
| `primaryAction` 指向未声明 action | 拒绝；不得渲染可点击的假按钮 |

---

## 5. Action Intent

### 5.1 两种来源

| 来源 | 产生方式 | 信任 |
|---|---|---|
| **block** | 用户点击块内按钮，块发出 `{name,args}` 事件 | 宿主包装为 intent；args 不可信 |
| **model** | `answer.actions[]` 中的提议 | 只是提议；必须匹配 manifest，宿主可拒绝 |

模型 **MUST NOT** 直接执行 action，也 **MUST NOT** 生成 `operationId`/`idempotencyKey`。

### 5.2 形状

```ts
type ProposedAction = {
  id: string;                       // answer 内唯一，例如 "a1"
  name: string;                     // 必须出现在 host manifest
  args?: Record<string, unknown>;
  confirmHint?: string;             // 只用于 UI 文案，不是授权
  riskHint?: "read" | "reversible" | "irreversible"; // 只是提示
};

type ActionIntent = ProposedAction & {
  source: "block" | "model";
  answerId: string;
  blockId?: string;
  createdAt: string;
  operationId?: string;             // 宿主在受理时生成；模型不可写
};
```

### 5.3 规则

1. `name` MUST 匹配 host manifest 的 `actions[].name`；否则在生成/验证阶段拒绝。
2. `args` MUST 通过该 action 的 `argsSchema`；未知字段默认拒绝（不是忽略）。
3. `riskHint` 不参与授权；宿主使用 manifest 的 `risk` 与自身策略。
4. `confirmHint` 不得伪装成系统确认；用户确认由宿主 UI 完成。
5. `operationId` 在 intent 被宿主受理时生成；同一个 intent 的重试复用 `operationId`，但 `idempotencyKey` 按 §9 计算。
6. intent 过期后不得执行；`expiresAt` 是操作请求的有效期，不是凭证有效期。
7. 模型提议的 action 若被拒绝，宿主 MUST 返回可见的拒绝原因，不能静默忽略。

### 5.4 action、operation、idempotency 的区别

| 名称 | 谁生成 | 作用 |
|---|---|---|
| `action.id` | 模型/块 | answer 内定位按钮 |
| `operationId` | 宿主 | 标识一次操作实例，用于状态/审计/对账 |
| `idempotencyKey` | 宿主 | 跨重试去重；同键同参数只执行一次 |
| `auditId` | 宿主 | 审计事件 ID，不等于 operation |

---

## 6. Host Capability Manifest

### 6.1 形状

```ts
type HostCapabilityManifest = {
  schemaVersion: "1.0";
  hostId: string;
  hostVersion?: string;
  locale?: string;
  timeZone?: string;
  capabilities: {
    canNotify: boolean;
    canPersist: boolean;
    canOpenWallet: boolean;
    canVerifyPass: boolean;
    canWriteCalendar: boolean;
    canDeepLink: boolean;
  };
  limits?: {
    maxOps?: number;                // 默认 512
    maxAnswerBytes?: number;        // 默认 1_500_000
    maxPropsBytes?: number;         // 默认 192_000
    maxString?: number;             // 默认 40_000
  };
  actions: ActionDescriptor[];
};

type ActionDescriptor = {
  name: string;
  description: string;
  risk: "read" | "reversible" | "irreversible";
  requiresConfirmation: boolean;
  idempotent: boolean;
  compensation: "none" | "reversible" | "refund" | "manual";
  timeoutMs: number;
  argsSchema?: JsonSchema;
  resultSchema?: JsonSchema;
};
```

### 6.2 同源规则

宿主 MUST 用同一份 manifest 驱动三处：

1. **prompt/tool schema**：只暴露声明的 action；
2. **validator**：未声明 action 在生成阶段拒绝；
3. **UI**：无能力的 action 不显示按钮，或显示为不可用并解释原因。

任何一处单独硬编码能力（例如块内写 `HOST_CAPABILITIES`）都是不符合本 spec 的实现。

### 6.3 协商

- 宿主在会话开始时提供 manifest；模型/适配器 MUST 在生成前读取。
- manifest 变化（权限被撤销、Wallet 不可用）时，宿主 MUST 重新协商或发出 `capabilities_changed` 事件。
- 已渲染的 action 若能力被撤销，MUST 变为不可用并说明原因；不能等到点击时才失败。
- manifest 版本不兼容时，宿主 MUST 拒绝新 action，而不是降级猜测。

### 6.4 示例 action 名称（非规范）

`open_qr`、`refresh_pass`、`open_wallet`、`open_task`、`complete_task`、`snooze_reminder`。名称由宿主定义；本 spec 只要求声明与匹配。

---

## 7. 授权

### 7.1 风险分级

| 风险 | 示例 | 默认策略 |
|---|---|---|
| `read` | 打开二维码、查看详情、刷新只读数据 | 可自动授权；仍需 manifest 声明 |
| `reversible` | 标记完成、改提醒时间、保存草稿 | 需要用户确认或宿主明确策略 |
| `irreversible` | 支付、发送、删除、写入 Wallet | **默认拒绝**；必须单独 open gate |

**P0 边界：** 只允许 `read` 与 `reversible`。`irreversible` 需要 Protocol Spec 全部 12 项 + 安全评审 + 对账/补偿演练 + 审计 + 用户确认，缺一不可。

### 7.2 决策

宿主对每个 intent 产出：

```ts
type AuthorizationDecision =
  | { decision: "allow"; policyVersion: string; expiresAt?: string }
  | { decision: "confirm"; prompt: string; expiresAt: string }
  | { decision: "deny"; code: string; message: string };
```

规则：

- 默认拒绝；只有 manifest 声明 + 策略允许才授权。
- `requiresConfirmation:true` 的 action 不能自动授权。
- 用户确认 MUST 记录 `confirmedBy`、`confirmationMethod`、`confirmedAt`、`scope`、`expiresAt`。
- 模型不能生成确认；`confirmHint` 只是文案。
- 授权后、执行前权限被撤销 → 重新授权或失败，不能继续执行。
- 授权有有效期；过期后必须重新确认。

### 7.3 不可逆 action 的 open gate

以下全部满足才可开放：

1. 12 项 Protocol Spec 通过评审；
2. action 在 manifest 中声明，且有 args/result schema；
3. 用户确认 UI 与权限拒绝 fallback 通过测试；
4. 幂等键、operationId、审计、对账、补偿全部可验证；
5. 安全评审（注入、越权、重放、跨用户）通过；
6. 真实宿主/issuer 的 sandbox 验证；
7. 失败/未知/人工复核有 runbook。

---

## 8. Action State Machine

### 8.1 状态

```text
proposed
  ├─ request_confirmation -> awaiting_confirmation
  │    ├─ confirm -> authorized
  │    ├─ cancel -> cancelled
  │    └─ expire -> expired
  ├─ authorize (auto) -> authorized
  │    ├─ start -> running
  │    ├─ cancel -> cancelled
  │    └─ expire -> expired
  └─ expire -> expired

running
  ├─ succeed -> succeeded
  ├─ fail -> failed
  └─ timeout -> unknown -> reconciling
       ├─ reconcile_success -> succeeded
       ├─ reconcile_failure -> failed
       ├─ reconcile_cancelled -> cancelled
       ├─ reconcile_timeout -> manual_review
       └─ reconcile_manual -> manual_review
```

| 状态 | 终态 | 含义 |
|---|---|---|
| `proposed` | 否 | intent 已产生，尚未请求确认/授权 |
| `awaiting_confirmation` | 否 | 等待用户确认 |
| `authorized` | 否 | 宿主已授权，尚未开始执行 |
| `running` | 否 | 已开始执行 |
| `succeeded` | 是 | 有明确成功结果 |
| `failed` | 是 | 有明确失败结果 |
| `cancelled` | 是 | 用户/宿主在开始前取消，或对账确认未执行 |
| `expired` | 是 | 超过 `expiresAt`，未执行 |
| `unknown` | 否 | 结果不确定，必须对账 |
| `reconciling` | 否 | 正在查询真实结果 |
| `manual_review` | 是 | 自动对账无法解决，转人工 |

### 8.2 合法转移

| 从 | 事件 | 到 | 守卫 |
|---|---|---|---|
| `proposed` | `request_confirmation` | `awaiting_confirmation` | manifest 要求确认 |
| `proposed` | `authorize` | `authorized` | read-only 且策略允许自动授权 |
| `proposed` | `expire` | `expired` | `now >= expiresAt` |
| `awaiting_confirmation` | `confirm` | `authorized` | 确认未过期、scope 匹配 |
| `awaiting_confirmation` | `cancel` | `cancelled` | 用户取消 |
| `awaiting_confirmation` | `expire` | `expired` | `now >= expiresAt` |
| `authorized` | `start` | `running` | 未过期、权限仍有效 |
| `authorized` | `cancel` | `cancelled` | 尚未开始 |
| `authorized` | `expire` | `expired` | 未开始且已过期 |
| `running` | `succeed` | `succeeded` | 有可信 result/receipt |
| `running` | `fail` | `failed` | 有明确失败结果 |
| `running` | `timeout` | `unknown` | 超时/连接中断/结果不可判定 |
| `unknown` | `reconcile_start` | `reconciling` | 进入对账 |
| `reconciling` | `reconcile_success` | `succeeded` | 对账确认成功 |
| `reconciling` | `reconcile_failure` | `failed` | 对账确认失败 |
| `reconciling` | `reconcile_cancelled` | `cancelled` | 对账确认未执行 |
| `reconciling` | `reconcile_manual` | `manual_review` | 无法自动判定 |
| `reconciling` | `reconcile_timeout` | `manual_review` | 对账窗口届满仍未解决 |

规则：

- 终态不得再转移；迟到事件只能写 audit，不改变状态。
- 同步宿主可以原子完成 `authorized -> running -> succeeded`，但 MUST 记录完整状态历史，`startedAt`/`finishedAt` 可以相同。
- 用户在执行中取消：记录 `cancel_requested` 事件，状态仍为 `running`；结果确定为 `succeeded`/`failed`，不能假装 `cancelled`。
- `expiresAt` 只阻止新授权/执行；已经 `running` 的操作不能被过期直接杀死。
- 自动授权与用户确认授权使用**同一 `authorize` 事件**；差异记录在 audit 的 `policy`（`"auto"` | `"user"`）字段，不引入第二个事件名（2026-11-04 反方审阅 F4 修正；原 `auto-authorize` 废弃）。
- 对账窗口届满仍未解决时发射 `reconcile_timeout`，转移至 `manual_review`（2026-11-04 反方审阅 F4 修正；§11 的"窗口内未解决"由此事件落地，可测试）。

### 8.3 事件与顺序

```ts
type ActionEvent = {
  operationId: string;
  stateVersion: number;      // 单调递增
  sequence: number;          // 同一 operation 内单调递增
  at: string;                // ISO instant，宿主时钟
  type: "request_confirmation" | "confirm" | "authorize" | "start"
      | "succeed" | "fail" | "timeout" | "cancel" | "expire"
      | "reconcile_start" | "reconcile_success" | "reconcile_failure"
      | "reconcile_cancelled" | "reconcile_manual" | "reconcile_timeout"
      | "cancel_requested";
  payload?: Record<string, unknown>;
};
```

- 重复事件按 `(operationId, sequence)` 幂等丢弃。
- `stateVersion` 回退或 `sequence` 跳号 → 拒绝并记录 audit；不能静默覆盖。
- 同一 operation 的事件 MUST 串行应用；跨 operation 可并行。
- 状态历史 MUST 可重建；不能只存最后状态。
- `confirm`/`authorize` 事件 MUST 带授权记录；`succeed` MUST 带 result/receipt；`fail` MUST 带 `ActionError`；`timeout` MUST 带 elapsed/reason。

### 8.4 时间字段

- `createdAt` 必填。
- `startedAt` 只在真正执行后填写。
- `finishedAt` 只在终态填写。
- `authorizedAt`/`confirmedAt` 只在对应事件后填写。
- `expiresAt` 是操作请求有效期；凭证有效期是 `validUntil`，两者不能混用。

---

## 9. 幂等

### 9.1 键

```text
idempotencyKey = H(tenantId || userId || actionName || canonicalJson(args))
```

- `H` 由宿主选择（HMAC/哈希均可）；不能由模型提供。
- `canonicalJson`：键排序、无空白、数字规范化、拒绝 NaN/Infinity。
- 作用域 MUST 至少包含 user + tenant；跨用户同参数不能复用。
- 保留期由宿主配置，但必须满足 §9.3。

### 9.2 同键规则

| 情况 | 行为 |
|---|---|
| 同键 + 同参数 | 返回已有 operation/result；不重复执行 |
| 同键 + 不同参数 | 拒绝，错误 `idempotency_conflict`；不能静默复用 |
| 同键 + 已过期 | 仍需防重复执行；可返回 `expired`，不能直接重跑 |
| 跨用户/租户 | 视为不同键 |

### 9.3 硬约束

以 `createdAt` 为起点：

```text
idempotencyRetention >= reconciliationWindow >= max(expiresAt - createdAt, retryWindow)
```

三者不能各自拍脑袋。保留期由宿主配置并写入 manifest/audit。若 `expiresAt` 未设置，使用 `retryWindow` 作为下界。

### 9.4 并发与重试

- 同一键的并发请求 MUST 单飞（single-flight）或由唯一约束去重。
- 重试 MUST 复用同一 `idempotencyKey` 和 `operationId`。
- 不宣称 exactly-once；只承诺 at-least-once + 去重 + 对账。
- 不可逆 action 在 `unknown` 状态下 MUST NOT 直接重试；先对账。

---

## 10. 错误、重试与用户文案

### 10.1 错误形状

```ts
type ActionError = {
  code: ActionErrorCode;
  message: string;          // 面向用户，已本地化
  retryable: boolean;
  terminal: boolean;
  userAction?: "retry" | "reconfirm" | "contact_support" | "none";
  details?: Record<string, unknown>; // 不可信/已脱敏
  cause?: string;
};
```

### 10.2 错误码

| code | 含义 | 可重试 | 典型状态 |
|---|---|---|---|
| `invalid_intent` | intent 结构不合法 | 否 | `failed` |
| `invalid_args` | args 不匹配 schema | 否 | `failed` |
| `unsupported_action` | manifest 未声明 | 否 | `failed` |
| `permission_denied` | 宿主/用户拒绝 | 否 | `failed`/`cancelled` |
| `confirmation_required` | 需要确认 | 是（重新确认） | `awaiting_confirmation` |
| `confirmation_expired` | 确认过期 | 是（重新确认） | `failed` |
| `operation_expired` | 操作请求过期 | 否 | `expired` |
| `idempotency_conflict` | 同键不同参数 | 否 | `failed` |
| `host_unavailable` | 宿主暂时不可用 | 是 | `unknown`/`failed` |
| `external_unavailable` | issuer/外部服务不可用 | 是 | `unknown`/`failed` |
| `timeout` | 执行超时 | 条件 | `unknown` |
| `rate_limited` | 限流 | 是（退避） | `unknown`/`failed` |
| `precondition_failed` | 前置条件不满足 | 否 | `failed` |
| `cancelled_by_user` | 用户取消 | 否 | `cancelled` |
| `reconciliation_failed` | 对账失败 | 否 | `manual_review` |
| `unknown` | 未分类 | 否 | `unknown` |

### 10.3 重试策略

- 只对 `retryable:true` 且未发生副作用/可安全重试的 action 重试。
- 指数退避 + jitter；上限由 manifest `timeoutMs` 与宿主预算决定。
- 重试 MUST 复用 `idempotencyKey`/`operationId`。
- `unknown` 先对账，再决定是否重试。
- 不可逆 action 的自动重试默认禁止。

### 10.4 用户文案

- 错误文案用 answer 级 locale。
- 不说“已取消”除非确认未执行；执行中取消只能说“取消请求已收到，结果待确认”。
- 不把 `unknown` 当失败；显示“结果待确认”与对账入口。

---

## 11. 对账

### 11.1 触发

- `timeout`、连接中断、宿主重启、外部服务返回不确定结果；
- 收到重复/迟到 event 无法判定；
- audit 与 result 不一致。

### 11.2 来源与顺序

1. 宿主 operation ledger；
2. issuer/provider receipt；
3. 用户可见的 action 历史；
4. 人工复核。

### 11.3 结果

```ts
type ReconciliationRecord = {
  startedAt: string;
  finishedAt?: string;
  windowMs: number;
  sources: string[];
  outcome?: "succeeded" | "failed" | "cancelled" | "manual_review";
  evidence?: string[];
  attempts: number;
};
```

规则：

- `unknown` 不是终态；必须进入 `reconciling` 或 `manual_review`。
- 对账窗口 MUST 不小于 `max(expiresAt - createdAt, retryWindow)`，且不超过 `idempotencyRetention`；窗口内未解决 → `manual_review`。
- 对账结果写入 audit；不能修改原始 operation 的历史，只能追加结论。
- 对账失败不能让用户重复点击；UI 必须给出“待确认”状态和人工入口。

---

## 12. 补偿

补偿是**独立记录**，不是状态机状态。

```ts
type CompensationRecord = {
  kind: "none" | "reversible" | "refund" | "manual";
  state: "available" | "running" | "done" | "failed";
  operationId: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  idempotencyKey: string;
  auditId?: string;
  error?: ActionError;
};
```

规则：

- 补偿 MUST 幂等；重复请求返回已有结果。
- 补偿不改变原 operation 的终态；它只追加记录。
- 补偿失败 → `manual_review`；不能静默重试不可逆补偿。
- UI 必须区分“原操作失败”和“补偿完成/失败”。
- `undo` 不是状态；它只是补偿的一种用户入口。

---

## 13. 审计

### 13.1 事件

```ts
type AuditEvent = {
  auditId: string;
  at: string;
  actor: { kind: "user" | "host" | "model" | "system" | "verifier"; id?: string };
  operationId?: string;
  action?: string;
  argsHash?: string;             // 不存原始 PII
  policyVersion?: string;
  decision?: "allow" | "confirm" | "deny";
  stateBefore?: string;
  stateAfter?: string;
  result?: "succeeded" | "failed" | "cancelled" | "unknown";
  errorCode?: string;
  prevHash?: string;
  hash?: string;
};
```

### 13.2 规则

- 审计 append-only；模型/块不能写。
- 建议哈希链：`hash = H(prevHash || canonicalJson(event))`；至少能发现篡改。
- `argsHash` 而不是原始 args；PII 最小化。
- 保留期由宿主策略决定；登出/删除请求必须能删除或匿名化。
- 审计可视化不是调试日志；用户可查看“谁在何时基于什么权限做了什么”。

---

## 14. Provenance

### 14.1 三级

| 级别 | 必需性 | 内容 |
|---|---|---|
| answer | 所有含数据、`comp` 或 action 的 answer 必需；纯 prose 可省略 | source、retrievedAt、verification、assumptions |
| block | 可选 | block 级 source/时间；不能掩盖 field 冲突 |
| field | 高风险字段必需 | fieldPath、observedAt、validFrom/Until、staleAfter、confidence |

高风险字段：金额、价格、凭证、医疗、时间/登机口、外部链接。

### 14.2 记录

```ts
type ProvenanceRecord = {
  fieldPath: string;             // "" 表示 answer 级
  producer: "model" | "host" | "trusted_verifier" | "derived";
  authority: "claimed" | "attested" | "authoritative";
  source: { id: string; kind: string; url?: string };
  retrievedAt: string;
  observedAt?: string;
  validFrom?: string;
  validUntil?: string;
  staleAfter?: string;
  verification?: Verification;
  confidence?: {
    kind: "source" | "model" | "calibrated";
    value?: number;
    method?: string;
    dataset?: string;
    calibratedAt?: string;
  };
};
```

### 14.3 信任分离

- `producer:"model"` MUST 是 `authority:"claimed"`。
- `authority:"attested"` 只能由 host/trusted_verifier 写入。
- 模型提供的 `integrity:"verified"` 出现在 UI 前必须被宿主 attestation 覆盖；没有 attestation → `unverified`。
- 不同凭证的 attestation MUST 按 credentialId 匹配；不能把上一张凭证的状态借给新凭证。

### 14.4 预算

- answer 级必填；field 级只在高风险字段必填；其余继承。
- provenance MUST NOT 阻塞第一个 `comp`；若必须前置，单独计量 TTFT/首块延迟。
- 评估把 provenance token 数与延迟作为独立指标（见 Evaluation Spec）。
- 不能以“1.5 MB 没超”代替 token/延迟预算。

### 14.5 新鲜度

```text
freshness =
  expired   if now >= validUntil
  stale     if staleAfter && now >= staleAfter
  unknown   if lastCheckedAt missing or verification unavailable
  live      otherwise
```

`freshness` 不等于 `integrity`；两者是正交轴（见 §15）。

---

## 15. Credential / Pass Profile（travel 选中时启用）

### 15.1 payload

```ts
type PassPayload = {
  credentialId: string;
  issuer: { id: string; name: string; keyId?: string };
  holder?: { name?: string; seat?: string; group?: string };
  document: {
    type: "boarding_pass" | "train_ticket" | "event_ticket";
    carrier: string;
    flight?: string;
    origin: string;
    destination: string;
    localDeparture: string;        // local time + zone
    localBoarding?: string;
    gate?: string;
    terminal?: string;
    seat?: string;
    bookingRef?: string;
  };
  qr: { format: "iui-pass-v1" | "pdf417" | "aztec"; payload: string };
  validFrom: string;
  validUntil: string;
  revocation: { status: "not_revoked" | "revoked" | "unknown"; checkedAt?: string; ref?: string };
  signature: { alg: string; keyId: string; value: string };
};
```

### 15.2 双轴状态

| 轴 | 取值 | 谁决定 |
|---|---|---|
| `integrity` | `verified` / `unverified` / `invalid` / `revoked` | 宿主或 trusted verifier |
| `freshness` | `live` / `stale` / `expired` / `unknown` | 宿主时钟 + 上次成功校验 + 网络 |

可出示判定：

```ts
type Presentability = {
  canShowCode: boolean;
  level: "ok" | "warning" | "danger";
  reasons: string[];
};

presentability(integrity, freshness, validUntil, now):
  if integrity in {invalid, revoked} -> danger, canShowCode=false
  if freshness == expired or now >= validUntil -> danger, canShowCode=false
  if integrity == unverified -> warning, canShowCode=true
  if freshness in {stale, unknown} -> warning, canShowCode=true
  else -> ok
```

| 组合 | 可出示 | UI |
|---|---|---|
| `verified` + `live` | 是 | 正常主行动 |
| `verified` + `stale` | 是 | 显示“保存副本”、上次校验时间、登机口冲突 |
| `verified` + `unknown` | 是 | 显示“无法实时校验”；不得写“已验证” |
| `unverified` + `live`/`stale`/`unknown` | 是 | 显示“签发方未验证”；不得显示 Verified 徽章 |
| `invalid`/`revoked` + 任意 | 否 | 主行动禁用；说明原因 |
| 任意 + `expired`/`validUntil` 已过 | 否 | 主行动禁用；提示重新获取 |

补充规则：

- `revocation.status=revoked` MUST 映射为 `integrity=revoked`；`unknown` MUST NOT 被当作 `verified`。
- `signature` MUST 由宿主或 trusted verifier 校验；模型提供的签名/状态只是 claim。
- `integrity=verified` 必须同时有 issuer/keyId/credentialId 的可验证证据；缺一不可。

### 15.3 快照

```ts
type PassSnapshot = {
  schemaVersion: "1.0";
  credentialId: string;
  payload: PassPayload;
  snapshotAt: string;
  lastCheckedAt?: string;
  validUntil: string;
  staleAfter: string;
  seal: {
    /** 权威层：issuer 对 payload 的签名。公钥可公开嵌入；同源脚本无 issuer 私钥，无法伪造重签。 */
    credential: { alg: "issuer-signature"; keyId: string; value: string };
    /** 尽力层：宿主对元数据（snapshotAt/lastCheckedAt/validUntil/staleAfter）的 MAC。可选。 */
    metadata?: { alg: "host-hmac-sha256"; keyId: string; value: string };
  };
};
```

规则：

- **双层 seal（2026-11-04 反方审阅 F3 修正）：** 凭证本体的完整性由 `credential`（issuer 签名）判定；宿主元数据的完整性由 `metadata`（HMAC）尽力保护。`credential` 缺失或校验失败的快照不能进入 `verified`。
- **issuer 私钥 MUST 不进前端**：测试 issuer 也必须作为独立进程/端点运行（实验的 fixture 即此形态），否则 `credential` 层退化为装饰。
- **HMAC 密钥 MUST 不可从同源 JS 提取**：WebCrypto non-extractable `CryptoKey`（存 IndexedDB）或宿主后端密封；明文常量/可提取密钥不允许。
- **已知边界（写入威胁模型，不得粉饰）：** 同源脚本执行权 = 宿主已妥协。客户端无法防御能调用密封 API 的同源代码对**元数据**重签；**凭证本体**仍受 issuer 签名保护。缓解：宿主 CSP、依赖审计、可选服务端密封。
- 读取时 MUST 先验证 seal；篡改 → `integrity=invalid` 或 `unknown`，不能继续显示 `verified`。
- `snapshotAt`、`lastCheckedAt`、`validUntil`、`staleAfter` 必填。
- 登出、撤销、TTL 到期 MUST 删除快照。
- 离线可显示 ≠ 离线仍有效；主行动文案必须反映 `freshness`。

### 15.4 QR 与安全

- QR payload MUST 是最小必要信息；不得包含完整姓名/预订号，除非 issuer 规范要求。
- 放大二维码 MUST 有可见按钮，不能 hover-only。
- 二维码只证明“可被标准解码器读出”，不证明闸机可扫；真机测试是发布门禁。
- 外部链接 MUST 域名白名单/签名；不得把 QR 内容当指令。
- 恶意二维码/钓鱼链接进入注入测试集。

---

## 16. Storage / State Profile（day plan 选中时启用）

### 16.1 适配器

```ts
type StorageAdapter = {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, opts?: { ttlMs?: number }): Promise<void>;
  remove(key: string): Promise<void>;
  list?(prefix: string): Promise<string[]>;
};
```

### 16.2 状态归属

| 归属 | 示例 | 冲突规则 |
|---|---|---|
| `user` | 勾选完成、改提醒时间 | 优先；模型 `set` 不能覆盖，除非用户确认 |
| `model` | 推荐顺序、建议文案 | 可被用户/派生覆盖 |
| `derived` | 根据日期计算的“今天” | 重新计算；不持久化为用户意图 |

规则：

- 每个持久字段 MUST 标记归属。
- 用户状态优先；冲突时显示可见提示，不静默覆盖。
- `set` 不得 remount 无自定义 setter 的块；需要局部更新时块必须提供 setter。
- 版本号/`updatedAt` 用于检测过期写入；跨设备冲突必须可见。

### 16.3 PII 生命周期

- TTL：每个持久键必须有 TTL 或明确的“直到用户删除”。
- 登出：清除用户数据与快照；不能留在共享设备。
- 删除：用户可删除单条/全部；删除必须传播到缓存/快照。
- 加密：至少宿主侧加密或安全存储；不能把凭证明文放 `localStorage`。
- 脱敏：日志/audit 不写原始凭证/金额/姓名。

### 16.4 离线队列

- 离线修改进入队列；队列项有 `idempotencyKey` 与 `createdAt`。
- 重连后按顺序合并；冲突按 user > model > derived；失败可见。
- 队列项过期/撤销后不得执行。

---

## 17. 验证规则（规范性）

| # | 规则 | 错误码 |
|---|---|---|
| V1 | `answer` 最多一次且在第一项 | `invalid_answer` |
| V2 | `schemaVersion` 受支持 | `unsupported_version` |
| V3 | `conclusion` 存在且可解析 | `missing_conclusion` |
| V4 | `primaryArtifact` 最多一个且指向 comp | `invalid_primary_artifact` |
| V5 | `primaryAction` 指向已声明 action | `unknown_action` |
| V6 | action name 在 manifest 中 | `unsupported_action` |
| V7 | args 通过 schema，未知字段拒绝 | `invalid_args` |
| V8 | 模型不得写 `operationId`/`idempotencyKey`/`authorizedAt`/`auditId` | `untrusted_field` |
| V9 | 模型 `provenance.authority` 只能是 `claimed` | `untrusted_verification` |
| V10 | locale/timeZone/currency 合法 | `invalid_locale` |
| V11 | 高风险字段有 field-level provenance | `missing_provenance` |
| V12 | 现有 op/字节/字符串上限 | `limit_exceeded` |
| V13 | pass profile 必填字段完整 | `invalid_pass` |
| V14 | 快照 seal 验证通过 | `invalid_snapshot` |
| V15 | 不可逆 action 未开放时拒绝 | `action_not_open` |
| V16 | answer 内 id 唯一 | `duplicate_id` |
| V17 | `actions` ≤ 8；`assumptions` ≤ 12 | `limit_exceeded` |

验证失败时：

- 能安全降级的内容继续渲染；不能安全渲染的整块丢弃。
- MUST 产生可见的 issue（至少开发模式/宿主日志），不能只 `console.warn`。
- 不得把 validation issue 当成用户错误；用户看到的是“这项内容无法显示/需要重试”。

---

## 18. Conformance 测试矩阵

| # | 用例 | 期望 | 覆盖 |
|---|---|---|---|
| C1 | 合法 answer：结论 + 一个 artifact + 一个 action | 通过；槽位可解析 | Answer Envelope |
| C2 | 缺 `conclusion` | 拒绝/legacy 标记 | B4 |
| C3 | 两个 `primaryArtifact` | 拒绝 | Answer Envelope |
| C4 | 模型写 `provenance.authority:"attested"` | 剥离/拒绝；不得显示 Verified | B1 |
| C5 | 跨凭证复用 attestation | credentialId 不匹配 → unverified | B1 |
| C6 | 模型写 `operationId`/`idempotencyKey` | 拒绝 | Action |
| C7 | 未声明 action | 生成/验证阶段拒绝 | B5 |
| C8 | 需要确认的 action | 进入 `awaiting_confirmation`；未确认不执行 | 授权 |
| C9 | 重复点击/重复请求 | 只执行一次；返回已有结果 | 幂等 |
| C10 | 同键不同参数 | `idempotency_conflict`；不执行 | 幂等 |
| C11 | 执行超时 | `unknown` → `reconciling`；不盲目重试 | 对账 |
| C12 | 执行中取消 | 记录 `cancel_requested`；不假装 cancelled | 状态机 |
| C13 | 授权后权限撤销 | 重新授权或失败 | 授权 |
| C14 | 乱序/重复 event | 拒绝/幂等丢弃；状态回退被阻止 | 状态机 |
| C15 | 补偿失败 | `manual_review`；不静默重试 | 补偿 |
| C16 | 篡改快照 | `integrity=invalid`/`unknown`；不显示 verified | B3 |
| C17 | 离线重载 D7，在线已 D2 | `verified`+`stale`；显示冲突；二维码可出示带警告 | B2 |
| C18 | 撤销凭证 | 主行动禁用；说明原因 | Pass |
| C19 | 离线 prose 仍写 D7 | 结论与 artifact 新鲜度一致 | B4 |
| C20 | zh-CN / en-US 切换 | chrome/ARIA/action envelope 同步 | B7 |
| C21 | 320/720 px | 无页面/卡片横向溢出；主行动 ≥44 px | 布局 |
| C22 | 恶意 URL/QR/注入 | 拦截；不执行指令 | S |
| C23 | 跨用户同参数 | 不共享 operation/幂等结果 | S |
| C24 | 审计链篡改 | 可发现；审计 append-only | Audit |
| C25 | 同源脚本重签快照元数据（HMAC 层失效） | 凭证本体的 issuer 签名校验不受影响；issuer 签名无效时仍不得显示 `verified` | F3 / §15.3 |

**退出标准：** C1–C24 全部通过；状态机/异常用例有自动化；未通过前不开放副作用 action。

---

## 19. 版本与迁移

- `schemaVersion` 与 capability manifest 版本独立。
- minor 升级 additive；旧字段不删除、不改语义。
- major 升级需要新 op/新字段名，并提供迁移说明。
- 宿主 MUST 在会话开始时记录 manifest/schema 版本；失败时拒绝新 action。
- legacy answer 不能静默升级为 conformant；必须标记。
- 0.2.x 内只允许 additive envelope；否则 beachhead 无法在现有版本线交付。

---

## 20. 未决问题（附 2026-11-03 建议答案，待用户确认）

| # | 问题 | 建议答案 | 理由 |
|---|---|---|---|
| 1 | `answer` op 是否作为唯一载体，还是 tool-call 顶层 envelope 也需要同样的结构？ | **两者同构**：tool-call 顶层 envelope 复用同一 schema，validator 双入口共用 | bench 已有 fence/tool 双模式；两套结构会分裂校验与测试 |
| 2 | `p`/`md`/`table` 的 `id` 是否进入 IUI-1 正式线格式？ | **进入**，additive 可选字段 | answer envelope 的槽位引用需要稳定 id；旧流无 id = 不参与槽位断言，向后兼容 |
| 3 | 确认 UI 由宿主提供还是 SDK 提供最小实现？ | **SDK 提供最小实现**（无样式依赖，宿主可覆盖） | 对应实验卡点 B5——否则每个宿主重做确认交互 |
| 4 | capability manifest 是否需要签名/attestation？ | **首期不签名** | manifest 由宿主本地注入、非模型产物、不跨信任边界；远端分发出现后再引入 attestation |
| 5 | 模型提议 action 与 block 产生 action 的优先级/冲突规则？ | **block 侧优先**（用户直接操作是更强意图）；同 `operationId` 幂等去重；并发冲突记 audit 并以 block 侧结果为准。**意图归并（把模型 action 与 block action 对齐到同一 operationId）由宿主负责**，协议只要求 audit 记录归并决策 | 与 user-priority 状态策略一致；归并是宿主语义，协议无法替宿主判断"这两次点击是不是同一件事" |
| 6 | 对账窗口、幂等保留期、重试预算的具体默认值？ | `expiresAt` ≤ 10 分钟（refresh/verify 类）；**对账窗口 1 小时；幂等保留期 24 小时；重试预算 2 次、`retryWindow` = 1 小时**（`failed(retryable=true)` 后 1 小时内发起），仅对账确认无副作用后 | 满足 §9 时距不等式：幂等保留期（24h）≥ 对账窗口（1h）+ retryWindow（1h）≥ 操作时效（≤10min） |
| 7 | pass 快照的 seal 用宿主 HMAC 还是 issuer 签名 + 本地 MAC？ | **双层：issuer 签名（权威，保护凭证本体）+ 宿主 HMAC（尽力，保护元数据，密钥 non-extractable 或服务端密封）**；测试 issuer 私钥不进前端 | 2026-11-04 反方审阅 F3 修正：纯 HMAC 防不住同源脚本重签；issuer 签名防得住（无私钥不可伪造）。详见 §15.3 |
| 8 | day plan 的存储后端与跨设备同步是否在首期范围内？ | **否** | day plan 未选中；即使作为回退启用，首期也只做单设备存储 |

---

## 附录 A：类型定义（规范性草图）

```ts
type JsonObject = Record<string, unknown>;

type AnswerOp = {
  t: "answer";
  schemaVersion: "1.0";
  answerId?: string;
  locale: string;
  timeZone: string;
  currency?: string;
  units?: "metric" | "imperial";
  slots: AnswerSlots;
  actions?: ProposedAction[];
  provenance?: ProvenanceSummary;
  assumptions?: string[];
};

type ProposedAction = {
  id: string;
  name: string;
  args?: JsonObject;
  confirmHint?: string;
  riskHint?: "read" | "reversible" | "irreversible";
};

type ActionState = {
  operationId: string;
  idempotencyKey: string;
  answerId?: string;
  intentId: string;          // ActionIntent.id
  action: string;
  argsHash: string;
  state:
    | "proposed" | "awaiting_confirmation" | "authorized" | "running"
    | "succeeded" | "failed" | "cancelled" | "expired"
    | "unknown" | "reconciling" | "manual_review";
  stateVersion: number;
  sequence: number;
  createdAt: string;
  updatedAt: string;
  authorizedAt?: string;
  confirmedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  expiresAt?: string;
  authorization?: AuthorizationDecision;
  error?: ActionError;
  receipt?: { url?: string; payload?: JsonObject };
  compensation?: CompensationRecord;
  reconciliation?: ReconciliationRecord;
};
```

## 附录 B：最小 answer 示例

```json
{"t":"answer","schemaVersion":"1.0","locale":"zh-CN","timeZone":"Europe/Amsterdam","currency":"EUR","units":"metric","slots":{"conclusion":{"kind":"op","id":"conclusion"},"primaryArtifact":{"kind":"comp","id":"c1"},"primaryAction":{"kind":"action","id":"a1"},"explanation":[{"kind":"op","id":"why"}],"provenance":[{"kind":"op","id":"src"}]},"actions":[{"id":"a1","name":"open_qr","args":{},"confirmHint":"出示二维码","riskHint":"read"}],"provenance":{"authority":"claimed","source":{"id":"issuer:MR","kind":"issuer"},"retrievedAt":"2026-11-03T17:40:00Z","verification":{"sourceIdentity":"unverified","integrity":"unverified","schema":"valid","crossSource":"not_checked"}},"assumptions":["登机口以最后在线校验为准"]}
{"t":"p","lvl":0,"id":"conclusion"}
{"t":"md","v":"MR 284 于 19:35 从 AMS 起飞，登机口 D2。"}
{"t":"comp","id":"c1","type":"pass","props":{…}}
{"t":"p","lvl":0,"id":"why"}
{"t":"md","v":"步行到登机口约 10 分钟，建议 18:50 前到达。"}
{"t":"p","lvl":0,"id":"src"}
{"t":"md","v":"来源：issuer fixture；最后在线校验 18:05。"}
{"t":"ask","v":["出示二维码","刷新状态"]}
{"t":"done"}
```

## 附录 C：变更记录

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-11-03 | 0.1-draft | 首版草案；12 项协议契约、pass/storage profile、conformance 矩阵 |
| 2026-11-04 | 0.2-draft | 反方审阅处置（用户授权决策人签署）：F4——统一 `authorize` 事件（废弃 `auto-authorize`）、新增 `reconcile_timeout` 事件与转移；F3——快照 seal 改双层（issuer 签名权威 + 宿主 HMAC 尽力、密钥 non-extractable、同源妥协边界入威胁模型）；§20-5 补宿主意图归并职责、§20-6 补 `retryWindow=1h`；新增 C25；P0 子集 Travel 列激活 |

## 附录 D：与计划/实验的对应

- 计划 §6.3：Protocol Spec 12 项 → 本文 §4–§16。
- 计划 §6.3.1：状态机 → 本文 §8。
- 计划 §6.3.2：provenance 两级预算 → 本文 §14。
- 计划 §6.3.3：协议测试 → 本文 §18。
- 计划 §6.3.4：双轴 → 本文 §15。
- 实验 B1–B7 → 本文 §18 的 C4–C20。
