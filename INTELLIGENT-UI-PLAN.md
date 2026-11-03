# Intelligent UI 方案（单一事实源）

| 项目 | 内容 |
|---|---|
| 版本 | 2026-11-03 汇总版 + P0-1 实验修订 + spec 草案 |
| 状态 | **方案已批准（2026-11-04，受托决策：用户授权"所有决策你来做"，原则"正确的方法做正确的事情"；用户保留推翻权）**。Beachhead：**travel/pass @ DSH，有条件**——阶段 1a 无关契约 + issuer 主动门槛（1a 末检查，未过即切 day plan，沉没成本仅 1a）+ 1b travel 专属。反方审阅 4 项发现已全部处置（§7.6.1）。开源约束已纳入（§11）。**下一步：阶段 1a 实现**；npm 发布准备并行（§11） |
| 代码基线 | `dcd1cc6`（`v0.2.2-3-gdcd1cc6`，2026-10-29） |
| 实验证据 | `experiments/pass-spike/`（41/41 自动检查；结论见附录 G） |
| 规范草案 | `specs/PROTOCOL-SPEC.md`、`specs/EVALUATION-SPEC.md`（0.1-draft，未批准） |
| 本文替代 | `ANALYSIS-2026-10-29.md`、`REVIEW-2026-10-29.md`、`INTEGRATED-REPORT-2026-10-30.md`、`NEXT-PHASE-PLAN-2026-11-01.md`、`BEACHHEAD-DECISION-2026-11-01.md`、`REVIEW-2026-11-02-PLAN-CRITIQUE.md` |
| 审阅沿革 | 三轮审阅（第一轮 AI 子代理，第二、三轮外部意见）+ 第四轮代码级复核 + 第五轮整合复核与 P0-1 实验，见附录 F |
| 性质 | 产品与工程分析 + 方案。不是用户研究，不是人类专家审计，不是第三方审计，不是"已验证"的产品结论 |

> **标注约定：** `[已确认]` 有代码或文档证据；`[推断]` 由设计/代码推断；`[未验证]` 需实验或访谈；`[待决]` 等你裁决。

---

## 0. 怎么用这份文档

- **唯一决策事实源。** 此前六份文档已删除（移入废纸篓），内容全部并入本文，不再引用旧文件名。后续**决策性**修订直接改本文，并在附录 F 记录变更。
- **受控规范附件。** `specs/PROTOCOL-SPEC.md` 与 `specs/EVALUATION-SPEC.md` 是本文第 6 章的展开草案；本文与附件冲突时以本文为准。附件变更必须回写本文的决策、状态与链接，不能反向覆盖本文。
- **两条阅读路径：**
  - 只想看"要不要开工" → 第 1 章 + 第 8 章。
  - 要写规范 → 第 5 章（缺口）+ 第 6 章（基线方案）+ `specs/PROTOCOL-SPEC.md` + `specs/EVALUATION-SPEC.md` + 第 7 章（beachhead）+ 第 8 章（批评与处理状态）。
- **第 6 章是基线，已并入 §8.5 第 2–6 项的修订；第 8 章保留第四轮的原始批评并标注处理状态。** 两者不要混读：第 8 章的批评仍然有效，但其中 5 项已在第 6 章改写，P0-1 已由附录 G 的实验回答；剩余待决项是 beachhead 本身（第 7、9 章）。

---

## 1. 结论

### 1.1 一句话

> 视频教我们"把一件事做成一个物件"，网站教我们"把物件做成可验证的函数"，而当前 SDK 需要补的是"让这个物件有记忆、能行动、可离线、说清楚数据从哪来"。

### 1.2 三个分析对象各自的价值

| 对象 | 表面价值 | 真正可借鉴的 |
|---|---|---|
| 登机牌视频（16.0 s，2746×2160，60 fps） | "登机牌做得像" | 把一次个人任务压缩成**结论 → 主 artifact → 主行动 → 个人后果解释**的四层结构 |
| calculus-of-interfaces 网站 | "把 UI 编译成数学" | 把布局当**可分析对象**：纯函数、断点枚举、不变量验证、设备分布期望、差分驱动动效、公开假设 |
| 当前 SDK v0.2.2 | "30 个块" | 协议/验证/宿主适配扎实；缺语义 artifact、行动闭环、持久状态、证据、离线、i18n |

### 1.3 核心判断 `[已确认]`

**能"讲清楚"，但不能"办成"。**

- 宽度够，深度不够；展示够，闭环不够。
- 11 个生活域中，展示层覆盖较好，但**没有任何一个域在五个能力维度（展示/本地交互/持久化/外部行动/结果确认）上完整**；跨域能力"主动/通知"为 0。
- 这不是"块不够多"，是**语义层与行动层缺失**：协议里没有 action、没有结果、没有持久状态、没有 answer 级 locale。

### 1.4 现在能不能开工 `[待决]`

**不能进入产品开发。** 第三轮审阅的结论是"有条件通过，暂不建议直接进入正式开发"；第四轮复核进一步指出 6 个会导致返工的问题（第 8 章）。2026-11-02 的 P0-1 反证实验（附录 G）已完成：三条必需路径全部跑通，但记录到 **7 个卡点**，集中在**信任/证据、状态、行动、answer envelope 与 i18n**。**契约层判决 B（契约是瓶颈）；宿主/商业层仍为 C（未验证）**——实验用的是本机最小宿主，不是生产宿主。

因此结论要分两层：

- **"只补样例 + 数据接入"不成立**：每个宿主都要重写同样的 attestation、快照、行动结果和 locale 胶水，且离线快照可被篡改。
- **"先补 4 个契约 + 3 份 spec"也要收缩**：artifact 本身不贵（一个可用登机牌块约 450–600 行，一个工作会话跑通），贵的是信任、行动与状态契约。阶段 1 只应补**选中 beachhead 必需**的契约，不是把 12 项一次做完。

当前只允许做规范修订、证据采集与 beachhead 决策；**未获批准前不实施产品代码**。

---

## 2. 证据基础

### 2.1 方法

| 对象 | 方法 |
|---|---|
| 视频 | `ffprobe` 元数据；2 fps 抽帧（32 帧）逐帧检查；关键帧视觉与交互分析 |
| 网站 | Playwright/Chromium 抓 11 个 tab 的文本与截图；1440/1100/768/390 px 检查布局；阅读源码与 bundle |
| 仓库 | 阅读 `README/SDK/ROADMAP/bench`、`catalog.ts`、`protocol.ts`、`validate.ts`、组件源码与测试；统计块类型；30 块宽度测试 |
| 基准 | 统计 25 个任务类别；阅读评分逻辑 |
| 审阅 | 第一轮：三位 AI 子代理（架构/产品/UIUX）；第二、三轮：外部专业意见；第四轮：代码级逐条复核；第五轮：整合复核 |

### 2.2 证据等级

- **A** 直接观察或代码事实。例："30 个块"、"日历固定 UTC"。
- **B** 由设计/代码推断。例："视频的 Sending/Sent 可能是客户端状态机，也可能是服务端事件"。
- **C** 假设，需验证。例："个人生活用户更需持久任务"。

### 2.3 这份方案没有做的事

- 没有视频源码/服务端，无法验证二维码可扫、数据真实、延迟与失败率。
- 没有跑真实模型基准（仓库无 provider 凭据）。
- 没有用户实验、可用性测试、无障碍审计、真机矩阵。
- 30 块宽度测试只用合成短内容，不代表长文本/本地化/200% 文本缩放/400% reflow/RTL。
- 网站的性能数字、设备份额均为页面自报，未独立复现。

### 2.4 可复现性

**当前不足，且部分已不可逆。** 关键帧、网站截图、宽度测试输出位于本地临时目录或被 gitignore；第一轮代理的原始提示词与输出未保存。

2026-11-02 整理时，网站抓取工作目录 `recon/`（569 MB）与第三方仓库克隆 `rea/`（76 MB）已删除（移入废纸篓）。因此：

- 网站章节的截图与实测数据**已无法复现**；如需引用，必须重新抓取并提交；
- 视频原文件仍在仓库根目录，关键帧需重新抽取；
- 若要对外发布或交给研发，应补齐：关键帧与时间戳、浏览器版本与访问日期、测试脚本与完整输出、模型版本与真实执行记录（见附录 D）。

**证据包应按 `evidence/{video, website, sdk, benchmark, reviews}/` 组织**，并为每条证据标注两个维度：**观察置信度**（当前证据支持结论的程度）与**可复现性**（第三方能否在相同条件下重得结果）。高置信但不可复现的证据仍须标注"不可复现"，不能只给 A/B/C 等级。

**P0-1 实验是第一个按此标准整理的证据包：** `experiments/pass-spike/` 包含预登记判决规则、可执行代码、41 项自动检查、10 张截图和 `evidence/verify.json`；复现命令与限制写在同目录 README。它仍不是真实宿主/issuer/用户证据（见附录 G）。

**这条约束反过来影响方案：** 如果第 8 章的反证实验要做，证据必须**当场提交**，不能只留在本地临时目录——这正是第二轮审阅提出的问题，至今未解决。

---

## 3. 视频分析：一个"个人任务答案表面"的完整样例

### 3.1 时间线（2 fps，误差 ±0.5 s）

| 时间 | 画面 | 观察 |
|---|---|---|
| 0.0–1.0 s | 仅用户气泡："Can you pull up my boarding pass for tonight?" | 聊天列宽约 460–500 px；约 1 s 无反馈，无 skeleton |
| 1.0–2.0 s | 助手 prose 流式出现："You're checked in for **MR 284 to Lisbon**, and it's on time. Boarding starts at 18:05 at Gate D7:" | 先给结论 |
| 2.0–2.5 s | prose 收尾，卡片顶部出现 | 文本与卡片短暂重叠 |
| 2.5–5.0 s | 卡片渐入：品牌/航班号 → 航线/时间 → 登机信息 → 二维码/座位图 | 分阶段显现 |
| 5.0–7.5 s | 完整卡片 + 解释段（座位视野、到登机口 10 分钟、里斯本慢 1 小时） | 数据之后的"so what" |
| 7.5–8.5 s | 鼠标移到二维码缩略图，二维码放大，卡面淡出 | 卡片内覆盖层，不是 3D 翻转 |
| 8.5–10.5 s | 二维码居中 + `Done` + 放大镜；右侧座位图仍可见 | 主任务是"给安检扫" |
| 10.5–13.0 s | 回到卡片 → `Send to iPhone` → `Sending...` | 单一主行动 + 进行中状态 |
| 13.0–16.0 s | `✓ Sent to iPhone` + "In Wallet now, and on your Lock Screen..." | 成功确认 + 结果解释；无补偿/撤销 |

### 3.2 四层结构

| 层 | 内容 | 可借鉴点 |
|---|---|---|
| 结论层 | "已值机、航班、准点、18:05 D7 登机" | 先用一句话回答"我现在要做什么" |
| 主 artifact | 登机牌：航司/航班/日期/机型、AMS→LIS、时间、登机口、座位、分组、乘客、预订号、舱位、二维码、座位图 | 领域物件比通用 card 更省认知成本 |
| 行动层 | `Send to iPhone` | 事务型任务一个主行动；随设备切换 |
| 解释层 | 座位视野、步行时间、时区 | 把数据转成个人决策 |

卡片内部按**决策时间顺序**组织：航线代码最大 → 时间 → 登机口/座位/分组 → 核对信息最小 → 二维码是行动入口、不抢主视觉 → 座位图是空间解释。

### 3.3 交互状态机

| 状态 | 触发 | 视觉 | 缺失 |
|---|---|---|---|
| 默认 | 回答完成 | 卡片 + 黑色主按钮 | — |
| 二维码放大 | 悬停/聚焦/点击（抽帧无法区分） | 卡面切换、二维码居中、`Done` | 触屏无可见 `Show code`；无 ESC/焦点陷阱证据 |
| 发送中 | 点击 | `Sending...`、按钮禁用 | 无失败/超时/重试 |
| 已发送 | 演示完成 | `✓ Sent` + Wallet 解释 | 无撤销、无重复发送防护 |
| 悬停 | 鼠标移入 | 轻微反馈 | 触屏无 hover，需按下态 |

### 3.4 六个设计教训

1. 先给结论，再给物件。
2. 一个主 artifact，不是多个同级卡片（比较/规划型可并列，但要有视觉主角）。
3. 一个主行动，但随设备与场景变化（桌面 Send，手机 Show code / Add to Wallet）。
4. 行动要有状态：进行中、成功、结果解释；失败与补偿也应补上。
5. 数据要落到个人后果。
6. 物理隐喻（登机牌、票根、虚线、二维码）降低学习成本。

### 3.5 证明了什么、没证明什么

**证明：** 个人任务可组织成"主 artifact + 主行动 + 解释"；领域物件优于通用 card；本地微交互与可见行动状态显著提升"这是真事"的感觉；"so what"解释是助手区别于搜索的关键。

**没证明：** 端到端系统（身份、数据源、值机状态、二维码生成、Wallet、失败处理、离线、权限、审计）；Sending/Sent 的实现机制；二维码可扫与刷新；移动端布局；加载/错误/空状态；i18n；无障碍；性能。

---

## 4. 网站分析：把布局当作可分析对象

### 4.1 命题与边界

命题：`<ProjectsPage {...props} />` 被编译成纯函数 `UI = f(props)`，于是可求导、求界、找断点、积分、软化。

**实际边界：** 页面是**手写**的直线操作序列（约 2,608 个操作）；同一组操作有四种求值方式（精确、软化、前向自动微分、区间算术）；React 组件调用 `referenceLayout`，编译后的 `f` 是它的"数学双胞胎"，3,000 组随机 props 上逐像素一致；页面自述"**The page is written by hand in this form. Nothing converts existing React or HTML into it yet.**"

→ 可借鉴的是"把布局变成可测试、可分析的函数"这一**工程范式**，不是"所有 UI 都该编译成数学"。

### 4.2 11 个工具

