# Intelligent UI Domain Artifact Spec: Day Plan

| 项目 | 内容 |
|---|---|
| 版本 | 0.3-implemented-slice |
| 状态 | **Day plan Beachhead 已完成实现（2026-11-20）**；Travel/pass 仍保留 mock/fallback；真实 issuer 不在 Day plan 验收依赖。核心/DSH 已实现 payload 验证、PII、overdue reconcile、存储/offline、a11y/键盘/focus、Notification/Calendar host execution 与 acceptance A1–A11；Playwright 5/5、Node 86/86、CI 通过。Stage 2 real issuer、npm publishing 仍按先前约定等待外部条件。 |
| 上游 | `INTELLIGENT-UI-PLAN.md` §6.7/§7.6.1；`specs/Protocol-Spec.md` §16；`ADAPTERS.md` §7.2 |
| 语言 | 中文工作稿（check:docs 豁免） |

---

## 0. 摘要

Day plan 的核心 job 是：管理今天要做的事，并在正确时间提醒。本文定义 `taskList` / `reminder` artifact 的字段、校验、状态、行动、冲突、离线合并与降级。

它不同于 Travel pass：不处理 Ed25519 凭证、不写Wallet、不写日历，首期不声称标准日历重复规则或跨设备同步。

## 1. 范围与非目标

**在范围内**：

- `taskList` / `reminder` artifact；
- 任务：标题、正文/附件、优先级、截止时间、完成状态、重复规则、完成历史；
- 提醒：时间、延迟、失败降级、重试、推送/toast；
- 状态优先级：用户/宿主状态 > 模型草稿 > 派生状态；
- 离线修改队列与合并；
- 过期任务、重复任务、截止日期变更、完成状态恢复；
- 只读深链/导航到宿主任务、日历、通知权限引导。

**首期不在范围内**：

- 真实 issuer、Wallet、airport scanner、实体日历同步、支付、取消、多源合并、云同步、自动写入日历；
- Travel pass 的 Snapshot/TTL/撤销状态；
- 删除任务、取消完成、任意主动 side-effect。

## 2. 数据模型

### 2.1 TaskProfile（规范性）

```ts
type TaskStatus = "pending" | "done" | "overdue" | "cancelled";
type Recurrence = "once" | "daily" | "weekdays";

type TaskProfile = {
  id: string;                  // host-owned, persisted
  title: string;
  description?: string;
  status: TaskStatus;
  priority?: 0 | 1 | 2 | 3;
  deadlineAt?: string;         // local date + time? use IANA? simplest: local ISO without timezone? Use `deadlineAt?: string` host-local ISO? 
  reminderAt?: string;
  recurrence?: Recurrence;
  completedAt?: string;
  userFacts?: string[];
};
```


### 2.2 TaskListPayload

```ts
type TaskListPayload = {
  kind: "day-plan";
  version: "1.0";
  hostTimeZone?: string; // preferred; if absent, host supplies local time display and treats times as host-local
  tasks: TaskProfile[];
};
```

## 3. 行动

| Action | Shape | Risk | Notes |
|---|---|---|---|
| `show_task` | `id` | read | Open/focus task details in host. |
| `complete_task` | `id` | reversible? | User can reopen; mark done. |
| `open_calendar` | `rangeStart`/`rangeEnd`? | read | Navigate to calendar range. |
| `set_reminder` | `taskId`, `reminderAt` | reversible | Change host reminder; save into artifact? host-owned. |
| `request_notification` | `taskId` | read | Ask host to schedule notification; host may deny. |
| `host_conflict_report` | `taskId`, `reason` | read | Report host-side state conflict to agent/user. |

`complete_task` and `set_reminder` are not irreversible by protocol; they are reversible by host/user. No irreversible actions in Day Plan.

## 4. 状态机

```text
pending
  -> done (complete_task)
  -> overdue (host clock passes deadlineAt while pending)
  -> cancelled
done
  -> pending (user reopens; reversible)
cancelled
  -> pending (host/user decision; not in P0 maybe)
```

Host must evaluate `freshness` only for TaskList? Freshness semantics from Protocol §8 applies to conclusions; Day Plan derives from host state.

