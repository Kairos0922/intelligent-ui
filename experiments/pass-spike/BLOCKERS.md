# P0-1 反证实验：卡点、证据与判决

> 实验代码：`experiments/pass-spike/`
> 预登记规则：`DECISION-RULE.md`（写码前创建）
> 自动验证：`node verify.mjs`，41/41 通过；原始结果 `evidence/verify.json`
> 结论：**契约层判决 B —— “契约是瓶颈”成立**；**宿主/商业层仍为 C**（本机最小宿主，非生产宿主）。做 artifact 本身不贵；贵的是信任、行动与状态契约。

## 1. 实验做了什么

| 项 | 内容 |
|---|---|
| 集成方式 | 只用公开 `registerBlock` + `registerBlockSpec`，**未改 core / protocol / validator / adapter** |
| Artifact | 登机牌：航司、航班、AMS→LIS、当地时间、登机口、座位、分组、乘客、预订号、真实 QR |
| 数据 | 半真实 issuer fixture：正常 D7、登机口变更 D2、未验证、撤销、签名无效 |
| 三条路径 | ① 打开：结论 + pass + 解释；② 出示：真实 QR 被 jsQR 解码；③ 离线再打开：断网/重载后从宿主快照恢复 |
| 额外路径 | 本地快照篡改、模型伪造 `verified`、撤销、zh-CN、320/720 px |
| 验证 | Playwright + 真实 QR 解码；41 项断言；10 张截图；`evidence/verify.json` |
| 主机 | 本机最小宿主页面，不是生产宿主；这是本实验最大的外部效度限制 |

## 2. 三条必需路径的结果

| 路径 | 结果 | 证据 |
|---|---|---|
| 打开 | 通过：结论 + 主 artifact + 一个主行动；400/456 px 正常，320 px 无页面/卡片横向溢出 | `evidence/01-online.png`、`10-320px.png` |
| 出示 | 通过：真实 QR（37×37 modules）被标准解码器读出，内容与 payload 一致；原生 `<dialog>` 模态、可关闭、焦点返回 | `evidence/02-qr.png`、`05-offline-qr.png` |
| 离线再打开 | 通过：强制离线 + 重载后从 `localStorage` 快照恢复；显示 `Verified` + `Saved copy` + 登机口冲突（缓存 D7 / 最后在线 D2） | `evidence/04-offline-stale.png` |

**重要：三条路径都跑通了。** 这本身支持“自定义块可以做 artifact”的判断，但不支持“因此不需要契约”。

## 3. 卡点清单

判定“卡点”的标准：必须写宿主侧代码、必须重复定义语义，或无法在不改协议的情况下可靠消除。行数是实验代码的近似值，包含演示用胶水，不代表最小实现。