| Tab | 回答的问题 | 方法 | 可借鉴点 |
|---|---|---|---|
| Metrics | 首屏有多少真内容？哪个 prop 影响最大？ | 覆盖率 C + 偏导 + 响应面 | 用目标函数而非感觉讨论设计 |
| Optimize | 怎样在全部设备上减少截断？ | 设备分布上最小化截断率+高度+漂移 | 调参变成带约束优化 |
| Prove | 某条规则能否对所有屏幕成立？ | 区间算术 + branch and bound | 给保证或反例，不是抽样 |
| Breakpoints | 布局在哪跳变/折弯？ | 区间排除 + 二分 | 断点是一等公民 |
| Resize | 拖动窗口能否不重排？ | 分段仿射 `f(W₀+ΔW)=f(W₀)+JΔW` | 差分预测过渡 |
| Transition | 两个设计怎样切换最不抖？ | 枚举改变顺序 + Jacobian 度量 + Dijkstra | 路径与终点同样重要 |
| Signal | 能否压缩/采样/量化？ | Fourier、Haar、截图采样、权重舍入 | 截图测试是采样，会漏断点 |
| Direction | 一个 prop 如何让每张卡移动？ | 对每个 prop 求偏导 | 动画可从导数推导 |
| Motion | 软化阶跃后布局怎么动？ | 只把 step 换成 sigmoid；τ 是软化尺度 | τ 不是动画时长 |
| Average | 典型用户看到的页面多高？ | 设备分布积分 + Monte Carlo 对照 | 用真实分布算期望 |
| Imagine | 复数宽度下什么样？ | 解析延拓、复平面极点 | 解释性工具，非日常必需 |

### 4.3 七个工程教训

1. 把布局写成纯函数，让设计可测试、可求导、可证明。
2. 断点要枚举，每个 jump/kink 都是设计决策。
3. 截图测试是采样，至少要在断点两侧测。
4. 用设备分布算期望，不要用单一桌面宽度代表所有用户。
5. 动画可从布局差分推导，不必逐元素手调时长。
6. 公开假设与局限，比假装"全都能证明"更能建立信任。
7. 文档要写成"可操作的证据"：块画廊、宽度标尺、断点标记、prompt/tool JSON、Limits 一并列出——不是只有 API 文档。

### 4.4 实测问题（有讽刺意味）

- **390 px / 768 px**：右上角实时预览浮层覆盖标题与导语（预览宽约 234 / 460 px）。
- **1100 px**：开始为预览预留空间，但左侧 tab 栏可视 442 px、内容 712 px，仍需横向滚动。
- **390 px**：tab 栏可视 356 px、内容 712 px，横向裁切且无滚动提示。

→ 借鉴"实时预览模式"，但必须默认折叠/停靠/下沉；tab 栏要有溢出提示。

### 4.5 不建议照搬

| 不建议 | 原因 |
|---|---|
| 用编译后的数学函数替换运行时 | 手写原型；真实 UI 有字体度量、图片、本地化、浏览器布局 |
| 把复数平面/3D 抬升做成产品功能 | 教学工具，不是个人任务必要能力 |
| 窄屏保留悬浮预览 | 实测遮挡正文 |
| 继续堆几十个通用块 | 抬高模型选择成本与维护面 |
| 把二维码做成装饰图 | 必须真可扫、可刷新、可离线、可过期 |
| 把 τ 当动画时长 / 认为软化 step 后整图光滑 | τ 只是软化尺度；ReLU 仍可能不可导 |
| 宣称"证明所有屏幕" | 除非明确输入范围、字体度量、浮点策略 |

---

## 5. SDK 现状

### 5.1 边界：SDK 不是个人数据平台

`ROADMAP.md` 把 "Collection of private user data" 列为 **Not planned**；`SDK.md` 说明核心运行时只管答案内容。

| 能力 | SDK 应定义/提供 | 宿主负责 |
|---|---|---|
| 个人数据获取 | 不获取，只接收 payload | 连接器、账号、授权 |
| 持久化 | `storage` 契约、`user`/`model`/`derived` 语义（当前缺失） | 实现存储、跨设备同步 |
| 支付/发送/删除 | action intent、确认提示、结果状态 | 授权、执行、审计、限流 |
| 通知/深链 | `remind`/`deeplink` intent | 权限、发送、跳转 |
| 来源/新鲜度 | 字段级 `provenance`、时间语义、校验状态（缺失） | 提供真实来源/签名/校验 |
| 数据准确性 | 不背书 | 数据提供方/宿主 |

**关键区分：** "SDK 不收集数据" ≠ "SDK 不处理敏感数据"。答案表面、storage/offline 缓存、日志、截图都可能出现 PII。

**SDK 的直接客户是宿主开发者，最终用户是宿主用户。** 答案表面通常是会话内的；任务/凭证/提醒要进入生活，必须有宿主表面（侧栏/小组件/Wallet/日历/通知）。

### 5.2 块目录事实 `[已确认]`

`BLOCK_CATALOG` 共 **30 个块**（实测，与附录 A 一致）：

| 类型 | 数量 | 块 |
|---|---:|---|
| media | 6 | collage, strip, rtHero, pair, figure, mediaRow |
| layout | 3 | chips, tabs, tiles |
| content | 9 | card, chart, stats, timeline, matrix, code, diff, fileTree, formula |
| interactive | 8 | calendar, checklist, packing, form, calculator, flashcards, map, steps |
| domain | 4 | menu, outfitGrid, dayList, bike |

结构性观察：

- **工作/开发向偏多**：`code/diff/fileTree` 占 10%，而消息、文档、票据、账单、健康、天气没有对应块。
- **领域块只有 4 个**，其中 `bike` 不是日常场景。
- **8 个交互块没有一个内置"外部行动 + 结果确认"的完整生命周期。**
- **没有容器/组合原语**：块是扁平的，`tabs` 的 panel 只能是字符串，无法嵌套块。

### 5.3 能力阶梯：当前在 L0–L2

| 层 | 能力 | 状态 | 证据 |
|---|---|---|---|
| L0 结构化展示 | 信息变可读块 | **强** | 30 块覆盖 card/chart/stats/timeline/matrix |
| L1 解释与比较 | 上下文、对比、计算 | **较强** | card/matrix/formula/stats/chart；"个人后果"靠模型自由文本 |
| L2 本地交互 | 选择、勾选、缩放、复制 | **较强** | calendar/checklist/packing/form/calculator/flashcards/map/steps/tabs/chips |
| L3 持久状态 | 跨轮次/会话记住 | **弱/无标准** | 仅块内临时状态；无 storage adapter；无自定义 setter 的块会 remount，临时值可能丢（`SDK.md:356`） |
| L4 外部行动 | 执行副作用并确认 | **弱/无标准** | 有 `onAction` 钩子与 `[iui-action]` 事件，但无 result/status/compensation 契约、无幂等、无权限、无结果回传 |
| L5 主动/环境 | 提醒、通知、后台、离线 | **无** | 无通知、无定时、无 service worker、无快照 |
| L6 信任与控制 | 来源、新鲜度、授权、审计、补偿 | **部分** | 输入验证/URL 白名单/无 raw HTML 强；行动授权、来源、审计缺失 |

### 5.4 五维能力矩阵

`已有` = 有标准块和本地交互；`部分` = 只覆盖一部分；`缺失` = 无标准块/契约（宿主仍可用自定义块补）。

| 域 / 能力 | 可用块 | 展示 | 本地交互 | 持久化 | 外部行动 | 结果确认 | 关键缺口 |
|---|---|---|---|---|---|---|---|
| 日程/时间 | calendar, timeline, checklist | 已有 | 已有 | 缺失 | 缺失 | 缺失 | 写回日历、重复、提醒、时区、冲突 |
| 任务/习惯 | checklist, steps, calendar | 已有 | 已有 | 缺失 | 缺失 | 缺失 | 跨会话持久化、截止、重复、streak |
| 饮食/采购 | menu, calculator, checklist | 已有 | 已有 | 缺失 | 缺失 | 缺失 | 价格/过敏原/库存、下单、单位换算 |
| 出行/票务 | dayList, packing, map, chips | 已有 | 已有 | 缺失 | 缺失 | 缺失 | 登机牌/QR/Wallet、实时状态、改签、离线 |
| 财务/账单 | chart, stats, formula, matrix | 已有 | 部分 | 缺失 | 缺失 | 缺失 | 账户/交易、到期提醒、支付/分摊、来源 |
| 健康/医疗 | card, checklist, calendar, timeline | 已有 | 已有 | 缺失 | 缺失 | 缺失 | 药物/剂量/症状/预约/化验、隐私权限 |
| 家居/维修 | checklist, formula, timeline, steps | 已有 | 已有 | 缺失 | 缺失 | 缺失 | 维修历史、零件/保修、服务商预约 |
| 学习 | flashcards, checklist, timeline | 已有 | 已有 | 缺失 | 缺失 | 缺失 | 间隔重复、掌握度、跨会话进度 |
| 社交/沟通 | card, form, chips | 已有 | 部分 | 缺失 | 缺失 | 缺失 | 联系人/群组、消息/邮件、RSVP、发送结果 |
| 消费决策 | matrix, stats, chart | 已有 | 部分 | 缺失 | 缺失 | 缺失 | 实时价格/库存、真实评测来源 |
| 文档/记录 | figure, card, code, diff | 已有 | 部分 | 缺失 | 缺失 | 缺失 | OCR、笔记编辑、附件、签字 |
| 通知/主动（跨域） | 无 | 缺失 | 缺失 | 缺失 | 缺失 | 缺失 | 提醒、后台更新、深链、摘要推送 |

> 早期文档的 "19/33" 是检查点层级之和，**不是覆盖率、不是 KPI、不等距**。本表替代它，不再引用该数字。

### 5.5 任务视角（更接近产品决策）

| 任务 | 完成度 | 现在能做到 | 卡点 |
|---|---|---|---|
| 出示一张凭证 | 只读 | card 展示航班/票号 | 无 pass/QR/离线/刷新 |
| 管理今天 | 本地 | checklist 勾选、calendar 看日期 | 无持久化/提醒/写回/冲突 |
| 处理一张账单 | 只读 | chart/stats 看金额、formula 算年化 | 无 bill/来源/确认/支付 handoff |
| 决定买什么 | 只读 | matrix 对比、stats 摘要 | 无实时价格/库存/来源 |
| 记录健康事项 | 本地 | checklist/card 记录步骤 | 无 medication/剂量/隐私权限 |
| 安排一次出行 | 本地 | dayList/packing/map 看行程 | 无实时状态/离线/改签 |

### 5.6 做得好的地方（不能只讲缺口）

1. **协议与验证扎实**：未知块丢弃、URL 白名单、无 raw HTML、props 大小限制（`maxOps 512`、`maxTotalBytes 1.5 MB`、`maxPropsBytes 192 KB`）、原型污染键移除。
2. **宿主适配接口齐全**：React / Vercel AI SDK / MCP Apps / DSH / 纯文本 fallback；prompt/action/theme/lifecycle 统一。
3. **流式与渐进渲染**：IUI-1 NDJSON/SSE、fence、tool call 三条路径；`set` 支持块内更新。
4. **基础响应式认真**：30 块在 320–720 px 容器宽度、合成短内容下无水平溢出。
5. **自定义块可行**：`registerBlock` + `Ctx.emit`，理论上登机牌可作为自定义块实现。

### 5.7 关键缺口（A–H）

**A. 语义 artifact 缺口。** 当前块是 UI 原语，不是生活物件。通用 card + list 无法承载条码/有效期/刷新、票根隐喻、离线、深链、领域字段校验。缺失代表：`pass/ticket`、`itinerary`、`bill/subscription`、`receipt/document`、`task/reminder`、`contact/message`、`weather/commute`、`medication`、`order/delivery`、`poll/rsvp`。

**B. 状态与持久化缺口。** 勾选/数值是块内临时状态；适配器默认 `agent` 策略只转发 `select/step/view/filter`，`change`/`copy` 不转发；`set` 无 user/model 区分，无自定义 setter 的块会 remount；无跨轮次/跨设备恢复；无草稿/已确认/已完成语义；无冲突解决（用户勾选后模型 `set` 覆盖，谁赢？）。

**C. 行动与交易缺口。** 有异步 `onAction` 钩子，但适配器**不等待返回值**，异步失败只 `console.warn`；无标准 action result；无 `proposed/authorized/running/succeeded/failed/cancelled/unknown/expired` 状态；无乐观更新/超时/重试/取消；无幂等键；无宿主侧授权（`risk`/`confirm` 只是 UI 提示）；无补偿/撤销；无审计；无"哪个块能调哪个 action"的权限模型。

**D. 数据与证据缺口。** 无标准证据信封；无字段级 provenance；未区分 `retrievedAt`/`observedAt`/`validFrom`/`validUntil`/`staleAfter`；未区分源可信度、校验状态、模型置信度（模型自报 `confidence: 0.95` 不是校准概率）；无"实时/缓存/估算"标识；无来源链接；无"数据过期时如何降级"的规则；无显式 `assumptions`。

**E. 时间/地点/语言缺口。** `chart` 数字格式化硬编码 `en-US`（`insights.ts:36-56`）；`stats.value` 是预格式化字符串；`calendar` 日期键是民用日期，格式化固定 `timeZone: "UTC"`，事件无 `timeZone`/instant 字段；无强类型 `date`/`instant`/`localTime`/`recurrence`；组件 chrome 与 `aria-label` 仍有英文硬编码；无 answer 级 `locale`/`timeZone`/`currency`/`units`；无 12/24 小时制、日期格式、单位制、RTL。

**F. 离线、凭证与主动缺口。** 无离线快照/service worker/凭证过期刷新；**离线 ≠ 有效**（缓存成功不证明登机口未变、凭证未撤销）；`Wallet link` 只是宿主 handoff，SDK 不签发凭证；无通知/提醒/深链/日历写入；无后台更新。

**G. 组合与布局缺口。** 块扁平、`tabs` panel 只能是字符串、无 stack/grid/split/slot；无 recipe 层；基准限制最多 6 个组件；无跨块 `bind`/`derive`（路线图已列未实现）。

**H. 信任、无障碍与评估缺口。** 输入验证强但**行动授权弱**；有 `aria-live`/`role="log"`/部分 `focus-visible`/原生 `<dialog>`，但无自动化 a11y 测试，不能宣称符合 WCAG；无来源/审计/同意管理；基准只验证结构。

