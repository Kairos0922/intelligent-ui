# Stage 1b 实施计划与结果：Travel Pass 垂直切片

| 项目 | 内容 |
|---|---|
| 状态 | **垂直切片已实现（2026-11-13；C26/C29/C30/C32 follow-up 验证 2026-11-17）** |
| 分支 | `fix/stage-1b-conformance-followup`（基于合并后的 main `a03e29d`） |
| 依据 | `INTELLIGENT-UI-PLAN.md` §6.4、§6.7、§7.6.1；`specs/DOMAIN-ARTIFACT-SPEC.md`；`specs/PROTOCOL-SPEC.md` §15–§17 |
| 范围 | pass profile、QR、宿主 attestation、Ed25519 校验、密封快照、测试 issuer、DSH 只读动作 |
| 明确不做 | 真实航司/Wallet 集成、签发真实凭证、机场闸机实测、支付/删除/日历写入 |

> 2026-11-17 follow-up：实现 C26 conclusion freshness 标记、C29 ActionRuntime 对账、C30 会话销毁清理、C32 URL QR/issuer link 白名单。所有结论仍限于自建测试 issuer；C30 的 hosted sign-out smoke 与真实 issuer 仍未验证。

---

## 1. Issuer 门槛记录（必须先读）

### 1.1 事实

- 当前**没有真实 issuer**，也没有可对外使用的真实登机牌凭证。
- 阶段 1a 结束时，外联没有产出可验证的真实 issuer 路径。
- 计划 §7.6.1 的 issuer 门槛因此**没有通过**。

### 1.2 用户指令与解释

2026-11-13，用户在看到“真实 issuer 仍是阻塞”后指示：“那现在就解决这个事情啊”。本记录把该指令解释为：**授权以自建测试 issuer 继续 Stage 1b，同时把真实 issuer 保留为 Stage 2 门槛**。这是对 §7.6.1 门槛的**显式偏离**，不是门槛已满足。

该解释若不符合用户意图，正确动作是停止 travel 实现并切回 day plan；本记录保留这一回退。

### 1.3 本切片允许声称的内容

- 可以用**自建测试 issuer**验证签名、状态、快照、撤销和刷新路径。
- 可以声称宿主能验证测试 issuer 的 Ed25519 签名。
- 可以声称 DSH 的 pass 动作是只读的、可逆的或本地的。

### 1.4 本切片不允许声称的内容

- 不能声称已接入真实航司、Google Wallet、Apple Wallet 或任何真实签发方。
- 不能把测试 issuer 的 `verified` 当作真实世界凭证有效性。
- 不能声称机场闸机可扫、生产密钥管理已完成或撤销分发已上线。
- 不能声称 npm 已发布。发布仍暂停。

---

## 2. 交付物

| # | 工作包 | 交付 | 主要文件 |
|---|---|---|---|
| B1 | Pass 数据模型 | payload 校验、双轴状态、可出示性、快照形状校验 | `clone/src/iui/pass.ts` |
| B2 | Pass 块与 QR | 真实 QR 渲染、状态徽章、stale/revoked/invalid 警示、QR dialog | `clone/src/iui/components/pass.ts`、`clone/src/styles/components.css` |
| B3 | 宿主接线 | `PassHost` 进入 `Ctx` 与 SDK options；块只读宿主持有状态 | `clone/src/iui/registry.ts`、`clone/src/sdk/index.ts`、`clone/src/sdk/catalog.ts` |
| B4 | 校验 | `pass` comp 的 payload 校验；非法 op 丢弃并上报 issue | `clone/src/sdk/validate.ts` |
| B5 | 加密与快照 | Ed25519 签名验证、issuer 签名 seal、宿主 HMAC metadata seal、24h TTL | `clone/src/iui/pass.ts`、`packages/dsh/src/pass.ts` |
| B6 | DSH 宿主 | IndexedDB 快照、issuer feed 拉取、刷新/撤销/无效签名处理、单例 pass host | `packages/dsh/src/pass.ts`、`packages/dsh/src/client.tsx` |
| B7 | DSH 动作 | `canVerifyPass: true`；`show_code`、`refresh`、`request_verification`、`open_issuer_link`；`save_note` 仍确认 | `packages/dsh/src/manifest.ts` |
| B8 | 测试 issuer | 独立进程 Ed25519 私钥、`/config`、`/pass`、`/scenario`、`/health` | `tools/test-issuer/server.mjs` |
| B9 | 测试 | Node 签名/HMAC/验证器/DSH host；浏览器 pass host；SDK pass 块 | `tests/pass.test.mjs`、`tests/pass-host.spec.ts`、`clone/src/sdk-selftest.ts` |