| # | 卡点 | 层 | 实验中的表现 | 变通 | 必须改协议？ | 对应计划 |
|---|---|---|---|---|---|---|
| B1 | **模型 props 无法绑定可信验证者** | 协议 / 证据 | 模型写 `integrity:"verified", producer:"issuer"` 时，第一版直接显示 Verified；加宿主 attestation 后又把上一张凭证的状态借给了伪造凭证，必须显式比对 `credentialId` | 宿主侧 attestation store + 凭证 ID 匹配（~50 行） | **是**：需要把“模型数据”与“宿主验证结果”分开，或引入证据信封 | §6.3 P0-2；§8.2 P0-2/P0-4 |
| B2 | **凭证状态没有双轴 schema** | 协议 / 块契约 | `integrity × freshness` 由块自己发明；最危险的“签名有效 + 未撤销 + 已过期未验 + 登机口已变”没有单一枚举位置 | `evaluate()` + `freshnessFor()` + 状态条（~120 行） | **是**：标准枚举 + 可出示判定函数 | §8.2 P0-3 |
| B3 | **离线快照没有完整性保护** | 存储 / 证据 | 直接改 `localStorage` 的 gate D7→D9，仍显示 `Verified` + `Saved copy`；块无法发现 | 无可行变通；只能联网重验 | **是**：快照需签名/宿主密封摘要 + TTL/登出删除 | §6.3 P0-4；§5.7 F |
| B4 | **没有 answer-level 槽位，prose 与 artifact 会互相矛盾** | 协议 / answer envelope | 离线重载后结论仍写 “Gate D7”，同一答案里 pass 又显示最后在线 D2；结论是独立 `md` op，无法绑定 freshness | 宿主手写结论/解释；状态变化时需重写 prose | **是**：Answer Envelope（`conclusion` / `primary artifact` / `primary action` / `explanation` / `provenance`） | §8.2 P0-2 |
| B5 | **行动没有 result / 状态 / 幂等 / 能力清单** | 协议 / adapter | Wallet/Refresh 只是 `ctx.emit`；宿主用模块级状态 + DOM 事件重绘；重复点击靠宿主自己的 guard；默认 adapter policy 会丢掉 `wallet`/`refresh`；block 硬编码 `HOST_CAPABILITIES` | `walletState` + `main.ts` handlers + 自定义事件（~70 行） | **是**：Action State Machine + result + idempotency + capability manifest | §6.3 P0-1/P0-4；§8.2 P0-4 |
| B6 | **持久化没有契约** | 协议 / 存储 | 快照是宿主自定义 `localStorage` schema；无 storage adapter、无 user/model/derived、无跨设备、无冲突策略；`latestKnown` 只能另开一个 key | 自定义 `Snapshot` + 启动 hydrate（~90 行） | **是**：storage 契约 + 状态归属 + TTL/清除 | §6.3 P0-3；§5.7 B |
| B7 | **answer-level locale 缺失** | 协议 / answer envelope | locale 只能塞进 block props；块内维护 en/zh 两套字符串；结论要写两遍；SDK chrome/action envelope 仍是英文 | `STRINGS` + `localizedVerdict` + 手写 `Intl`（~80 行） | **是**：answer 级 `locale/timeZone/currency/units` | §6.3 P1-1；§8.2 P0-2 |

**次级 gap（不计入 7 个主卡点）：**

- 自定义 `set` 是必需的，否则 `set` 会 remount，关闭 QR dialog、丢焦点（~20 行；现有文档已说明，属于 papercut）。
- QR 本身不是协议问题：`qrcode-generator` + jsQR 即可；但**凭证签名/撤销/刷新**仍需宿主与 issuer，SDK 目前不提供。
- 时间/时区：宿主传 IANA zone + `Intl` 即可；内置块仍有 `en-US`/UTC 硬编码（计划 §5.7 E），本实验绕开了，但没有修。
- 无障碍：原生 dialog、44px 按钮、文本状态均通过手工检查；**不是** WCAG 审计。

## 4. 对抗性结果

| 场景 | 结果 | 说明 |
|---|---|---|
| 登机口在线变更 D7→D2 | 在线 pass 正确更新；快照仍是 D7 | 证明“离线可显示 ≠ 离线仍有效” |
| 离线重载 | 显示 `Verified` + `Saved copy` + 冲突提示；二维码仍可出示 | 双轴状态可以表达该场景，但语义是块自己定义的 |
| 篡改快照 D7→D9 | 仍显示 `Verified` + `Saved copy` | **B3**：无完整性保护 |
| 撤销 | integrity=Revoked，主行动禁用，verdict “Do not present” | 正确 |
| 模型伪造 `verified` | 宿主无 attestation → `Issuer not verified`，模型声明只作为调试文本 | **B1**：只有宿主侧 store 阻止了假徽章 |
| zh-CN | 结论、状态、按钮、QR 警告均本地化 | **B7**：全部由块/宿主手写 |

## 5. 判决（分层）

按 `DECISION-RULE.md`，先记录一个规则冲突：C 条件把“实验环境不是真实宿主”列为证据不足。本实验用的是本机最小宿主，不是生产宿主，因此**严格按规则不能给出完整的 B**。把判决拆成两层：

**契约层（B 条件）**