### 5.8 基准能证明什么

- **能证明**：模型能否产出合法 `render_iui`、是否包含任务要求的块类型、数据形状是否可评分、验证器能否修复/丢弃。
- **不能证明**：块选择是否语义最优、回答是否好看/真实/可行动/持久/有用、失败时能否恢复。
- **现状**：25 任务 mock self-check 25/25；真实模型未跑（无 provider 凭据）；无多轮 follow-up；无 prompt injection 套件。
- **不能**用 25/25 证明"个人生活支持度"。

---

## 6. 基线方案（第五轮修订后待重审）

### 6.1 产品策略：一个 beachhead + 三个探针

不先做 20 个新块。先定义 3 个覆盖高频个人生活的 recipe 作为**平台能力探针**，但不同时上线：

| Recipe | 覆盖场景 | 强迫补齐 |
|---|---|---|
| Travel pass | 航班/火车/演出票、登机牌、会员卡 | QR/条码、离线、实时状态、Wallet 深链、时区、行动状态 |
| Day plan / tasks | 今天做什么、习惯、提醒 | 持久化、重复、提醒、完成历史、跨设备、冲突 |
| Bill / receipt | 账单、订阅、收据、分摊 | 金额/币种、到期日、OCR、确认/授权、来源、审计 |

**共性能力**（action lifecycle、data envelope、persistent state、凭证/离线）是平台要抽象的；**共性能力 ≠ 三套垂直实现**，P0 范围由选中的 beachhead 决定。

### 6.2 Recipe 依赖与降级边界

| Recipe | 最小可用形态 | 额外依赖 | 依赖未就位时的降级 |
|---|---|---|---|
| Travel pass | 只读 pass + QR/条码 + 离线快照 + 签名/撤销校验 | locale/timeZone、issuer 集成、Wallet 深链 | 若离线/签名/撤销不可用，则不选 travel；**不得用只读 preview 冒充最小可用** |
| Day plan | 今日摘要 + 一个主行动（打开宿主任务） | reminder、conflict policy、host storage | 只读计划，不写回 |
| Bill / receipt | 只读账单审查 + 深链到银行/宿主 | currency、OCR/source、confirm/auth | 只读，不在 SDK 内支付/取消 |

**范围规则：** 阶段 1 只补齐**选中 beachhead** 所需的平台契约；未选中的 recipe 只保留 schema 与扩展点。`P0` 的定义是"当前 beachhead 完成端到端任务所必需"，不是"所有领域都重要"。

### 6.3 协议层建议

| # | 能力 | 建议 | 优先级 |
|---|---|---|---|
| P0-0 | 协议版本化 | `ActionIntent`/`ActionState`/`DataEnvelope` 三套 schema + `version` + 兼容/migration 规则；**envelope 只做 additive**，否则 beachhead 无法在 0.2.x 交付 | P0 |
| P0-0a | Answer Envelope | answer 级 `locale/timeZone/currency/units` + 槽位/角色（`conclusion`/`primary_artifact`/`primary_action`/`explanation`/`provenance`）+ 顶层 provenance/assumptions；**不能由模型决定 `verified`** | P0（实验 B4/B7） |
| P0-0b | Host Capability Manifest | `actions[]`、`canNotify`、`canPersist`、`canOpenWallet`、`canVerifyPass`、`canWriteCalendar`；prompt/tool schema 与 validator 同源；未声明 action 在生成阶段拒绝 | P0（实验 B5） |
| P0-1 | 行动生命周期与安全 | 模型只产出 intent（`name`/`args`/`confirmHint`/`riskHint?`），风险标签**不作授权**；宿主生成/校验 `operationId` + `idempotencyKey`；状态见 6.3.1；`unknown` 按 operationId 对账，不盲目重试；补偿独立（`none`/`reversible`/`refund`/`manual`），`undo` 不是状态；宿主权限/审计/限流。**P0 只读/可逆**；支付/发送/删除需协议/授权/幂等/审计/对账全部完成后单独 open gate | P0 |
| P0-2 | 数据证据信封 | answer/block/field 三级 `provenance`，但**分两级预算**：answer 级必填（source/retrievedAt/verification/assumptions）；field 级只在高风险字段（金额、价格、凭证、医疗、时间）必填，其余继承。`retrievedAt`/`observedAt`/`validFrom`/`validUntil`/`staleAfter`；`verification`；`confidence` 分 source/model/calibrated；**模型数据与宿主验证结果分开** | P0（实验 B1） |
| P0-3 | 持久状态适配器 | `storage: {get,set,remove}` 宿主注入；状态分 `user`/`model`/`derived`；user-priority + 可见提示 + 版本号；TTL/登出清除/字段级脱敏/删除入口；补偿独立于状态 | P0 |
| P0-4 | 凭证/离线 | `pass` payload + issuer/signature/keyId/credentialId/validity/revocation/refresh/grace period；**状态双轴 `integrity × freshness`（见 6.3.4）**；`snapshot` 必须签名/密封并带 TTL；离线/过期/撤销/篡改状态；SDK 只展示/handoff | P0（travel 前置；实验 B2/B3） |
| P1-1 | 时区/语言/币种/单位 | answer 级 `locale/timeZone`；`currency` 用 ISO 4217；`units` 受控词表；强类型 `date`/`instant`/`localTime`/`recurrence`；替换 `en-US` 硬编码；chrome/aria 接入 locale | P1；被 P0-0a 吸收后只保留实现工作（实验 B7） |
| P1-2 | 高风险行动审批 UI | 宿主授权结果上的确认步骤、权限拒绝 fallback、审计可视化 | P1（bill 前置） |
| P1-3 | 组合/recipe | `recipe` 注册表 + 容器/插槽，或允许块嵌套 children | P1 |
| P1-4 | 通知/深链 | `remind`/`deeplink` action；宿主通知权限 | P1（day plan 前置） |
| P2-1 | 跨块 bind/derive | 先做安全表达式子集 | P2 |
| P2-2 | 动效契约 | 仅几何变化用 FLIP/spring；挂载不做入场动画；`prefers-reduced-motion` 移除 transform/scale | P2 |
| P2-3 | 无障碍契约 | 每块声明 role/label/focus 行为；axe + 手动测试 | P2 |

> **优先级说明：** P1 是平台全局默认；一旦选中 travel 或 day plan，其依赖（travel 的 P1-1、day plan 的 P1-4）在该期提升为 P0。Answer Envelope 与 Host Capability Manifest 不再是 P1，而是 Protocol Spec 的 P0 前置（实验 B4/B5/B7）。

> 第四轮指出：answer 级槽位与 locale 缺协议载体（`comp` 无 role、无 answer envelope op），应并入 Protocol Spec 而非留在 P1。**本版已将其提升为 P0-0a，并新增 P0-0b。**

**Protocol Spec 必须定义的十二件事：**

1. **Intent Schema**：模型能提出什么，不能决定什么。
2. **Action State Machine**：状态、转移、终态、超时、取消、过期。
3. **Transition Rules**：哪些转移合法；乱序/重复事件如何处理。
4. **Authorization Contract**：宿主权限、用户确认、权限变化、拒绝 fallback。
5. **Idempotency Contract**：作用域、参数哈希、保留期、并发去重、重复请求返回。
6. **Error Model**：权限、取消、参数、宿主、外部服务、网络、未知、对账失败。
7. **Retry Policy**：仅在对账确认无副作用或操作可安全重试时才允许。
8. **Reconciliation Protocol**：`unknown` 如何查询真实结果、何时结束、如何人工介入。
9. **Compensation Protocol**：独立于状态机的退款/反向操作/恢复/人工处理。
10. **Audit Event Schema**：谁在何时基于什么权限执行了什么，结果是什么。
11. **Answer Envelope**：answer 级 `locale/timeZone/currency/units`、槽位/角色、顶层 provenance/assumptions；模型只能提出 artifact 内容，不能声明 `verified`。
12. **Host Capability Manifest**：宿主声明可执行的 action 与能力；prompt/tool schema、validator、UI 可用性三处同源；未声明 action 在生成阶段拒绝。

> 逐项字段、状态表、错误码、验证规则与 conformance 用例见 `specs/PROTOCOL-SPEC.md`（0.1-draft，未批准）。

#### 6.3.1 状态机（基线）

```text
proposed
  ├─ request_confirmation -> awaiting_confirmation
  │    ├─ confirm -> authorized
  │    ├─ cancel -> cancelled
  │    └─ expire -> expired
  ├─ auto-authorize -> authorized
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
       └─ reconcile_manual -> manual_review
```

规则：

- `createdAt` 必填；`startedAt` 只在真正执行后填写；`finishedAt` 只在终态填写。
- `expiresAt` 是**操作请求**的有效期，不是凭证有效期。
- **硬约束：** 以 `createdAt` 为起点，`idempotencyRetention ≥ reconciliationWindow ≥ max(expiresAt − createdAt, retryWindow)`；三者不能各自拍脑袋。
- `stateVersion`/`sequence` 识别过期或乱序事件。
- `unknown` 不是终态，必须进入对账。
- 用户取消但宿主已开始执行 → 返回"取消请求已收到，结果待确认"，不能假装已取消。
- 授权后、执行前权限被撤销 → 重新授权或失败。
- 重复成功事件必须幂等；重复执行必须被幂等键/操作记录拦截。

#### 6.3.2 最小结构示例（示意，非最终 schema）

```ts
// 模型可产出：不可信输入；无 idempotencyKey，无授权字段
type ActionIntent = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  confirmHint?: string;
  riskHint?: "read" | "reversible" | "irreversible"; // 只是提示，不作授权
};

// 宿主执行层维护
type ActionState = {
  operationId: string;
  idempotencyKey: string;         // 宿主生成/校验
  intentId: string;               // ActionIntent.id
  state: "proposed" | "awaiting_confirmation" | "authorized" | "running"
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
  authorization?: { decision: "allow" | "confirm" | "deny"; policyVersion?: string };
  error?: { code: string; message: string; retryable: boolean; terminal: boolean };
  receipt?: { url?: string; payload?: unknown };
  compensation?: { kind: "none" | "reversible" | "refund" | "manual";
                   state?: "available" | "running" | "done" | "failed" };
};

// 字段级证据
type DataEnvelope<T> = {
  value: T; schemaVersion: string;
  provenance: Array<{
    fieldPath: string;
    producer: "model" | "host" | "trusted_verifier" | "derived";
    authority: "claimed" | "attested" | "authoritative";
    source: { id: string; kind: string; url?: string };
    retrievedAt: string; observedAt?: string;
    validFrom?: string; validUntil?: string; staleAfter?: string;
    verification: { sourceIdentity: "verified" | "unverified";
                    integrity: "verified" | "unverified" | "invalid" | "revoked";
                    schema: "valid" | "invalid";
                    crossSource: "consistent" | "conflict" | "not_checked" };
    confidence?: { kind: "source" | "model" | "calibrated"; value?: number;
                   method?: string; dataset?: string; calibratedAt?: string };
  }>;
  assumptions?: string[];
};
```

**幂等契约要点：** 作用域 = 用户 + 租户 + 操作类型 + 参数哈希；同键不同参数 → 拒绝（`idempotency_conflict`），不能静默复用或另起新操作；保留期覆盖重试与对账窗口；跨实例并发去重；过期后仍需防重复执行；**不宣称 exactly-once**。

**provenance 预算（实验 B1 修订）：** 上面是完整形状，不是每个字段都要填。**answer 级必填**：source id/kind、`authority`、`retrievedAt`、`verification`、`assumptions`。**field 级只在高风险字段必填**：金额、价格、凭证、医疗、时间/登机口、外部链接。其余字段继承 answer 级 provenance。评估把 provenance 的 token 数与首块延迟作为独立指标，不能用"1.5 MB 没超"代替；若 provenance 出现在第一个 `comp` 之前，TTFT 会直接变差。

#### 6.3.3 协议测试必须覆盖

状态迁移合法性；并发更新与乱序事件；重复请求/重复成功事件；超时后的 `unknown` 与对账；授权撤销、权限变化；用户取消与已执行冲突；幂等键参数变化；补偿失败；恶意/伪造 `verified` 字段。

**退出标准：** Protocol Spec 通过架构、安全、宿主代表评审；状态机与异常测试通过；未通过前不开放副作用 action。

#### 6.3.4 凭证状态：双轴，不是单轴（§8.2 P0-3 修订）

实验 B2/B3 证明：`offline/stale/expired/revoked/signature_invalid` 是一条扁平枚举，混了两个正交维度。最危险的场景是**签名有效、未撤销、未过期，但登机口从 D7 改成 D2**；单轴枚举没有位置放它。

| 轴 | 取值 | 谁决定 | 含义 |
|---|---|---|---|
| `integrity` | `verified` / `unverified` / `invalid` / `revoked` | 宿主或 issuer verifier | 签名、issuer 身份、撤销状态；**不能由模型 props 决定** |
| `freshness` | `live` / `stale` / `expired` / `unknown` | 宿主时钟 + 上次成功校验 + 网络 | 数据有多新，不代表凭证是否有效 |

可出示判定写成函数，而不是 UI 各自猜：

```ts
type Presentability = {
  canShowCode: boolean;
  level: "ok" | "warning" | "danger";
  reasons: string[];
};

// 伪代码；validUntil 是凭证有效期，staleAfter 是数据新鲜度阈值
presentability(integrity, freshness, validUntil, now):
  if integrity in {invalid, revoked} -> danger, canShowCode=false
  if freshness == expired or now >= validUntil -> danger, canShowCode=false
  if integrity == unverified -> warning, canShowCode=true
  if freshness in {stale, unknown} -> warning, canShowCode=true
  else -> ok
```