`reconcileDayPlanTask()` and `reconcileDayPlanTasks()` mark a `pending` or `overdue` task as `overdue` when the host clock passes `deadlineAt`. `reconcileDayPlanTasks()` sorts overdue first, then by deadline, then by task id. Done/cancelled tasks stay as-is. This reconciliation is host-side display state; the SDK does not auto-write it back.

## 5. 冲突与状态优先级

| 优先级 | 状态来源 | 行为 |
|---|---|---|
| 1 | User/Host state | WINS; model/derived cannot override |
| 2 | Model state | Temporary until user/host confirmation |
| 3 | Derived state | Recompute from tasks; never persists |

Conflict examples:
- User marks done, model edits task -> user wins.
- Model sets deadline earlier than user set -> user wins unless explicit override.
- Host timezone vs model timezone -> host wins; model result is `assumed`.

## 6. 离线与提醒

- `TaskListPayload.version` enables optimistic offline queue; server authoritative merge order by `version` + `sequence` if provided.
- Offline modification queue uses idempotencyKeys; after reconnect, apply user > model > derived, reject stale.
- Reminder failure/permission denied -> status `host_reminder_denied` in evidence log; SDK does not retry automatically.
- Expired tasks -> `overdue`; repeated tasks -> host computes next occurrence; SDK doesn't implement recurrence engine unless host provides API.

## 7. 验收/Conformance（P0）

| # | Case | Expectation |
|---|---|---|
| D101 | Render day plan with one task, one reminder | Conclusion binds taskList state; slots resolve |
| D102 | Complete task | Status done; user wins |
| D103 | Deadline passes | Host sets overdue in artifact and evidence log |
| D104 | Set reminder | Host owns reminder; model doesn't claim verified |
| D105 | Host denies notification | Evidence log host_reminder_denied; no fake success |
| D106 | Model sets user field | Reject or strip unless user confirms |
| D107 | Host conflict report | Artifact contains host conflict evidence; UI warning |
| D108 | Malformed task op/set | Validate/drop like other profile |
| D109 | show_task | Opens host task detail/focus |
| D110 | cancel/reopen | Not claim final; host state wins |

| A1 | `taskList` renders `role=region` + accessible name `Day plan tasks` | Check with role locators |
| A2 | Each pending task row is `role=group` with a non-empty accessible name | Playwright `getByRole("group", ...)` |
| A3 | Reminder is `role=status`, has `aria-live=polite`, and contains non-empty reminder time | Keyboard/role assertions |
| A4 | Task buttons are native buttons with `aria-label`, focusable, and keyboard-activatable (Enter/Space) | Playwright `focus()` + `press("Enter")` |
| A5 | User/Host state wins over model/derived pending patches | `applyDayPlanPatch()`/`applyOfflineQueue()` tests |
| A6 | Host computes overdue state and sorts overdue first | `reconcileDayPlanTasks()` tests |
| A7 | Storage persists `setTasks` and host completion via `DayPlanStorage` | `createDshDayPlanHost()` storage test |
| A8 | DSH executes reminder updates and conflict reports | `createDshDayPlanHost().setReminder()`/`reportConflict()` |
| A9 | PII is redacted and expired | `redactDayPlanPii()`/`clearExpiredDayPlanPii()` tests |
| A10 | No real issuer/Wallet/airport scanner/production `verified` claim | Acceptance tests use local fixture tasks |
| A11 | DSH host focuses task row on `show_task`, dispatches calendar open, and requests/delivers Web Notifications; denial emits `iui-day-plan-notification-denied` | Playwright asserts task rows are focusable; DSH host dispatches `iui-day-plan-calendar` and focuses notification permission flow |

All acceptance uses local fixture tasks, not real ISSUE/Wallet.

## 9. 生产无障碍与验收执行

- Task buttons are native `<button type="button">`; keyboard activation uses Enter/Space.
- Accessible roles: `taskList` has `role=region`; task rows have `role=group` with non-empty `aria-label`; reminder has `role=status` and `aria-live=polite`.
- Buttons have non-empty `aria-label`; status text is non-empty.
- `focus-visible` styles are present for task and reminder actions.
- Status is not encoded color-only; `role` + text are used.
- Acceptance D101–D110 runs in a browser with role/keyboard assertions and local fixture tasks.

## 8. 真实 issuer/Wallet 不在范围

No Ed25519 credential verification; no signature; no snapshot TTL; no revoke; no Wallet handoff. The beachhead is Day plan; Travel pass is mock/fallback and not used as product.