---

## 3. 关键行为

### 3.1 信任边界

- 模型只提供 `credentialId` 和展示字段；模型提供的 `integrity`、`freshness`、`attestation` 不被块读取。
- 宿主向 issuer 拉取 payload、签名和 feed 状态，先验证 `credentialId` 匹配，再验证 Ed25519 签名。
- 签名失败 → `invalid`；feed 声明撤销 → `revoked`；无 issuer 或网络失败 → `unverified` 或快照。
- 快照读取顺序：形状校验 → 宿主 HMAC 校验 → issuer 签名校验 → 才允许 `verified`。

### 3.2 双轴展示

| integrity | freshness | QR | UI |
|---|---|---|---|
| `verified` | `live` | 可出示 | 正常徽章 |
| `verified` | `stale` | 可出示 | “显示保存的快照”警示 + 上次校验时间 |
| `verified` | `unknown` | 可出示 | “当前状态未知”警示，不写“已验证” |
| `unverified` | 任意 | 可出示（离线且无快照时回退文本） | “未验证”警示，不得显示 Verified |
| `invalid` / `revoked` | 任意 | 禁用 | danger 样式，说明原因 |
| 任意 | `expired` | 禁用 | 过期提示 |

离线且没有密封快照时，块不渲染凭证字段，只显示回退文本并禁用 QR（Domain Spec §7）。在线但 issuer 不可达时仍按 `unverified` 展示，并明确标注未验证。当前块只实现 `qr` / `iui-pass-v1` 的 QR 渲染；`pdf417` / `aztec` 可展示字段但禁用代码按钮并提示宿主不支持，不能把其他码制误画成 QR。

pass 块通过 `ctx.reportArtifactFreshness()` 把宿主 attestation 的 `integrity` / `freshness` 报到 compiler。若该 artifact 为 stale、unknown、unverified、invalid 或 revoked，宿主在 conclusion 槽位前插入可见警示并写入 `data-iui-freshness`，不把模型结论当成当前事实；pass 恢复 live 后警示自动移除。该机制只读宿主状态，不重写模型 prose。

### 3.3 DSH 动作

- `show_code`：本地打开 QR dialog；invalid/revoked/expired 时不可用；`unverified` 仍可出示并标注警告；离线且无密封快照时回退文本。URL QR payload 必须命中宿主 `allowedOrigins`；opaque `IUI1:` payload 不需要域名检查。未配置白名单时 URL QR 默认拒绝。
- `refresh`：经 `ActionRuntime` 的 intent/authorize/start 链重新拉取 issuer 并验证；超时进入 `unknown`，随后 `beginReconciliation()`，以“issuer timeout + 是否保留密封快照”为证据对账失败；不会自动重试。用户再次点击才是新 operation。
- `request_verification`：同 refresh，语义为请求重新验证。
- `open_issuer_link`：只接受 `https://`，且 origin 必须命中同一份宿主 allowlist；不写 Wallet。
- `save_note`：保持 Stage 1a 的 reversible + confirmation 行为。
- 没有 `open_wallet`、`add_to_wallet`、通知或日历写入。

---

## 4. 测试 issuer 说明

`tools/test-issuer/server.mjs` 是独立 Node 进程，启动时生成 Ed25519 密钥对。私钥只留在进程内；页面只拿到 SPKI 公钥和签名 feed。

```sh
npm run issuer:test
# 或
node tools/test-issuer/server.mjs --port 4319 --scenario normal
```

浏览器侧在 DSH 客户端加载前设置：

```js
window.__IUI_PASS_ISSUER__ = {
  url: "http://127.0.0.1:4319",
  // Only needed for URL QR payloads/issuer links. https-only exact origins;
  // an https issuer URL adds its own origin automatically.
  allowedOrigins: ["https://issuer.example"],
};
```

场景：`normal`、`gate-change`（D7 → D2）、`revoked`、`invalid`（坏签名）、`slow`（超时回退）。运行时可通过 `/scenario?value=...` 切换。

---

## 5. 验证记录

> 下表在最终全量验证后填写；任何未跑的检查必须写明“未跑”，不得写成通过。