| 组合 | 可出示 | UI 要求 |
|---|---|---|
| `verified` + `live` | 是 | 正常主行动 |
| `verified` + `stale` | 是 | 显示"保存副本"、上次校验时间、**登机口冲突**；主行动可用但带警告 |
| `verified` + `unknown` | 是 | 显示"无法实时校验"；不得写"已验证"作为当前状态 |
| `unverified` + `live`/`stale`/`unknown` | 是 | 显示"签发方未验证"；不得显示 Verified 徽章 |
| `invalid` / `revoked` + 任意 | 否 | 主行动禁用；说明原因 |
| 任意 + `expired` / `validUntil` 已过 | 否 | 主行动禁用；提示重新获取 |

**离线规则：** 离线可显示 ≠ 离线仍有效。快照必须由宿主签名/密封（或存 issuer 签名 + 本地 MAC），并带 `snapshotAt`、`lastCheckedAt`、`validUntil`、`staleAfter`；快照篡改必须变成 `integrity=invalid` 或 `unknown`，不能继续显示 `verified`。登出/撤销/TTL 到期必须删除快照。

### 6.4 块层建议

| 优先级 | 块 | 关键点 |
|---|---|---|
| P0（候选） | `pass` | 类型、标题、主体、QR/条码 payload、issuer/signature/keyId/credentialId、有效期、撤销/刷新/grace period、离线快照、Wallet 链接；**`integrity × freshness` 双轴 + 宿主 attestation + `latestKnown` 冲突提示**；放大用可见按钮（非 hover-only） |
| P0（候选） | `taskList`/`reminder` | 任务、截止、重复、优先级、完成状态、提醒时间、版本 |
| 后续 | `bill`/`subscription` | 金额、币种、周期、到期日、自动扣款、分摊、来源；支付/取消不由 SDK 执行 |
| P1 | `document`/`receipt` | 文件/图片、OCR 字段、来源、日期 |
| P1 | `itinerary` | 多段行程、当地时间、状态、中转 |
| P1 | `messageDigest` | 线程、发件人、摘要、待办、附件 |
| P1 | `contact`/`rsvp` | 人/群组、渠道、可用时间 |
| P1 | `weather` | 地点、当前/预报、穿衣/通勤建议 |
| P2 | `medication` | 药名、剂量、时间、剩余、处方 |
| P2 | `order` | 订单号、状态、ETA、承运商 |
| P2 | `poll` | 选项、参与者、截止 |

**注意：** 不要把这些做成"通用 card 的变体"；价值在领域字段、校验、行动与状态语义。首期只交付单块 + 静态组合示例；recipe 组合层是 P1-3。块只定义 action intent 与状态，执行/权限/审计在宿主。

**Domain Artifact Spec 的范围**（beachhead 选定后只写选中的那个，另一个只留 schema 与扩展点）：

- **Travel pass**：凭证标准与 issuer 集成方式；签名、key id、凭证唯一 ID、有效期、撤销、刷新、grace period；**`integrity` × `freshness` 双轴状态与可出示判定**；离线快照、快照签名/密封、TTL/登出清除；QR/条码敏感信息保护；Wallet handoff 边界（SDK 不签发、不写入）；真机、不同亮度、不同扫码设备测试。
- **Day plan**：任务、截止、重复规则、提醒时间、完成状态；宿主存储/日历/通知接口；用户 vs 模型 vs 派生状态的冲突算法；离线修改队列与合并；提醒失败/权限拒绝的降级；过期任务和重复任务的处理。
- **通用交付物**：字段、校验、生命周期、状态、action、降级、provenance/trust、UI 状态、a11y、安全边界。

**P0-1 实验转成的验收用例**（`experiments/pass-spike/BLOCKERS.md`）：

| 用例 | 断言 | 覆盖卡点 |
|---|---|---|
| 模型伪造 `integrity=verified` | 不得出现可信徽章；只能显示宿主 attestation 的结果 | B1 |
| 跨凭证复用 attestation | 凭证 ID 不匹配时视为无 attestation | B1 |
| D7→D2 在线变更 + 离线重载 | 显示 `verified` + `stale`、缓存 D7、最后在线 D2；二维码可出示但带警告 | B2 |
| 篡改快照 | 必须变成 `invalid`/`unknown`，不得继续 `verified` | B3 |
| 离线重载后的结论 prose | 不得声称"Gate D7 实时"；结论与 artifact 的新鲜度必须一致 | B4 |
| Wallet / Refresh 失败、超时、重复点击 | 有 `running/succeeded/failed/unknown`（必要时 `reconciling/manual_review`）；重复点击被幂等拦截；无能力时不显示按钮 | B5 |
| 用户勾选/状态覆盖 | user 状态优先于 model `set`，冲突可见 | B6 |
| zh-CN / en-US 切换 | answer 级 locale 一次生效；chrome、ARIA、action envelope 同步 | B7 |

### 6.5 布局与测试：让布局自己解释

原则：**Let the layout do the explaining.** 布局通过槽位、尺寸、顺序、状态解释"这是什么、什么最重要、下一步做什么"。

**Answer-level 契约**

- 对存在实际行动的任务，首屏（以宿主声明的可用高度为准；600–800 px 只是默认估计）必须出现：一句结论、主 artifact 关键值、一个主行动。纯解释/比较型可无主行动，但必须有主结论与主 artifact。
- 槽位：`conclusion` / `primary artifact` / `primary action`（实际行动型必需）/ `explanation` / `provenance`。主 artifact 只能一个。
- **前置：** 这些槽位必须由 Answer Envelope（6.3 P0-0a）承载，才能被模型遵守、被测试断言。当前 `comp` 没有 role/slot；在协议落地前，宿主只能手写 prose 拼装（实验 B4 的降级），不得把"手写拼装"当作布局契约已实现。
- 折叠顺序：窄容器先收解释、再收次要字段，**不先收主行动**；主行动可变底部 sticky bar，但不能被 hover-only 替代。
- 用**容器宽度**而非 viewport 断点（SDK 常嵌在 320–456 px 聊天列）；用 container queries 或 ResizeObserver。
- "5 秒内找到二维码/主行动/数据来源"是**待验证假设**，不是合格线。

**Block-level 不变量**

- 无页面级水平溢出；`matrix`/`code`/`diff` 允许显式横向滚动但需提示。
- 无重叠；关键文本/按钮 bounding box 不相交。
- 触控目标：产品目标 ≥44×44 px；WCAG 2.2 AA 2.5.8 最低 24×24 CSS px（有间距/行内/等效控件例外）。
- 文本不被裁切；`line-clamp` 必须有展开入口。
- 对比度 ≥4.5:1（正文）/3:1（大字）。
- 分别测 **200% 文本缩放**与 **400% 页面 reflow**（不同要求）。
- 在 320/360/390/456/520/720 px 容器、P50/P95 内容、中/德文展开、RTL 下测，断点两侧截图。
- 这些是"在定义域内验证"，不宣称浮点证明。

**设备分布加权**：宿主提供真实列宽分布；用加权通过率而非单一宽度做门槛；报告"期望截断率/溢出率"。

**动效**：只对已有元素的位置/尺寸变化用 FLIP/spring；挂载/卸载不做入场动画；统一 motion token；减少动效时移除 transform/scale。

**证据/状态作为布局状态**：`stale`/`offline`/`expired`/`revoked` 要改 header/status strip/边框与主行动可用性；成功/失败/待确认/未知放在行动区，不放页脚；来源/新鲜度放可见状态区。

### 6.6 评估：四层 + 一个独立安全维度

| 层 | 核心问题 | 指标 |
|---|---|---|
| L1 协议 | 输出是否合法？ | 合法输出率、Schema 通过率、非法输入拦截率 |
| L2 任务 | 是否真正完成？ | 关键信息正确率、任务完成率、错误操作率 |
| L3 运行 | 是否稳定可恢复？ | 状态一致性、超时恢复率、幂等成功率、离线可用率、对账成功率 |
| L4 用户价值 | 用户是否愿意用？ | 完成时间、可用性评价、复用率、集成成本 |
| S 安全（独立） | 能否抵抗滥用？ | 注入拦截率、越权拒绝率、重复执行率、泄露事件数、跨用户污染率 |

**样本量**：不设统一 `n≥12`；形成性测试 5–8 人/轮迭代；定量成功率按效应量/置信区间设计；复用窗口按 recipe 定义。

**个人生活专项**：时区/币种/单位错误率；过期数据识别率、字段级来源可追溯率；**provenance 的 token/延迟占比（相对首块与 TTFT）**；重复点击/重复下单率、`unknown` 对账成功率；断网/弱网/撤销后可用性；读屏/键盘完成率；长文本/本地化/200% 缩放/400% reflow/RTL 截断率；恶意二维码/支付链接/工具结果注入识别率。

**评估体系必须包含八项：** 测试对象；测试数据；标准答案或判断依据；评分方法；评分者一致性要求（人工评审时）；指标计算公式；发布阈值；失败案例处理机制。

**硬阻断（任一出现即不得发布，不能用平均分抵消）：** 模型越权执行；不可逆 action 重复执行；凭证伪造或签名校验绕过；**离线快照被篡改后仍显示已验证/可出示**；跨用户/跨租户数据泄露；`unknown` 被当作失败并直接重试；关键数据来源无法追溯；**审计链缺失或可静默改写（若开放可执行 action）**（2026-11-03 用户决策 9 采纳，EVALUATION-SPEC §7.1 同步）。

> 指标公式、样本量、评分者一致性、证据包与门禁模板见 `specs/EVALUATION-SPEC.md`（0.1-draft，未批准）。

### 6.7 阶段与门禁（基线）

| 阶段 | 交付 | 退出标准 |
|---|---|---|
| 0. 定义与选择 | 三份 spec 草案（Protocol / Evaluation / 选中域）、`taskList`/`checklist` 字段 diff、用户细分、host 类型、核心 job、数据来源/风险、beachhead 选择 | 选定一个 beachhead；三份 spec（选中域 only）评审通过；明确不做的事 |
| 1. 平台契约 | 只补齐选中 beachhead 所需：action lifecycle/授权、answer envelope（含槽位/布局验收）、data envelope、storage、宿主能力清单；按选择加一条（travel 加凭证/离线，day plan 加提醒/冲突） | 依赖全部就位；只读降级路径可用；槽位/布局断言通过；失败/未知/补偿有测试 |
| 2. Beachhead 端到端 | 一个真实端到端 recipe（模型 → 数据 → UI → 用户操作 → 宿主执行 → 结果/异常） | 端到端 demo；状态一致；宿主 handoff 明确；另两个 recipe 只有 schema |
| 3. 复用与评估 | 第二个 recipe 的只读/静态复用；L1–L3 + 安全；布局契约/断点/设备 mix | 复用不需重写核心契约；CI 门禁；报告公开假设与失败案例；L4 不在本期 |
| 4. 扩展 | 第三个 recipe 及 itinerary/document/weather | 按真实使用数据排序，不按块数量 |

**Definition of Ready**：一个 beachhead；三份 spec（Protocol / Evaluation / 选中域）评审通过；真实数据/宿主接口可用；首期 action 只读或可逆；安全/隐私威胁模型完成。若选 travel，必须先拿到 issuer 测试凭据或明确的标准样本；若选 day plan，必须先拿到宿主存储/日历/通知的权限说明。

**Definition of Done 分两级**（§8.2 P0-6 修订）：

| 级别 | 用途 | 必须满足 | 明确不包含 |
|---|---|---|---|
| **Beachhead DoD** | 本期发布门禁 | **L1**：beachhead 所需的 Protocol Spec 子集通过评审，状态机/异常/幂等/能力清单测试通过；**L2**：至少一条真实或半真实端到端路径，关键字段在预登记测试集上全对，主行动无错误执行；**L3**：状态一致、超时/离线可恢复、`unknown` 可对账、补偿路径可演练；**S**：无 §6.6 硬阻断，伪造 `verified`/篡改快照/越权 action 三类攻击有自动测试；**证据包**：预登记规则、可执行代码、复现命令、截图/日志、已知限制、失败案例 | L4 采用率/复用率；多宿主规模；商业指标 |
| **Production DoD** | 扩大发布/收费前 | Beachhead DoD 全部满足；L4 达到预设阈值且有宿主遥测/用户研究证据；真实 issuer 与生产宿主验证；安全/隐私审计；运维、回滚、对账与事件响应演练 | — |

**L4 不是永远不做，而是本期无法验收。** 没有宿主遥测时只能标"未测"，不能标"通过"；也不得用"临时豁免"把 L4 从门禁里删掉后再宣称已发布。

**工期重估（1–2 人团队，实验后修订；2026-11-04 反方审阅 F1 修正：阶段 1 拆分为 1a/1b，中间插入 issuer 门槛）**

| 阶段 | 原估 | 重估 | 依据 |
|---|---|---|---|
| 0. 定义与选择 | 未估 | 1–2 周 | 只做证据采集与决策，不写产品代码（已完成：本决策记录 + 两份 spec 草案 + Domain Spec） |
| **1a. beachhead 无关契约** | — | **4–5 周** | Answer Envelope、Capability Manifest、action 基础（intent/state/授权/幂等/错误/审计，只读+可逆子集）、provenance 两级——**对 travel 与 day plan 完全复用**；issuer 外联**并行**进行 |
| **Issuer 门槛（1a 末）** | — | 检查点 | ≥1 个真实或可外部验证的凭证来源给出书面接入路径，或外联 ≥3 家且 ≥1 家进入技术评估。**未通过 → 立即切 day plan，沉没成本仅 1a（全复用），travel 专属工作零启动** |
| **1b. travel 专属契约** | — | **3–5 周** | Pass profile（双层 seal、撤销/刷新/grace period）、快照/TTL/登出、DSH 适配——仅在门槛通过后启动 |
| 2. Beachhead 端到端 | 未估 | 3–5 周 | artifact 约 1 个工作会话，但信任/行动/离线胶水另计，且要接真实宿主；含**非作者环境的第二探针**（反方 F2） |
| 3. 复用与评估 | 未估 | 4–6 周 | 第二个 recipe 只读复用 + L1–L3/安全 + 布局/断点/设备 mix |
| 4. 扩展 | 未估 | 按证据 | 不预估；按真实使用数据排序 |

