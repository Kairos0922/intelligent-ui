# Intelligent UI Domain Artifact Spec: Travel Pass

| 项目 | 内容 |
|---|---|
| 版本 | 0.1-draft（2026-11-04） |
| 状态 | **未批准实施细节，已批准范围**（计划 §7.6.1，2026-11-04 受托决策）。本文是阶段 1b 与阶段 2 的实现依据；阶段 1a（beachhead 无关契约）不依赖本文 |
| 上游 | `INTELLIGENT-UI-PLAN.md` §6.4/§7.6.1；`specs/PROTOCOL-SPEC.md` §15（pass profile）、§8（状态机）、§14（provenance）；`experiments/pass-spike/`（字段与判定函数的原型） |
| 从属关系 | 与计划冲突时以计划为准；与 Protocol Spec 冲突时以 Protocol Spec 为准 |
| 语言 | 中文工作稿（check:docs 豁免）；英译随 Protocol Spec 在阶段 1 退出前完成 |

---

## 0. 摘要

本文定义 travel/pass artifact 的字段、校验、状态、行动、降级、证据、UI、无障碍与安全边界。核心设计继承实验验证过的三个决定：

1. **双轴状态**：`integrity`（verified/unverified/invalid/revoked）× `freshness`（live/stale/expired/unknown）正交，可出示性是两轴的函数——单轴枚举无法表达"签名有效但登机口已变更"。
2. **信任只走宿主侧**：块只读宿主持有的 attestation，永不信任模型 props 里的同名信任字段（实验 B1 的第一版错误即源于此）。
3. **结论与 artifact 新鲜度绑定**：结论层（conclusion 槽位）不得携带独立于 artifact 的时效性断言（实验 B4/F1：离线时结论仍写 D7）。

## 1. 范围与非目标

**在范围内**：boarding-pass 形态的凭证展示、出示（QR）、刷新、验证、离线快照、撤销语义、Wallet 深链 handoff。

**不在范围内**：SDK 签发凭证；SDK 写入 Wallet；改签/值机等写操作；多段行程编排（`itinerary` 是后续块）；真实机场闸机可扫性（只承诺标准解码器可读 + 真机测试计划）。

**首期 action 边界（§7.6.1）**：只读 + 可逆。允许：`show_code`、`refresh`、`request_verification`、`open_issuer_link`（受 capability manifest 约束）。禁止：发送、支付、删除、写日历。

## 2. 数据模型

### 2.1 PassPayload（规范性）

```ts
type PassPayload = {
  kind: "boarding-pass";                      // 首期唯一形态；扩展点
  credentialId: string;                       // issuer 域内唯一；attestation 归属键
  issuer: { id: string; name: string; keyId: string; algorithm: string };
  holder: { name: string };                   // PII：脱敏规则见 §11
  bookingRef: string;
  cabin: string;
  flight: string;                             // 如 "MR 284"；格式校验见 §3
  route: { from: { code: string; city: string }; to: { code: string; city: string } };
  departAt: string; arriveAt: string; boardingAt: string;   // RFC 3339 instant
  departTimeZone: string; arriveTimeZone: string;           // IANA 名称；显示层换算用
  terminal?: string; gate?: string; seat: string; boardingGroup?: string;
  qr: { format: "qr"; payload: string };      // payload 见 §10
  validFrom: string; validUntil: string;      // 凭证有效期（instant）
};
```

字段与实验 `pass-model.ts` 一致（该模型经 41/41 检查验证）；差异：本规范把信任与新鲜度移出 payload（见 2.2），payload 本身是** issuer 签名覆盖的对象**。

### 2.2 Attestation（宿主持有，非模型产物）

```ts
type Attestation = {
  credentialId: string;                       // 必须与 payload.credentialId 匹配；不匹配 → unverified（实验 B1 第二版教训）
  integrity: "verified" | "unverified" | "invalid" | "revoked";
  observedAt: string;                         // 事实观测时间（登机口数据的时间基点）
  checkedAt: string;                          // 宿主校验时间
  validUntil: string; staleAfter: string;
  source: { id: string; kind: string; url?: string };
  snapshotAt?: string;                        // 来自离线快照时必填
};
```

**规则**：模型输出中出现任何同名信任字段（`integrity`/`verified`/`attestation`）时，validator 剥离或拒绝（C4/C5）；块渲染只消费宿主 store。

### 2.3 快照

沿用 `PROTOCOL-SPEC.md` §15.3 的双层 seal（issuer 签名权威 + 宿主 HMAC 尽力）。**测试 issuer 的私钥必须独立于页面进程**——实验的本地 feed 即此形态，产品化时同样如此。

## 3. 校验规则