- 三条路径全部跑通 ✅
- 卡点总数 = **7**（≥3）❌（A 的必要条件之一不满足）
- 卡点覆盖 **provenance/trust、state、action、answer envelope、i18n** 五类；其中至少两类落在 action / state / provenance ✅

→ **契约层判决 B：“契约是瓶颈”成立。**

**宿主/商业层（C 条件）**

- 实验环境不是生产宿主（本机最小页面）→ 触发 C
- issuer 是 fixture，签名是占位符 → 触发 C
- 没有真实用户/开发者/宿主访谈 → 触发 C

→ **宿主/商业层判决 C：证据不足，不能据此选 beachhead，也不能宣称产品结论。**

全文的“判决 B”均指**契约层 B**；补做真实宿主实验后，宿主/商业层才能从 C 升级。

补充说明（重要）：

1. **Artifact 本身不贵。** 一个可用的登机牌块 + QR + 响应式样式约 450–600 行；三条路径在一个工作会话内跑通。计划里“3 天”的估计偏保守，但方向是对的。
2. **贵的是 artifact 之外的东西。** 为了让“已验证/已撤销/离线/可出示”可信，宿主必须补 ~200 行信任、快照、行动结果与 i18n 胶水；换一个宿主还要重写。**这正是契约该吸收的部分。**
3. **实验没有证明商业前提。** 它没有真实 issuer、真实宿主、真实用户；不能回答“谁愿意接 issuer/数据/责任”。它只证明：**只补样例不补契约，会把同样的胶水复制到每个宿主。**
4. **B1/B3 是安全级，不是体验级。** 如果首期选 travel，必须先解决“可信验证结果”和“离线快照完整性”，否则“离线可出示”会变成“离线可伪造”。

## 6. 对计划的直接影响

| 计划项 | 实验证据 | 建议修订 |
|---|---|---|
| §6.3 Protocol Spec 10 项 | B4/B7 说明缺 answer envelope；B5 说明缺 capability manifest | 扩为 **12 项**，增加 Answer Envelope 与 Host Capability Manifest |
| §6.3 P0-4 凭证/离线 | B2/B3 | 状态改 **双轴**；快照加签名/密封摘要与 TTL；可出示判定写成函数 |
| §6.3 P0-2 证据信封 | B1 | 明确“模型数据”与“宿主验证结果”分离；provenance 分两级预算 |
| §6.7 DoD | 本实验无法测 L4 采用率 | 拆 **Beachhead DoD / Production DoD** |
| §8.3.8 工期 | 三条路径 <1 个工作会话，但 7 个卡点 | 契约工作按 1–2 人团队重估；artifact 周数下调，信任/集成周数上调 |
| §7.1 Bill 排除理由 | 实验未涉及支付 | 改为“数据获取（银行/账单/OCR）”，不是“支付风险” |

## 7. 复现

```bash
# 1. build the core package once (the experiment consumes clone/dist-lib)
npm ci
npm run build:core

# 2. install and verify the experiment
cd experiments/pass-spike
npm install
npm run build
node verify.mjs
```

输出：`evidence/verify.json`、`evidence/*.png`、控制台 41/41。要求本机有 Chrome（脚本先试 `channel: "chrome"`，失败回退 Playwright Chromium）。

## 8. 限制

- **不是真实宿主**：没有 DSH/生产聊天壳的容器、权限、身份、遥测；容器宽度只测了 320/456/720。
- **不是真实 issuer**：签名是占位符；撤销/刷新是本地 fixture；QR 只证明“可被标准解码器读出”，不证明机场闸机可扫。
- **不是用户研究**：没有目标用户、任务观察、可用性测试。
- **不是无障碍/安全审计**：只做了原生 dialog、44px、320 px 溢出和对比度 eyeball check。
- **不是人类 3 天**：实验由一个 AI agent 在一个工作会话内完成；工时不能直接换算成人天。
- **未验证商业前提**：没有宿主/开发者/用户访谈，不能据此选 beachhead。