合计约 **15–23 周**（不含阶段 4）。这是排期决策用的最低可信区间，不是对外承诺。若只有 1 人，阶段 1a/1b 取上限并另加缓冲。**issuer 外联不是被动等待**：从阶段 1a 第一周开始，目标包括 Google/Apple Wallet 测试发行通道、IATA 相关标准、以及任何可提供测试凭证的发行方；每外联记录归档，作为门槛证据。

### 6.8 风险与取舍

| 风险 | 表现 | 缓解 |
|---|---|---|
| 范围膨胀 | 每域都想做，块越来越多 | 先选一个 beachhead；其他只留 schema |
| 模型选择困难 | 块太多，选错/漏选 | 目录分组、recipe 级 prompt、只暴露相关块 |
| 行动安全 | 模型生成"支付/删除"；`risk` 被当授权 | 宿主权限、确认、幂等、审计、限流；模型只出 intent |
| 未知结果重复执行 | 超时后直接重试导致重复扣款 | `unknown` + operationId 对账；重试前查询 |
| 隐私 | 个人数据进入模型/日志/缓存 | 数据分级、脱敏、保留/删除、日志最小化；storage/offline 仍处理 PII |
| 提示注入/恶意 artifact | 收据/网页注入指令；二维码指向钓鱼 | 工具结果当不可信数据；域名白名单；签名 payload；注入测试集 |
| 凭证伪造/撤销 | 二维码可扫但不代表真实/未撤销 | issuer/signature/keyId/credentialId；撤销/刷新；真机测试 |
| 数据来源不可信 | block 级 source 掩盖字段级冲突 | 字段级 provenance；verification 状态；assumptions 可见 |
| 离线过期 | 缓存了旧登机口 | 显示 retrievedAt/observedAt/stale；刷新/撤销；过期不可用 |
| 国际化 | 日期/币种/时区错误 | answer 级 locale/timeZone/currency；强类型时间；文案层 |
| 证明过度 | "所有屏幕都证明" | 明确输入范围；说"在定义域内验证" |
| 状态冲突 | 用户勾选后被 `set` 覆盖 | user/model/derived 标记；user-priority；冲突提示 |
| 宿主分裂 | 每宿主自定义 action | 标准 envelope + 适配器契约 |

---

## 7. Beachhead 决策（待决）

### 7.1 两个候选

| 候选 | 核心 Job | 首期 artifact | 主要风险 |
|---|---|---|---|
| Travel pass | 出行前/到机场可靠出示凭证 | `pass` | issuer、签名、撤销、离线、真机扫码、Wallet handoff |
| Day plan | 管理今天要做的事，并在正确时间提醒 | `taskList`/`reminder` | 宿主存储/日历/通知权限、冲突、提醒失败 |

**Bill 不进入首期候选。** 主要不是支付风险（首期形态本来就是只读审查 + 宿主深链），而是**数据获取**：银行/账单/OCR 的接入授权、样本与字段一致性最难在短期内拿到。支付、取消、退款与合规风险仍然存在，但属于后续 recipe 的门禁，不是首期排除理由。

**风险轴不可直接相加。** Travel 的风险主要是**外部依赖**（issuer、凭证、撤销、真机扫码），问题是我方能否单方面拿到该依赖；Day plan 的风险主要是**宿主权限**（存储、日历、通知），问题是宿主是否愿意给。两者不是同一量纲，不能合成一个"风险分"。决策时先问：哪个依赖能在两周内拿到书面承诺或可验证测试凭据？拿不到的那一个，不应作为首期。

### 7.2 选择原则（六条同时满足）

1. **有真实宿主**：能提供真实容器、身份、数据和 action 接口。
2. **有真实用户**：能接触目标用户做形成性测试与任务观察。
3. **有真实数据**：至少一个数据源可接入，不能全靠模型编造。
4. **首期 action 只读或可逆**。
5. **能验证平台抽象**：至少压到 action 状态、数据证据、持久化/离线中的两项。
6. **有放弃条件**。

### 7.3 十个必答问题

| # | 问题 | 证据 | 负责人 |
|---|---|---|---|
| 1 | 首个宿主是什么类型？ | 宿主访谈、现有集成、容器宽度/权限说明 | 产品/架构 |
| 2 | 目标开发者是谁？ | 开发者访谈、集成工时估算 | 产品 |
| 3 | 最终用户是谁？ | 5–8 名目标用户访谈/任务观察 | 产品/设计 |
| 4 | 核心 Job 是什么？ | Job story、任务脚本、成功/失败样例 | 产品 |
| 5 | 数据从哪里来？ | 数据源清单、授权链、样本数据 | 架构/数据 |
| 6 | 宿主能执行什么 action？ | 宿主 API/权限清单 | 架构/安全 |
| 7 | 首次价值需要多久？ | 形成性测试记录 | 设计 |
| 8 | 用户会重复使用吗？ | 使用频率访谈/日志；不把假设当数据 | 产品 |
| 9 | 最大风险是什么？ | 威胁模型、合规清单 | 安全/法务 |
| 10 | 能复用到第二个 recipe 吗？ | 契约复用评审 | 架构 |

### 7.4 证据状态（全部为"未采集"）

| 维度 | Travel pass | Day plan |
|---|---|---|
| 宿主类型 / 开发者 / 用户 | 未知 | 未知 |
| 核心 Job | 假设 | 假设 |
| 数据接入 / 行动接口 | 未知 | 未知 |
| 首次价值 / 使用频率 | 未测量 | 未测量 |
| 技术风险 | 高预期 | 中预期 |
| 合规风险 | 中高预期 | 中预期 |
| 复用潜力 | 未知 | 未知 |

这些是**证据缺口，不是评分**；不得相加成精确分数。

### 7.5 必须满足的条件

**Travel pass**：有真实 issuer 或明确凭证标准；能拿到签名凭证/可验证测试凭证；能实现离线快照 + 签名校验 + 撤销/刷新；有真机扫码条件；首期不需要 SDK 自己发行或写入 Wallet；能接受"离线可显示 ≠ 离线仍有效"的状态设计。任一不满足 → 不作首期。

**Day plan**：宿主有任务存储/日历/通知接口，或允许只读降级；能定义任务/截止/重复/提醒/完成状态；能处理用户/模型/派生状态冲突；能测提醒失败、权限拒绝、离线修改；首期不需要发送消息/支付/删除；有真实用户愿意连续使用一个短周期。任一不满足 → 不作首期。

### 7.6 决策记录模板

```text
Beachhead Decision Record
=========================
日期：
决策人：
宿主类型：
目标开发者：
最终用户：
核心 Job：
首期 artifact：
首期 action 边界：只读 / 可逆
数据来源：
宿主 action 接口：
成功指标：
放弃条件：
未选方案及原因：
证据链接：
检查：证据 / 边界 / 反方（见 7.8）
审阅人：
未解决异议：
```

### 7.6.1 Beachhead Decision Record（2026-11-03 起草；**2026-11-04 批准**——用户授权受托决策，反方检查通过并处置）

| 字段 | 值 |
|---|---|
| 日期 | 2026-11-03 |
| 决策人 | kairos（用户，2026-11-03 22:52 决策 1–4、8、9） |
| 宿主类型 | **DSH（现有路径）**——唯一有 live 验证记录的宿主（ROADMAP：rc.2/rc.3 live model + action，rc.4 tarball） |
| 目标开发者 | **用户本人（首期集成验证）+ 外部客户（后续采用目标）**——两类开发者；首期成功标准以本人集成为准 |
| 最终用户 | 【待补】DSH 宿主用户的具体细分——证据缺口，形成性测试前必须回答 |
| 核心 Job | 出行前/到机场可靠出示凭证 |
| 首期 artifact | `pass` |
| 首期 action 边界 | 只读 + 可逆（刷新快照、请求验证、打开二维码）；无发送/支付/删除 |
| 数据来源 | **当前无真实 issuer（用户答复："完全没有"）**。首期用自建测试 issuer（真实签名算法 + 本地 feed，升级自实验 fixture）；真实 issuer 为阶段 2 门槛（见放弃条件） |
| 宿主 action 接口 | DSH 现有 action 通道（`ui/message` 等）；具体清单在 Domain Artifact Spec 中列明 |
| 成功指标 | 见 `specs/EVALUATION-SPEC.md` §7.4 阈值草案【待确认】 |
| 放弃条件 | ① **Issuer 门槛（阶段 1a 末，主动检查）**：外联未产出任何可验证凭证路径 → 立即切 day plan，沉没成本仅 1a（beachhead 无关，全复用），travel 专属工作零启动（2026-11-04 反方 F1 修正：原"阶段 2 中期"被动触发会导致最大沉没成本恰好留在 travel 侧）；② 阶段 2 端到端 demo 无法在 DSH 稳定跑通；③ 出现不可修复的硬阻断 |
| 未选方案及原因 | **Day plan**：频率更高、宿主依赖更轻，但 travel 的契约验证路径已被实验铺满（B1–B7 → C1–C24），首期沉没成本最低；保留为回退方案。**Bill**：支付/合规 + 数据获取双高风险，已排除 |
| 证据链接 | `experiments/pass-spike/`（41/41，2026-11-03 独立复跑通过）、`specs/` |
| 检查 | 证据检查 ✓（第六轮独立复验）；边界检查 ✓（本记录 + §6.2 降级表）；**反方检查：AI 反方**（用户 2026-11-03 决策 8——由未参与撰写的独立 AI 实例按 §7.8 清单执行，身份如实标注：不是人类专家审阅） |
| 审阅人 | **2026-11-04 批准（受托决策）**：用户于 2026-11-04 授权（"所有决策你来做"，原则"正确的方法做正确的事情"），Agent 作为受托决策人签署；反方检查已由独立 AI 实例执行（2026-11-04），4 项发现全部处置（见下）。用户保留推翻权 |
| 未解决异议 | ~~① 最终用户细分未定义~~（仍开放——阶段 2 形成性测试前必须回答）；~~② 与 §7.5 前置条件的张力~~（已按"有条件选定 + 主动门槛 + 回退"处置，见上）。反方审阅处置：**F1** 回退成本低估 → 阶段 1 拆 1a/1b + issuer 主动门槛（已改 §6.7）；**F2** DSH 单点/作者自测 → 已记录为风险，阶段 2 加非作者第二探针（已改 §6.7、EVALUATION §7.4.1）；**F3** HMAC 密钥存放未定义 → seal 改双层（PROTOCOL-SPEC §15.3）；**F4** 状态机两处不一致 → 已修（PROTOCOL-SPEC §8） |

> **与 §7.5 的张力（必须记录，不得粉饰）：** travel 的前置条件要求"真实 issuer 或能拿到可验证测试凭证"；当前两者皆无外源。本记录以"自建测试 issuer 起步 + 真实 issuer 作为阶段 2 门槛 + day plan 回退"化解，**不等于条件已满足**。自建测试 issuer 只能验证协议与实现，不能验证产品价值（没有用户能拿它登机）。若不接受此化解，正确动作是改选 day plan——这是 §7.5 的原文要求，本记录选择"有条件偏离 + 明确回退"，责任在决策人。

### 7.7 暂定建议（不是决定）

若目前没有宿主约束，建议先用 **Day plan 作为协议与评估的测试夹具**：它不依赖 issuer/凭证发行，能更早验证持久化、冲突、提醒与 action 状态。但这只是"测试夹具"，不等于产品 beachhead；正式 beachhead 仍由真实宿主、用户、数据决定。

### 7.8 退出标准（三项检查，不是三方签字）

1–2 人团队没有独立三方，"三方签字"会变成自我签字。改为三项可验证的检查：

| # | 检查 | 通过标准 | 不通过示例 |
|---|---|---|---|
| 1 | 证据检查 | 10 个问题均有链接/文件/访谈记录，或明确写"未知且不影响首期"并说明影响边界；口头保证不算 | 6 个问题写"待定"，却已开始写 Wallet action |
| 2 | 边界检查 | 只选一个场景；action 只读/可逆；数据授权链、成功指标（含基线与测量方法）、放弃条件、未选方案原因均落盘 | action 写"发送到 Wallet"，但没有宿主能力清单/确认/幂等设计 |
| 3 | 反方检查 | 由未参与方案撰写的人（或至少不写实现的人）做一次"什么情况下会失败"审阅；异议逐条记录并回应 | 只有作者自己说"没问题"；或把 AI 子代理审阅当作独立人类审阅 |

**全过才算退出。** 没有独立审阅人时，决策记录必须标 `self-review`、列出未解决异议并明确接受风险，不能写成"三方签字通过"。

**一个具体的不通过案例：** 决策记录写"Travel 更有价值"，但 10 个问题里 6 个是"待定"；没有 issuer 测试凭据；action 边界写成"添加到 Wallet"；成功指标只有"用户喜欢"。即使三条路径的 demo 能跑，也不通过——它证明的是 artifact 能显示，不是 beachhead 能交付。

未达到 → 不进入 Domain Artifact Spec 与产品编码，可继续做 Protocol/Evaluation 规范研究。

---

## 8. 第四轮审阅：事实复核与未决批评 `[已处理，待重审]`

> 本章保留第四轮的原始批评以留痕。2026-11-02 晚：P0-1 已由附录 G 的实验回答（契约层 B；宿主/商业层 C）；P0-2 至 P0-6 已写回第 6 章；§8.3 的 8 项中 7 项已处理，第 3 项（taskList/checklist 字段 diff）留到阶段 0。剩余待决项不是这些批评，而是 beachhead 选择（第 7、9 章）。

### 8.1 事实复核（逐条回代码）

| 主张 | 结果 | 证据 |
|---|---|---|
| 30 块，8 interactive / 4 domain | ✅ | `clone/src/sdk/catalog.ts` |
| 适配器默认只转发 `select/step/view/filter`，`submit` 有意排除 | ✅ | `packages/adapter/src/index.ts:35` |
| `onAction` 异步失败只 `console.warn`，不回报块状态 | ✅ | 同上 `:105-113` |
| 协议无 action / 无 role / 无 answer 元数据 | ✅ 仅 8 种 op | `clone/src/iui/protocol.ts:1-9` |
| `set` 会让无自定义 setter 的块 remount | ✅ | `SDK.md:356` |
| 日历固定 UTC、格式化硬编码 `en-US` | ✅ | `insights.ts:36-56, 546`；`dom.ts:67` |
| 无 storage / SW / Notification | ✅ 全仓库无引用 | `clone/src`、`packages/*/src` |
| 25 任务、只测结构、无 provider 凭据 | ✅ | `bench/tasks.mjs`、`bench/README.md` |
| 有答案字节/操作数上限 | ✅ 512 ops / 1.5 MB / 192 KB | `clone/src/sdk/validate.ts:39-44` |