| 字段 | 规则 | 失败处理 |
|---|---|---|
| `credentialId` | 非空；与 attestation/seal 匹配 | integrity → unverified |
| `flight` | `^[A-Z0-9]{2} ?[0-9]{1,4}$`（航司码 + 号） | 丢弃 op，记 validation issue |
| `route.from/to.code` | IATA 机场码 `^[A-Z]{3}$` | 同上 |
| `departAt/arriveAt/boardingAt` | RFC 3339；`boardingAt ≤ departAt < arriveAt` | 同上 |
| `departTimeZone/arriveTimeZone` | IANA 时区名（如 `Europe/Lisbon`） | 同上 |
| `seat` | `^[0-9]{1,3}[A-Z]$`（首期单座位） | 同上 |
| `validUntil` | `validFrom < validUntil` | 同上 |
| `qr.payload` | 非空；长度 ≤ 2048；域名（若为 URL）过白名单 | 拒绝渲染 QR（§10） |

校验失败不静默降级为"普通卡片"——要么修复、要么丢弃并回退纯文本，记入 validation 事件。

## 4. 状态与可出示性

双轴定义与判定函数以 `PROTOCOL-SPEC.md` §15.2 为准。pass 特有的判定表：

| integrity | freshness | 可出示 | 级别 | UI 主线 |
|---|---|---|---|---|
| verified | live | ✅ | ok | 正常展示 |
| verified | stale | ✅ + 警示 | warning | "登机口可能已变更（上次校验 …）"；主行动可用但文案带条件 |
| verified | unknown | ✅ + 警示 | warning | "无法确认最新状态" |
| verified | expired | ❌ | danger | "凭证已过期"；QR 禁用 |
| unverified | 任意 | ✅ + 标注 | warning* | "未验证：仅按模型/缓存呈现"；*unverified+expired → danger |
| invalid / revoked | 任意 | ❌ | danger | "签名无效 / 已撤销"；QR 禁用 |

**规则**：`verified` 一词只能由宿主 attestation 产生；任何 UI 元素不得把模型声明渲染为信任徽标（实验 08-model-claimed 用例）。

## 5. 生命周期

```text
签发（issuer）→ 宿主获取 + 验签 → 展示（live）
  → 定期/按需刷新（refresh action）
  → 断网：读快照（stale/unknown 语义）
  → 恢复：对账（重验签 + 拉最新 feed）
  → 终态：expired（时间到）/ revoked（issuer 撤销）/ 登出删除
```

- **TTL**：快照默认 24h 或 `validUntil`，取早者；到期不删除则降为 unknown。
- **登出 MUST 删除快照**（含 QR payload 与 holder 脱敏前数据）。
- **grace period**：`validUntil` 后保留展示 30 分钟（航班晚点场景），但状态为 expired、QR 禁用——**离线可显示 ≠ 离线仍有效**。
- **撤销**：attestation 请求发现 revoked 后，快照同样进入 revoked；QR 立即禁用（实验 07 用例）。

## 6. 行动

| action | 类型 | 授权 | 幂等 | 说明 |
|---|---|---|---|---|
| `show_code` | 本地 | 无需（纯 UI） | — | 打开 QR 覆盖层；可见按钮非 hover-only；ESC/返回焦点 |
| `refresh` | 可逆 | auto（只读策略） | operationId + 参数哈希 | 重拉 feed + 重验签；unknown → 对账，不盲目重试 |
| `request_verification` | 只读 | auto | 同上 | 显式触发一次完整性校验 |
| `open_issuer_link` | 只读跳转 | auto；域名白名单 | — | 仅当 capability manifest 声明 |

所有 action 走 Protocol Spec §5–§13 的 intent/state/audit 全链；`confirmHint` 不作授权。

## 7. 降级矩阵

| 条件 | 结论层 | artifact | 主行动 |
|---|---|---|---|
| 在线 + live | 完整结论 | 正常 | 可用 |
| 离线 + 快照存在 | **从快照重生成或移除时效断言**（B4 教训：不得继续写"Gate D7"当事实） | stale/unknown 标注 + 上次校验时间 | 可用（带警示文案） |
| 离线 + 无快照 | "无法离线出示" | 不渲染 pass，回退文本 | 禁用 |
| revoked / invalid | 明示撤销/无效 | danger 样式 | QR 禁用 |
| issuer 不可达（refresh 失败） | 保留上次结论 + "刷新失败（…原因）" | 不变 | 重试（retryable 语义） |

## 8. Provenance（两级预算内）

- **answer 级**：issuer feed 来源、`retrievedAt`。
- **field 级（高风险必填）**：`gate`、`boardingAt`、`seat`、`validUntil`、`credentialId`——各一条（observedAt + source）。
- 其余字段继承 answer 级；不突破 Protocol Spec §14 的预算。