| 检查 | 结果 |
|---|---|
| `npm run build` | 通过（六包） |
| `npm run typecheck` | 通过（六包） |
| `node --test tests/*.test.mjs` | 77/77 通过（新增 allowlist、clear 竞态、验证中途清理、ActionRuntime 对账） |
| `npm run selftest` | 30/30 通过（含 C26 结论标 stale、C32 URL QR 域名拒绝、C30 cleared UI） |
| `npx playwright test tests/pass-host.spec.ts` | 1/1 通过（真实 IndexedDB + 测试 issuer；含 slow 超时回退、clear 后存储为空） |
| `npm run test:e2e` | 3/3 通过（SDK 自测、pass host、MCP App） |
| `npm run check:docs` | 通过（22 个 Markdown 文件） |
| `npm run audit:content` | 通过（190 个文件） |
| `npm run bench:selfcheck` | 25/25 通过（mock） |
| `npm run pack:all` / `audit:pack` / `check:release` | 通过（6 个 tarball） |
| 真实 issuer 验证 | **未做，且当前无真实 issuer** |
| 真实 Wallet 写入 | **未做（DSH `canOpenWallet: false`）** |
| 机场闸机扫描 | **未做** |
| DSH hosted DeepSeek pass smoke | **未做**；现有 DSH hosted smoke 只覆盖 Stage 1a 的 table/tabs/save_note |

---

## 6. Conformance 映射与缺口

| 用例 | 当前覆盖 | 结论 |
|---|---|---|
| C26 离线快照 | pass 块标 stale；compiler 在 conclusion 槽位前插入宿主警示并写 `data-iui-freshness`；live 后移除 | 通过（宿主标记，不改写模型 prose） |
| C27 credentialId 不匹配 | feed payload 与请求 id 不匹配 → invalid；attestation 按 id 过滤 | 通过 |
| C28 revoked feed | 快照写入 `integrity=revoked` 并由 HMAC 覆盖；QR 禁用 | 通过（测试 issuer） |
| C29 refresh 超时 | 经 `ActionRuntime` 执行；超时 → unknown → reconciliation，证据含 timeout/快照；不自动重试 | 通过（单元 + 浏览器 host） |
| C30 登出 | `PassHost.clear()` 立即失效内存与 epoch，删除 IndexedDB 快照/HMAC key，并等待在途任务后二次清理；DSH `session/disposed` 和插件卸载触发 | **部分通过**（实现与本地测试完成；hosted session-disposed/sign-out smoke 未做） |
| C31 格式非法 | validator 丢弃 op，返回 `invalid_pass` issue | 通过 |
| C32 QR 域名白名单 | 宿主 `allowedOrigins`（https exact origin）校验 URL QR 和 `open_issuer_link`；opaque `IUI1:` 放行；无白名单拒绝 URL | 通过 |

---

## 7. 已知限制

- 没有真实 issuer；测试 issuer 只证明协议与实现，不证明产品价值。
- C26 采用宿主警示标记 conclusion，不重写模型 prose；“Gate D7” 文本仍会显示，但被明确标为可能基于保存快照，不能当作当前事实。
- 快照 TTL 为 24h；到期后当前实现降为 `unknown` 并保留记录，不自动删除。登出/会话销毁会调用 `clear()`。
- DSH 当前 profile 没有独立 sign-out service；C30 绑定到 `session/disposed` 和插件卸载。若宿主新增真正的登出事件，必须改为绑定该事件并补 hosted smoke。
- HMAC key 存 IndexedDB，non-extractable；同源脚本执行权仍等于宿主妥协，无法防御能调用密封 API 的同源代码对 metadata 重签。issuer 签名仍保护 payload。
- DSH issuer URL 与 `allowedOrigins` 是宿主配置；未配置时 pass 保持 `unverified`，URL QR/issuer link 默认拒绝，不会伪造 Verified。
- 测试 issuer 的 `invalid` 场景只覆盖坏签名，不覆盖 key rotation、过期密钥、吊销列表分发。
- DSH pass 动作没有 hosted DeepSeek 的第二轮真实模型验证；当前证据是 Node host 测试 + 浏览器 host 测试 + SDK 块测试。
- npm 发布仍暂停；没有发布任何包。

---

## 8. 回退

若真实 issuer 在 Stage 2 门槛仍不可得，按计划 §7.6.1 回退到 day plan。Stage 1b 的宿主信任、快照、双轴状态和动作代码可复用到其他 artifact；测试 issuer 不应作为产品数据源。