**两处需修正：**

1. **"没有宿主集成证据"过强。** `ROADMAP.md` 记载 rc.2/rc.3 有签名的 DSH 环境通过 live model call 与 action update，rc.4 通过自包含 tarball 的 toolview + action 测试。准确说法是"只有一条宿主路径、单个用例、rc 构建，未在生产宿主验证"。这影响动作选择：不是"从零开始"，而是"以现有 DSH 路径为 beachhead 起点"。
2. **文档集自相矛盾**（已由本文消除）：旧 `ANALYSIS` §6.2 说模型产出 `idempotencyKey`，`INTEGRATED` §7.2 说不得产出。

### 8.2 六个会导致返工的问题

> **处理状态（2026-11-02 晚）：** P0-1 已由附录 G 的预登记实验回答；P0-2 至 P0-6 已写回第 6 章。以下保留原始批评，便于重审时逐条对照。

**P0-1 中心假设从未被反证。** `[已回应：契约层判决 B，7 个卡点；宿主/商业层 C]` 方案自己写了"自定义块可以实现很多事"，却直接跳到"必须补 4 个契约 + 3 份 spec"。存在更省力的竞争解释：宿主真正缺的是**可抄的样例 + 数据接入**，不是协议。10 个必答问题里没有一个是"宿主现在自己怎么解决、成本多少"，因此无法证明 SDK 的存在价值。

> **建议：** 先做 3 天反证实验（用 `registerBlock` 写登机牌自定义块，接真实/半真实数据，跑通"打开→出示→离线再打开"），先写死判决规则：若 3 天内跑通且卡点 <3 个，则"契约是瓶颈"不成立，改为"样例 + recipe 文档"优先；若卡点集中在 action/state/provenance，则契约假设成立，且这些卡点就是 spec 的验收用例。

**P0-2 顺序错误：answer-level 契约需要改协议，却被排在阶段 3。** `[已修订：§6.3 P0-0a/P0-0b；§6.7 阶段 1]` `comp` 只有 `id/type/props`，无 role/slot，无 answer 级容器。所以"首屏必须有结论 + 主 artifact + 主行动"无法被测试、无法被模型遵守，只能在渲染层猜。这本质是协议变更，不是测试问题。同理 answer 级 `locale/timeZone/currency` 也缺载体。

> **建议：** Protocol Spec 从 10 项扩到 12 项，增加 **Answer Envelope**（answer 级 locale/timeZone/currency/units + 槽位/角色）与 **Host Capability Manifest**；布局契约前移到阶段 1 验收项。

**P0-3 凭证状态单轴化。** `[已修订：§6.3.4 双轴]` `offline/stale/expired/revoked/signature_invalid` 是一条扁平枚举，混了两个正交维度：完整性（签名/撤销/issuer）与新鲜度（过期/登机口变更/上次校验时间）。最危险的场景恰在交叉点：**签名有效、未撤销、未过期，但登机口从 D7 改成 D2**——单轴枚举无位置可放，UI 与主行动可用性无法定义。

> **建议：** 改为 `integrity: verified|unverified|invalid|revoked` × `freshness: live|stale|expired|unknown`，把"可出示/需提示/不可用"定义为两字段的函数。

**P0-4 能力协商缺失。** `[已修订：§6.3 P0-0b]` `ActionIntent` 只有 `name/args/confirmHint`，没有宿主能力清单。块有 catalog filter（`selectPromptBlocks`），action 侧却没有对应机制，模型会在无 Wallet 的宿主上生成"添加到 Wallet"，只能靠运行时失败兜底。

> **建议：** prompt/tool schema 加 `hostCapabilities`（`actions[]`、`canNotify`、`canPersist`、`canOpenWallet`），validator 在生成阶段拒绝未声明的 action。

**P0-5 field-level provenance 会打坏自己的指标。** `[已修订：§6.3.2 两级预算]` 每字段 12+ 子字段全由模型生成，而 bench 正在测 `TTFT` 与 `First block`；这些 token 很可能出现在第一个 `comp` 之前。1.5 MB 字节上限不是瓶颈，**token 与延迟才是**。

> **建议：** provenance 分两级（answer 级必填 + field 级仅高风险字段必填，其余继承）；写明"provenance 预算"；评估里把 provenance 开销作为独立指标。

**P0-6 DoD 不可满足，门禁会被绕过。** `[已修订：§6.7 两级 DoD]` L4 采用率/复用率需要宿主遥测，beachhead 期不存在；这种 DoD 只会被"临时豁免"，门禁随之失去权威。

> **建议：** 拆两级——Beachhead DoD（L1+L2+L3+安全+证据包）与 Production DoD（L4，延后，明确不在本期验收范围）。

### 8.3 八个次级问题

| # | 问题 | 建议 | 状态 |
|---|---|---|---|
| 1 | bill 的排除理由错：说"支付/合规风险"，但它给 bill 的形态本来就是只读审查 + 深链 | 改理由为**数据获取**（银行/账单/OCR），否则误导出"travel 风险最高"的排序 | 已改（§7.1） |
| 2 | travel 与 day plan 风险不同量纲：前者是外部依赖（有没有资产），后者是宿主权限（给不给权限） | 决策矩阵按"我方能否单方面获得该依赖"排序 | 已补（§7.1） |
| 3 | `taskList` 与 `checklist` 重复，后者已有 state path 与本地交互 | 先做字段 diff；能扩展就不新增块（新增块 = 模型多一个选择点） | 待做（阶段 0 字段 diff；本版不新增块） |
| 4 | 存储/离线快照的 PII 生命周期缺失，而它是最高风险的落盘点 | 补 TTL、登出清除、加密预期、字段级脱敏、删除入口 | 已补（§6.3 P0-3） |
| 5 | `expiresAt`、幂等保留期、对账窗口无不等式约束 | 写成硬约束（以 `createdAt` 为起点）：幂等保留期 ≥ 对账窗口 ≥ max(`expiresAt − createdAt`, `retryWindow`) | 已写死（§6.3.1） |
| 6 | 1–2 人团队的"三方签字"是自我签字 | 改为三项检查清单 + 明确的不通过示例 | 已改（§7.8） |
| 7 | 版本化没说 additive 还是 breaking | 明确 envelope 为 additive，否则 beachhead 无法在 0.2.x 交付 | 已明确（§6.3 P0-0） |
| 8 | 时间估算与范围不匹配：阶段 1 的 4–6 周要覆盖 action/授权/幂等/对账/补偿/审计/envelope/storage | 若周数仅表相对顺序则删除；若用于决策则按 1–2 人团队重估 | 已重估（§6.7） |

### 8.4 叙事层面的问题

"能讲清楚，不能办成"准确，但它被当成"必须补契约"的论据，而真实因果是：**SDK 是库，没有宿主，"办成"在物理上不存在**——不是缺契约，是缺执行者。契约是必要条件，不是充分条件。方案把必要条件写成了路线图，却缺一个商业前提：**谁愿意接 issuer、接数据、承担责任？**

结论：**spec 的篇幅应与证据量成正比。** 现在 beachhead 相关证据为零（ROADMAP 的 live DSH 检查不构成 beachhead 证据），却计划写三份 spec、每份十余项——比例是反的。

> **第五轮状态：** P0-1 实验补了"artifact 可做"的证据，但没有补 beachhead 证据；因此这条批评仍成立。第 6 章已把 P0 范围收缩到选中 beachhead 必需项，三份 spec 仍不应在 beachhead 前同时写完。

### 8.5 若采纳，建议的动作顺序 `[1–7 已执行；第 1 项部分完成；spec 未评审]`

| 顺序 | 动作 | 产出 | 消除 | 状态 |
|---|---|---|---|---|
| 1 | 3 天反证实验（自定义块登机牌 + 一个真实宿主） | 工时/卡点清单 + 判决 | P0-1 | ⚠️ 部分完成：三条路径/41 项检查通过，契约层 B（7 卡点）；宿主是本机最小页面，**真实宿主未验证**（附录 G） |
| 2 | Protocol Spec 清单 10 → 12 项 | 一页 diff | P0-2、P0-4 | ✅ 已完成（§6.3） |
| 3 | 凭证状态改双轴 | 状态表 + 可出示判定函数 | P0-3 | ✅ 已完成（§6.3.4） |
| 4 | 拆分 Beachhead / Production DoD | 两级验收表 | P0-6 | ✅ 已完成（§6.7） |
| 5 | provenance 定预算与分级 | 字段白名单 | P0-5 | ✅ 已完成（§6.3.2） |
| 6 | 重估阶段 1 工期（4–6 周覆盖 action/授权/幂等/对账/补偿/审计/envelope/storage 不现实） | 修订后的阶段表 | 8.3.8 | ✅ 已完成（§6.7；8–12 周） |
| 7 | 起草 Protocol / Evaluation Spec 草案（不选 beachhead） | 0.1-draft + 评审清单 | 为阶段 0 做准备 | ✅ 已完成（`specs/`）；**未评审、未实现** |

1–7 已执行，但**第 1 项只完成本机实验**：它给出的是**契约层 B**；宿主/商业层仍是 **C**，需要真实宿主实验才能升级。**下一步是评审 spec、重审第 6 章并回答第 9 章四问，不是直接进入阶段 1。** 在 beachhead 未定时，只可评审/裁剪 Protocol/Evaluation Spec，不写产品代码。

---

## 9. 待你确认的四件事

**2026-11-03 已回答**（用户决策，1–9 项）：

1. **首个宿主类型：DSH（现有路径）**。
2. **目标开发者：用户本人 + 外部客户**（首期以本人集成验证为准）。
3. **首期选择：Travel pass**——有条件：见 §7.6.1 决策记录（自建测试 issuer 起步，真实 issuer 为阶段 2 门槛，到期拿不到切 day plan）。
4. **真实数据：完全没有**；DSH action 接口可用。数据以自建测试 issuer 起步。

由此确定的下一步：Domain Artifact Spec（travel/pass）现在可以起草；Protocol/Evaluation Spec 的 P0 子集按 travel 列裁剪（spec §1.3）；阈值与 8 个未决问题的建议答案已起草（spec §7.4、§20），待确认。

**P0-1 实验已经回答了什么：**

- 自定义块能做出可用 artifact：登机牌块约 450–600 行，一个工作会话跑通"打开 → 出示 → 离线再打开"。
- **只补样例 + 数据接入不够**：记录到 7 个卡点，宿主必须为每个 artifact 重写 trust、快照、action 结果与 i18n 胶水。
- "契约是瓶颈"在契约层成立（判决 B），且 §6.4 的验收用例可以直接复用；宿主/商业层仍是 C，不能据此选 beachhead。
- 实验没有回答商业前提，也没有验证真实宿主/issuer/用户；因此它**不能替你做 beachhead 选择**——选择由上面的用户决策作出，张力记录在 §7.6.1。

**仍未关闭的：** 最终用户细分（§7.6.1 未解决异议 ①）、阈值确认（spec §7.4 草案）、8 个未决问题确认（spec §20 建议）、第 12 项——方案最终批准。**不要**在协议未通过评审前上线任何副作用 action；Domain Artifact Spec 只写 travel/pass 一个。

---

## 10. 明确不做的事

- 不继续增加通用 block。
- 不把三个 recipe 并排上市。
- 不让模型决定权限或生成可信验证结果。
- 不把 `unknown` 当失败直接重试。
- 不用二维码/卡片外观代替凭证有效性。
- 不用 25/25 mock benchmark 证明产品能力。
- 不把 AI 子代理审阅称为人类专家审计。
- 不在没有证据包的情况下宣称"已验证"。
- ~~方案未获批准前，不实施产品代码。~~（方案已于 2026-11-04 批准；阶段 1a 实现解锁，边界仍受 §6.7 门禁约束）

---

## 11. 开源标准（2026-11-04 新增：用户指令"此 SDK 需要开源，按照开源标准来"）

### 11.1 现状盘点 `[已确认]`

| 项 | 状态 |
|---|---|
| 许可证 | ✅ MIT（LICENSE、NOTICE.md 齐备） |
| 治理文件 | ✅ CONTRIBUTING、CODE_OF_CONDUCT、SECURITY、SUPPORT、issue/PR 模板 |
| CI/发布流水线 | ✅ ci.yml、release.yml、dependabot |
| 英文文档 | ✅ README/SDK/ADAPTERS/ROADMAP 均为英文（ASD-STE 检查强制） |
| **npm 发布** | ❌ **未做**——只能 GitHub 安装；"开源 SDK"不可 `npm install`，SECURITY.md 声称支持的 0.2.x 无可支持对象（ROADMAP 下一任务 #1） |
| 决策/规范语言 | ⚠️ 本文与 specs/ 为中文工作稿（check:docs 已豁免）——以社区为采用目标时对外不可读 |
| 证据自动化 | ⚠️ P0-1 的 41/41 复现依赖本机 Chrome 与手工步骤，贡献者无法自动验证 |

### 11.2 开源约束对方案的影响（决策）

1. **"外部客户" = 开源社区。** 采用路径是 npm + 通用适配器（React / AI SDK / MCP Apps），不是 DSH。DSH 只是 beachhead **验证宿主**，不是分发渠道——两者不得混淆。
2. **npm 发布升为阶段 1a 的并行轨道。** 0.2.2 先上 npm（稳定基线，让 1a 的契约工作有可回退的发布锚点，也让 IntegrationCost 可测）。发布需要用户完成：确认 `@intelligent-ui` scope 归属与 npm 凭据；其余（打包核验、发布清单）由 Agent 准备。**在 npm 发布完成前，不宣称"支持开源采用"。**
3. **PROTOCOL-SPEC 英译是阶段 1 的退出条件**（它是外部贡献者要读的规范性文档）；本文与 EVALUATION-SPEC 的英译可以到 0.3.0 发布前完成。中文工作稿与 check:docs 豁免是**工作状态**，不是永久状态。
4. **证据进 CI 是阶段 1 的退出条件**：P0-1 类验证（含 seal/篡改用例）必须能在 CI 一键复跑，否则"可复现"只对本机成立。
5. **决策记录规范化**：本文附录 F 的变更记录已按 ADR 精神运作；若外部贡献者开始参与，再拆分为独立 ADR 文件，不提前做。