## 9. UI 与布局

- 槽位：pass 是 `primaryArtifact`；结论层 + 一个主行动（`show_code`）+ 解释层（步行时间/时区类"so what"由模型生成，标 `producer: model`）。
- 首屏必须出现：结论、登机口/时间/座位关键值、主行动（存在实际行动的任务）。
- 窄容器（320px）折叠顺序：先解释层、再次要字段；**主行动最后收起**，可转底部 sticky。
- 状态不只靠颜色：warning/danger 有文字标签（实验 04/07 用例）。
- 二维码覆盖层：原生 dialog、焦点陷阱、ESC 返回焦点、quiet zone ≥ 4 模块、屏幕亮度提示。

## 10. QR 与敏感信息

- QR payload：优先 **签名凭证的紧凑序列化**（issuer 定义），不嵌入明文 PII；若为 URL，域名过白名单（防钓鱼注入）。
- 渲染保证 quiet zone 与对比度；`prefers-reduced-motion` 关闭过渡。
- **真机测试计划（阶段 2）**：≥2 部手机 × 3 档亮度 × ≥2 款扫码 App；记录通过率进证据包。闸机可扫性不在承诺内。

## 11. 隐私

- 快照含 holder 姓名/bookingRef（PII）：TTL 24h、登出删除、不进 SDK 日志；错误上报脱敏（去掉 payload，只留 credentialId 前缀 + issue）。
- 日志最小化：audit 事件记录 operationId 与结果，不记录凭证内容。

## 12. Wallet handoff 边界

SDK 只渲染"添加到 Wallet"入口并做深链 handoff（capability manifest 声明时）；签发、设备注册、签名 JWT、更新推送全部由 issuer/宿主与钱包平台完成。**SDK 不写入 Wallet**（§10 不做清单）。

## 13. Issuer 集成

### 13.1 测试 issuer（阶段 1b–2 使用）

- 独立进程/端点；Ed25519 签名；私钥不进前端（§2.3）。
- feed 含实验已有的三个场景数据：正常、登机口变更（D7→D2）、撤销——直接复用 `experiments/pass-spike/src/issuer.ts` 的 fixture 形态。
- 提供可编程延迟与超时端点（测 refresh 的 unknown → 对账路径）。

### 13.2 真实 issuer 门槛（阶段 1a 末，§6.7）

外联对象至少覆盖：Google Wallet 测试发行通道、Apple Wallet 试用 pass、一家可提供测试凭证的航空公司/票务平台。**通过标准与切换规则见计划 §7.6.1 放弃条件①。**

## 14. DSH 适配

- action 通道：`ui/message`（prompt 形态）为主；tool 形态待 DSH toolview 支持情况在阶段 1b 实测后固化。
- 容器宽度按 DSH 实测（当前假设 320–456px），用 container queries。
- 快照存储：DSH 环境的可用存储 API 在阶段 1b 探测后写入附录。

## 15. Conformance 用例（本文新增；编号接续 C 矩阵）

| # | 用例 | 期望 | 覆盖 |
|---|---|---|---|
| C26 | 离线 + 快照，结论层含"Gate D7" | 结论不得呈现为当前事实；标 stale 或移除 | B4/F1 |
| C27 | attestation.credentialId ≠ payload.credentialId | integrity=unverified；不显示 Verified | B1 |
| C28 | revoked feed 响应 | QR 禁用 + danger；快照同步 revoked | 实验 07 |
| C29 | refresh 超时 | unknown → 对账；不自动重试 | 状态机 |
| C30 | 登出 | 快照与 QR 缓存删除；再登录无残留 | §11 |
| C31 | `flight`/`seat`/机场码格式非法 | op 丢弃 + validation 事件；不静默降级 | §3 |
| C32 | QR payload 域名不在白名单 | 拒绝渲染 QR | §10 |

---

## 附录 A：变更记录

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-11-04 | 0.1-draft | 首版：字段沿用实验模型、双轴判定、行动/降级/隐私边界、测试 issuer 规范、C26–C32 |

## 附录 B：与计划/实验的对应

- 计划 §6.4"Domain Artifact Spec 的范围"逐项落点：凭证标准与 issuer 集成（§13）、签名/keyId/凭证 ID/有效期/撤销/刷新/grace（§2/§5）、离线快照与状态（§2.3/§4/§7）、QR 保护（§10）、Wallet 边界（§12）、真机测试（§10）。
- 实验 B1→§2.2/§11；B2→§4；B3→§2.3（双层 seal）；B4→§7/C26；B5→§6；B6→§5；B7→（answer envelope，Protocol Spec §4）。