### 11.3 开源不改的事

- MIT 不变；beachhead 决策不变（开源反而支持"自建测试 issuer"路径：社区可复现、可贡献 issuer 集成）。
- 不为开源而降低安全门槛：8 条硬阻断、反方检查、证据纪律对社区贡献一视同仁。

---

## 附录 A：30 个块与个人生活适配度

适配度为 0–2 粗判（0 = 主要面向工作/技术，1 = 可间接用于生活，2 = 直接对应生活场景）。

| 块 | 类型 | 用途 | 适配 |
|---|---|---|---|
| collage | media | 不对称 hero 图 | 2 |
| strip | media | 等宽图条 | 2 |
| rtHero | media | 三图 mosaic | 2 |
| pair | media | 双图对比 | 2 |
| figure | media | 单图 + caption | 2 |
| mediaRow | media | 图片卡片行 | 2 |
| chips | layout | 标签 | 1 |
| tabs | layout | 标签页（panel 仅字符串） | 1 |
| tiles | layout | 图标 tile 网格 | 1 |
| card | content | 通用摘要卡 | 1 |
| chart | content | 折线/柱/面积 | 1 |
| stats | content | KPI 卡 | 1 |
| timeline | content | 时间线 | 1 |
| matrix | content | 对比矩阵 | 1 |
| formula | content | 公式/计算 | 1 |
| code | content | 代码 | 0 |
| diff | content | diff | 0 |
| fileTree | content | 文件树 | 0 |
| calendar | interactive | 月历（固定 UTC） | 2 |
| checklist | interactive | 勾选清单 | 2 |
| packing | interactive | 打包清单 | 2 |
| form | interactive | 单选表单 | 2 |
| calculator | interactive | 数量缩放 | 2 |
| flashcards | interactive | 翻卡 | 2 |
| map | interactive | 示意地图 | 2 |
| steps | interactive | 步骤指南 | 2 |
| menu | domain | 菜单 | 2 |
| outfitGrid | domain | 穿搭网格 | 2 |
| dayList | domain | 逐日列表 | 2 |
| bike | domain | 自行车图解 | 0 |

## 附录 B：视频时间线速查

```
0.0  user message
1.0  prose starts
2.0  prose ends; card begins
2.5  card fades in
5.0  full card + explanation
7.5  QR thumbnail hover/focus/click
8.5  QR overlay + Done
10.5 back to card
11.0 CTA hover
12.0 Sending...
13.0 Sent + Wallet confirmation
16.0 end
```

## 附录 C：网站 11 个 tab 速查

```
Metrics      ∂C/∂p      首屏覆盖率/梯度
Optimize     Gradient   设备分布上的约束优化
Prove        Intervals  区间算术 + branch & bound
Breakpoints  f′(x)      跳变/折弯枚举
Resize       f + JΔ     分段仿射预测
Transition   Paths      改变顺序/测地线
Signal       Fourier    压缩/小波/采样/舍入
Direction    ∂f/∂p      每个 prop 的卡片速度
Motion       σ(a/τ)     软化布局/动画
Average      Integral   设备分布上的期望
Imagine      W ∈ ℂ      复平面/极点/抬升
```

## 附录 D：证据索引

| 证据 | 路径/URL | 状态 |
|---|---|---|
| 视频元数据 | `ffprobe _8rsEHcacgrK83pH.mp4`（原文件仍在根目录） | 可复现 |
| 视频关键帧 | 原在本地临时目录（`/private/var/folders/...`），非 `recon/` | **可能已丢失，需重抽** |
| 网站 11 tab 文本 | 原在 `recon/` | **已删除，不可复现** |
| 网站桌面/390/768 截图 | 原在 `recon/` | **已删除，不可复现** |
| 30 块目录 | `clone/src/sdk/catalog.ts` | 可复现 |
| 协议 op 定义 | `clone/src/iui/protocol.ts` | 可复现 |
| 验证与上限 | `clone/src/sdk/validate.ts:39-44` | 可复现 |
| 行动策略 | `packages/adapter/src/index.ts:35,105-113` | 可复现 |
| 状态更新语义 | `SDK.md:345-358` | 可复现 |
| 安全条款 | `SDK.md` 第 12 节、`clone/src/iui/security.ts` | 可复现 |
| 日历/图表 i18n | `clone/src/iui/components/insights.ts` | 可复现 |
| 基准 | `bench/README.md`、`bench/tasks.mjs`、`bench/lib/scoring.mjs` | 可复现（未跑真实模型） |
| 路线图 | `ROADMAP.md`（含 live DSH 验证记录） | 可复现 |
| 30 块宽度测试 | `test-results/gallery/`（gitignore） | **未提交** |
| P0-1 判决规则 | `experiments/pass-spike/DECISION-RULE.md` | 可复现（写码前预登记） |
| P0-1 实验代码 | `experiments/pass-spike/src/` | **工作区可复现，尚未提交 git** |
| P0-1 自动验证 | `experiments/pass-spike/evidence/verify.json`（41/41） | 可复现（需本机 Chrome + 先 build core）；**2026-11-03 第六轮审阅时独立复跑，41/41 通过** |
| P0-1 截图 | `experiments/pass-spike/evidence/`（10 张） | 可复现（随 `verify.mjs` 重生成） |
| P0-1 卡点与判决 | `experiments/pass-spike/BLOCKERS.md` | 可复现（依赖上述实验证据） |
| Protocol Spec 草案 | `specs/PROTOCOL-SPEC.md` | **0.1-draft，待审；未实现** |
| Evaluation Spec 草案 | `specs/EVALUATION-SPEC.md` | **0.1-draft，待审；未实现** |
| Spec 评审清单 | `specs/README.md` | **0.1-draft，待审** |
| 代码基线 | `dcd1cc6` / `v0.2.2-3-gdcd1cc6` | 可追溯 |

**可复现性结论：旧证据不足，P0-1 实验证据可复现。** 视频关键帧与网站抓取仍不可复现；P0-1 实验有预登记规则、代码、41 项自动检查、10 张截图与判决，但尚未提交 git，且依赖本机 Chrome 与 core build。发布或交给研发前至少应提交：关键帧与时间戳、浏览器版本/访问日期/截图/DOM 结果、30 块测试脚本与完整输出、benchmark 任务清单/模型版本/真实执行记录、第一轮代理提示词与合成规则，以及 `experiments/pass-spike/`（含 `evidence/`）本身。

## 附录 E：术语

- **答案表面（answer surface）**：聊天中助手回答所占区域，不含宿主聊天壳。
- **artifact**：承载一个生活物件的复合 UI，如登机牌、账单、收据。
- **recipe**：把多个块/字段/行动组合成领域模板的配方。
- **action lifecycle**：`proposed → awaiting_confirmation → authorized → running → succeeded/failed/cancelled/expired`；结果未知时 `unknown → reconciling → succeeded/failed/cancelled/manual_review`；补偿独立管理，不是状态。
- **provenance**：字段级来源、获取/观测时间、有效区间、校验状态、假设、置信度类型。
- **breakpoint**：布局函数中发生跳变（jump）或折弯（kink）的输入点。
- **invariant**：给定输入范围内必须始终成立的布局/交互规则。
- **beachhead**：首批只选一个宿主类型、一个人群、一个主 job 的落地切口。

## 附录 F：文档沿革

| 时间 | 文档 | 处置 |
|---|---|---|
| 2026-10-29 | `ANALYSIS-2026-10-29.md` | 初版分析；内容已被 `INTEGRATED` 吸收 → 已删除（并入本文 §3–5） |
| 2026-10-29 | `REVIEW-2026-10-29.md` | 第一轮三视角 AI 子代理审阅合成 → 要点并入本文 §5、附录 F → 已删除 |
| 2026-10-30 / 10-31 | `INTEGRATED-REPORT-2026-10-30.md` v2 | 整合版；第二、三轮审阅后冻结为方向基线 → 本文第 3–6 章 → 已删除 |
| 2026-11-01 | `NEXT-PHASE-PLAN-2026-11-01.md` | 下一阶段工作包与门禁 → 本文 §6.7、§9 → 已删除 |
| 2026-11-01 | `BEACHHEAD-DECISION-2026-11-01.md` | 决策框架与证据采集 → 本文第 7 章 → 已删除 |
| 2026-11-02 | `REVIEW-2026-11-02-PLAN-CRITIQUE.md` | 第四轮代码级复核 → 本文第 8 章 → 已删除 |
| 2026-11-02 | **`INTELLIGENT-UI-PLAN.md`**（本文） | 单一事实源 |
| 2026-11-03 | `specs/PROTOCOL-SPEC.md`、`specs/EVALUATION-SPEC.md` | 0.1-draft，待审；不替代本文决策 |

> 六份原件于 2026-11-02 移入废纸篓；若废纸篓尚未清空则可恢复（本次复核因系统权限无法直接验证）。本文是唯一在用的方案文档；**请勿再从旧文件名引用**。

**四轮审阅与第五轮整合的结论演变：**

1. **第一轮**（AI 子代理，架构/产品/UIUX）：三视角均"有条件通过"；指出行动安全顺序、recipe 依赖、评分口径、布局契约、i18n/a11y 问题。
2. **第二轮**（外部专业意见，10-31）："方向认可，重大修改后方可进入实施设计"；修正状态机、`unknown` 对账、`risk`≠授权、三 recipe 路线矛盾、字段级 provenance、Pass/Wallet 低估、19/33 误读、τ 表述、AI 子代理被称"专家"、证据不可复现、5 秒/样本量被当标准、主行动首屏要求过绝对、WCAG 例外、评估层次、三份 spec 前置。
3. **第三轮**（11-01）："有条件通过，暂不建议直接进入正式开发"；报告冻结为方向基线，转入 Beachhead Decision 与三份 spec。
4. **第四轮**（11-02，本文第 8 章）：诊断成立、路线不成立；6 个返工级 + 8 个次级问题；建议先做 3 天反证实验再修订 spec。
5. **第五轮**（11-02 晚，整合 + P0-1 实验）：按预登记规则完成反证实验，**契约层判决 B**、宿主/商业层仍为 C；§8.5 第 2–6 项写回第 6 章，§8.3 的 7 项写回第 6、7 章。第 8 章的批评不再是"未裁决"，而是"已处理、待重审"；beachhead 四问仍开放。

**变更记录：**

- 2026-11-02（晚，第五轮整合复核）：修复"两位/三位"笔误（§2.1）、§6.7 交叉引用错误（8.3.6 → 8.2 P0-6）、附录 D 视频关键帧位置误标（原在临时目录，非 `recon/`）；恢复整合时丢失的内容——Protocol Spec 十件事（§6.3）、协议测试清单（§6.3.3）、Domain Artifact Spec 范围（§6.4）、评估体系八项与硬阻断清单（§6.6）、"可操作文档"教训（§4.3.7）、证据包结构（§2.4）、时间估算批评（§8.3.8）。
- 2026-11-02（深夜，P0-1 实验修订）：完成预登记反证实验（契约层判决 B、宿主/商业层 C，7 个卡点）；按 §8.5 第 2–6 项修订——Protocol Spec 扩为 12 项并新增 Answer Envelope / Host Capability Manifest（§6.3）、凭证状态改双轴（§6.3.4）、provenance 两级预算（§6.3.2）、DoD 拆两级并重估工期（§6.7）；并处理 §8.3——Bill 排除理由改为数据获取（§7.1）、退出标准改三项检查（§7.8），第 3 项字段 diff 留到阶段 0；§8.2/§8.3/§8.5 标注处理状态、§9 区分实验已回答与仍待决、附录 D 增实验证据、附录 G 增实验摘要。未改产品/core 代码。
- 2026-11-03（spec 草案）：新增 `specs/PROTOCOL-SPEC.md`（12 项契约、pass/storage profile、C1–C24 conformance 矩阵）、`specs/EVALUATION-SPEC.md`（L1–L4 + S、指标公式、门禁、证据包、P0-1 映射）与 `specs/README.md`（评审清单/开放决策）。均为 0.1-draft，未实现、未评审、不替代本文决策。§6.3/§6.6/§9/附录 D 增加草案链接；并对齐 §6.3.1 状态图、§6.3.2 类型与幂等约束（时距形式、`reconciling`/`manual_review`、`authority` 归属）；新增附录 H 作为 spec 决策回写索引。
- 2026-11-03（晚，第六轮审阅）：对 P0-1 实验与 spec 草案做独立核验——确认 `DECISION-RULE.md` 预登记时间戳（22:14）早于全部实验代码；**独立复跑 `verify.mjs`，41/41 通过**；核实 C1–C24、硬阻断清单与附录 H 对应关系。修正三处：附录 E action lifecycle 补 `reconciling`/`manual_review`；附录 G.3 标注 41 项中含负向断言（"41/41"≠"无缺陷"）；附录 G.4 增加批注——"必须改协议"应读作"应由平台契约吸收"（B1/B2/B5/B6/B7 有宿主侧变通，B3/B4 未能安全绕过），不影响判决 B。附录 D 记录独立复跑。**审阅结论：修订通过重审，可进入 spec 评审与 beachhead 决策。**
- 2026-11-03（22:52，用户决策落地）：用户回答决策 1–11——宿主 DSH；开发者本人 + 外部客户；beachhead **有条件选定 travel/pass**；数据完全没有（自建测试 issuer 起步，真实 issuer 为阶段 2 门槛，day plan 回退）；反方检查由 AI 反方承担；第 8 条硬阻断采纳；证据提交 git；spec 中文豁免。新增 §7.6.1 决策记录（含与 §7.5 前置条件的张力记录）；§9 四问标记已答；§6.6 硬阻断扩为 8 条；PROTOCOL-SPEC §1.3 Travel 列激活、§20 附 8 条建议答案；EVALUATION-SPEC §7.1 第 8 条采纳、§7.4.1 阈值草案；`scripts/check-docs.mjs` 增加 specs/experiments/plan 中文豁免。
- 2026-11-04（受托决策 + 反方检查 + 批准）：用户授权全部决策（原则"正确的方法做正确的事情"）并指令按开源标准交付。执行独立 AI 反方审阅：4 项发现全部处置——**F1** 回退成本低估 → 阶段 1 拆 1a（beachhead 无关契约，4–5 周）/ issuer 主动门槛（1a 末检查，未过即切 day plan，沉没成本仅 1a）/ 1b（travel 专属，3–5 周），外联从 1a 第一周并行；**F2** DSH 单点/作者自测 → 记录为风险，阶段 2 加非作者第二探针；**F3** 快照 seal 改双层（issuer 签名权威 + 宿主 HMAC 尽力、密钥 non-extractable、同源妥协边界入威胁模型，PROTOCOL-SPEC §15.3、新增 C25）；**F4** 状态机统一 `authorize` 事件、新增 `reconcile_timeout`（PROTOCOL-SPEC §8，0.2-draft）。EVALUATION-SPEC：真实模型 TaskCompletion 降为形成性（n=20 无法区分 60/75）、IntegrationCost 降为记录性。§7.6.1 签署批准（受托决策，用户保留推翻权）。新增 **§11 开源标准**（npm 发布为 1a 并行轨道、PROTOCOL-SPEC 英译与证据进 CI 为阶段 1 退出条件、DSH=验证宿主≠分发渠道）。新增 `specs/DOMAIN-ARTIFACT-SPEC.md`（travel/pass，0.1-draft，C26–C32）。**阶段 1a 实现解锁。**

---

## 附录 G：P0-1 反证实验摘要（2026-11-02）

> 目的：在写产品代码前，反证中心假设——"宿主真正缺的是可抄的样例 + 数据接入，不是协议契约"。
> 预登记规则先于实验代码写入 `experiments/pass-spike/DECISION-RULE.md`，防止事后调整通过标准。

### G.1 判决规则（先写死）

| 判决 | 条件 | 行动 |
|---|---|---|
| **A** 契约不是瓶颈 | 三条路径全通；卡点 <3；无卡点落在 action/state/provenance；不改 core 即可稳定产出 | 优先补样例、recipe 文档、数据接入 |
| **B** 契约是瓶颈 | 三条路径中有一条必须改 core/protocol 才能可靠跑通；或卡点 ≥3 且至少两类落在 action/state/provenance；或模型可产出"看起来有效"的 pass 而 SDK 无法区分 `integrity`/`freshness`、无法阻止伪造 `verified` | 卡点转为 Protocol Spec 验收用例；按 §8.5 第 2–6 项修订 |
| **C** 证据不足 | 非真实宿主；半真实数据不能代表 issuer；QR/离线路径未真正验证 | 只记录证据缺口，不据此改路线 |

### G.2 实验设置

| 项 | 内容 |
|---|---|
| 集成方式 | 只用公开 `registerBlock` + `registerBlockSpec`；**未改 core / protocol / validator / adapter** |
| Artifact | 登机牌：航司、航班、AMS→LIS、当地时间、登机口、座位、分组、乘客、预订号、真实 QR |
| 数据 | 半真实 issuer fixture：正常 D7、登机口变更 D2、未验证、撤销、签名无效 |
| 三条必需路径 | ① 打开：结论 + pass + 解释；② 出示：真实 QR 被 jsQR 解码；③ 离线再打开：断网/重载后从宿主快照恢复 |
| 额外路径 | 本地快照篡改、模型伪造 `verified`、撤销、zh-CN、320/720 px |
| 自动验证 | Playwright + 真实 QR 解码；41 项断言；10 张截图；`evidence/verify.json` |
| 宿主 | 本机最小宿主页面，**不是生产宿主**；这是最大外部效度限制 |

### G.3 结果

| 路径 | 结果 | 证据 |
|---|---|---|
| 打开 | 通过：结论 + 主 artifact + 一个主行动；400/456 px 正常，320 px 无页面/卡片横向溢出 | `evidence/01-online.png`、`10-320px.png` |
| 出示 | 通过：真实 QR（37×37 modules）被标准解码器读出，内容与 payload 一致；原生 `<dialog>` 可关闭、焦点返回 | `evidence/02-qr.png`、`05-offline-qr.png` |
| 离线再打开 | 通过：强制离线 + 重载后从 `localStorage` 快照恢复；显示 `Verified` + `Saved copy` + 登机口冲突（缓存 D7 / 最后在线 D2） | `evidence/04-offline-stale.png` |
| 自动检查 | **41/41 通过**；控制台无错误 | `evidence/verify.json` |

**重要：三条路径全通，但这不证明"不需要契约"。** 它只证明"自定义块能做 artifact"。

**"41/41"不是"41 项质量全过"。** 其中至少 2 项是**负向断言**——确认缺陷存在（`tamper is not detected`、`offline conclusion still says D7`），另有 findings F1–F4 单独记录缺陷。41/41 的含义是"实验记录与预登记预期一致"，不是"实现无缺陷"；缺陷转为验收用例（§6.4）。

### G.4 七个卡点

| # | 卡点 | 层 | 实验表现 | 是否必须改协议 |
|---|---|---|---|---|
| B1 | 模型 props 无法绑定可信验证者 | 协议/证据 | 模型写 `integrity:"verified", producer:"issuer"` 时第一版直接显示 Verified；加宿主 attestation 后又会把上一张凭证的状态借给伪造凭证，必须显式比对 `credentialId` | **是**：模型数据与宿主验证结果分离 |
| B2 | 凭证状态没有双轴 schema | 协议/块契约 | `integrity × freshness` 由块自己发明；"签名有效 + 未撤销 + 已过期未验 + 登机口已变"没有单一枚举位置 | **是**：标准双轴 + 可出示判定函数 |
| B3 | 离线快照没有完整性保护 | 存储/证据 | 直接改 `localStorage` 的 gate D7→D9，仍显示 `Verified` + `Saved copy`；块无法发现 | **是**：快照签名/宿主密封摘要 + TTL/登出删除 |
| B4 | 没有 answer-level 槽位，prose 与 artifact 会互相矛盾 | 协议/answer envelope | 离线重载后结论仍写 "Gate D7"，同一答案里 pass 又显示最后在线 D2；结论是独立 `md` op，无法绑定 freshness | **是**：Answer Envelope |
| B5 | 行动没有 result / 状态 / 幂等 / 能力清单 | 协议/adapter | Wallet/Refresh 只是 `ctx.emit`；宿主用模块级状态 + DOM 事件重绘；重复点击靠宿主 guard；默认 adapter policy 会丢掉 `wallet`/`refresh`；block 硬编码能力 | **是**：Action State Machine + result + idempotency + capability manifest |
| B6 | 持久化没有契约 | 协议/存储 | 快照是宿主自定义 schema；无 storage adapter、无 user/model/derived、无跨设备、无冲突策略 | **是**：storage 契约 + 状态归属 + TTL/清除 |
| B7 | answer-level locale 缺失 | 协议/answer envelope | locale 只能塞进 block props；块内维护 en/zh 两套字符串；结论写两遍；SDK chrome/action envelope 仍英文 | **是**：answer 级 `locale/timeZone/currency/units` |

> **"是否必须改协议"的准确含义（第六轮审阅批注）：** B1/B2/B5/B6/B7 在本实验中都有宿主侧变通——attestation 比对 `credentialId`、块内自造双轴、模块级状态 + 重复点击 guard、`localStorage`、双份字符串。能绕过，但**每个宿主都要重写**，且 B1 的第一版就做错了（把上一张凭证的 attestation 借给伪造凭证）。B3/B4 在本实验中**未能安全绕过**（快照篡改不可检测、结论与 artifact 的新鲜度无法绑定）。因此该列应读作"**是否应由平台契约吸收**"（跨宿主复用、不易做错），不是"物理上不可能绕过"。这不影响判决 B：预登记规则的第二个析取条件（卡点 ≥3 且至少两类落在 action/state/provenance）独立成立。

### G.5 判决（分层，避免超出预登记规则）

按预登记规则做两层判定：

**契约层（B 条件）**

- 三条路径全部跑通 ✅
- 卡点总数 = **7**（≥3）❌ A 的必要条件不满足
- 卡点覆盖 provenance/trust、state、action、answer envelope、i18n 五类，其中至少两类落在 action/state/provenance ✅

→ **契约层判决 B："契约是瓶颈"成立。**

**宿主/商业层（C 条件）**

- 实验环境不是生产宿主（本机最小页面）→ 触发 C
- issuer 是 fixture，签名是占位符 → 触发 C
- 没有真实用户/开发者/宿主访谈 → 触发 C

→ **宿主/商业层判决 C：证据不足，不能据此选 beachhead，也不能宣称产品结论。**

**因此全文的"判决 B"均指契约层 B，不是预登记规则中的完整 B。** 补做真实宿主实验后，宿主/商业层才能从 C 升级；在此之前，第 9 章四问仍开放。

三条补充：

1. **Artifact 本身不贵。** 登机牌块 + QR + 响应式样式约 450–600 行，三条路径在一个工作会话内跑通。
2. **贵的是 artifact 之外的东西。** 为了让"已验证/已撤销/离线/可出示"可信，宿主必须补约 200 行信任、快照、行动结果与 i18n 胶水；换一个宿主还要重写。这正是契约应吸收的部分。
3. **实验没有证明商业前提。** 没有真实 issuer、真实宿主、真实用户；不能回答"谁愿意接 issuer/数据/责任"。

### G.6 对计划的影响

| 计划位置 | 修订 |
|---|---|
| §6.3 Protocol Spec | 10 项 → **12 项**，新增 Answer Envelope 与 Host Capability Manifest |
| §6.3.4 凭证/离线 | 单轴枚举 → **`integrity × freshness` 双轴** + `presentability()` |
| §6.3.2 provenance | 全字段必填 → **answer 级必填 + 高风险字段必填**；provenance 开销独立计量 |
| §6.4 块层 | Travel `pass` 增加 attestation、双轴、`latestKnown` 冲突、可见放大按钮；新增 8 条验收用例 |
| §6.7 DoD | 拆 **Beachhead DoD / Production DoD**，L4 延后；阶段 1 重估为 8–12 周 |
| §7.1 Bill | 排除理由改为**数据获取**，不是支付风险；补充 travel/day plan 风险轴不可相加 |
| §7.8 退出标准 | "三方签字" → **证据/边界/反方三项检查** + 不通过示例 |
| §9 | 区分"实验已回答"与"四问仍未回答" |

### G.7 限制

- **不是真实宿主**：没有 DSH/生产聊天壳的容器、权限、身份、遥测；只测了 320/456/720 px。
- **不是真实 issuer**：签名是占位符；撤销/刷新是本地 fixture；QR 只证明"可被标准解码器读出"，不证明机场闸机可扫。
- **不是用户研究**：没有目标用户、任务观察、可用性测试。
- **不是无障碍/安全审计**：只做了原生 dialog、44px、320 px 溢出和对比度目检。
- **不是人类 3 天**：实验由一个 AI agent 在一个工作会话内完成；工时不能直接换算成人天。
- **未提交 git**：实验目录仍在工作区；复现依赖本机 Chrome 与 `npm run build:core`。
- **未验证商业前提**：没有宿主/开发者/用户访谈，不能据此选 beachhead。

### G.8 复现

```bash
# 1. 构建 core（实验消费 clone/dist-lib）
npm ci
npm run build:core

# 2. 安装并验证实验
cd experiments/pass-spike
npm install
npm run build
node verify.mjs
```

输出：`evidence/verify.json`、`evidence/*.png`、控制台 41/41。要求本机有 Chrome（脚本先试 `channel: "chrome"`，失败回退 Playwright Chromium）。复现细节与卡点全文见 `experiments/pass-spike/README.md` 与 `BLOCKERS.md`。

---

## 附录 H：Spec 草案索引与回写状态

> 本文是**决策事实源**；`specs/*` 是受控规范附件。下表保证每个 spec 的**决策性变更**都能从本文追溯，避免“只写在附件里、计划不知道”。

| Spec 位置 | 内容 | 本文对应 | 回写状态 |
|---|---|---|---|
| Protocol §1.3 | P0 子集（Travel / Day plan） | §6.2、§6.7 | 待 beachhead 选定后裁剪 |
| Protocol §3–4 | Answer Envelope / 槽位 / locale | §6.3 P0-0a、§6.5 | 已回写摘要 |
| Protocol §5、§7–13 | Action Intent / 授权 / 状态机 / 幂等 / 错误 / 重试 / 对账 / 补偿 / 审计 | §6.3 P0-1、§6.3.1、§6.3.2、§6.4 | 已回写约束与验收 |
| Protocol §6 | Host Capability Manifest | §6.3 P0-0b | 已回写 |
| Protocol §14 | provenance / authority / 新鲜度 | §6.3.2 | 已回写 |
| Protocol §15 | pass profile / `integrity × freshness` | §6.3.4、§6.4 | 已回写验收 |
| Protocol §16 | storage / state ownership / PII | §6.3 P0-3 | 已回写 |
| Protocol §17–18 | 验证规则 / C1–C24 conformance | §6.3.3、§6.4 | 已回写验收 |
| Evaluation §3–7 | L1–L4 + S / 指标 / 门禁 | §6.6、§6.7 | 已回写门禁 |
| Evaluation §8–10 | 样本量 / 评分者一致性 / 反方审阅 | §6.6、§7.8 | 已回写摘要 |
| Evaluation §11 | 证据包 / Evaluation Card | §6.7、§7.8 | 已回写 |
| `specs/README.md` | 评审清单 / 开放决策 | §9、附录 D | 已链接 |

**回写规则：** 附件新增或修改**决策性内容**时，必须同时在本文 §6/§7/§8/§9 或附录 F 留下对应条目；只改附件、不改本文，视为未完成回写。附件与本文冲突时，以本文为准。
