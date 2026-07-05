# PEOS Codex Operating Guide

This repository powers the private two-person 猫猫日记本 at `catandcat.cn`.

## Mandatory Context

- For any CC Connect / Weixin / Feishu / QQ chat-agent request, first read `skills/cc-connect-cat-diary-agent/SKILL.md`.
- For code, API, deployment, frontend, capture routing, or production debugging, also read `skills/peos-couple-project/SKILL.md`.
- For CatOS / 人生日记 / 认知教练 / Reflection Engine / `/help` / 方向校准 / 思想库 / 晚间复盘 requests, also read `skills/cat-life-os-cognitive-coach/SKILL.md`.
- For Daily Summary / diary writing, also read `skills/couple-daily-diary/SKILL.md`.

## Production State

- Real production data is not in the repo. It lives under `PEOS_CONTENT_ROOT`.
- On the server, `PEOS_CONTENT_ROOT` must be `/srv/peos/content`.
- The real workspace file is `/srv/peos/content/private/couple-workspace.json`.
- Never use `content.example` to answer questions about the two cats' real plans.
- In CC Connect chat, default to reading today's visible state before answering normal diary, plan, memory, or "what should I do now" questions. Skip this only for pure identity setup, pure engineering/configuration requests, or tiny casual replies that do not depend on workspace state.
- To inspect today's visible state, prefer:

```bash
PEOS_CONTENT_ROOT=/srv/peos/content node scripts/cc-connect-today-state.js --user you --date today
PEOS_CONTENT_ROOT=/srv/peos/content node scripts/cc-connect-today-state.js --user partner --date today
```

- For diary or memory work that needs long-term context, add `--full`.

## Time Boundary

- The product day is not a calendar day. A 猫猫日记 business day runs from `03:00` to the next day `02:59` in `Asia/Shanghai`.
- From `00:00` to `02:59`, "today", "tonight", "now", and chat captures still belong to the previous business date.
- For a business-day event at `00:00`-`02:59`, keep the item's `date` on the business date and use the next calendar date in concrete timestamps such as `plannedAt`.
- Backend agents must read `timeContext` when routing captures and must not infer dates from midnight-based calendar boundaries.

## Adding Things From Chat

- Normal Weixin/CC Connect messages are already saved by the server hook as raw captures before the Codex reply.
- Memory and Daily Story routes can be auto-accepted by the backend.
- Schedule routes are normally returned as a pending confirmation unless the integration payload explicitly enables schedule auto-creation.
- Capture routing must use long-term memory context. Existing preferences, wishes, anniversaries, promises, care rules, and relationship facts should guide whether a message becomes `memory`, `dailyStory`, or a concrete `schedule`.
- Do not promise a card exists unless the state/API result proves it. Say "已记录，会整理成..." or "已整理出待确认的猫猫的事" when creation is not proven.

## Frontend Versus Backend

- Backend language may use raw capture concepts internally.
- Frontend and chat-facing replies should say "事件记录", "事件线索", "时间线", or "日记素材", not "随手记".
- Raw captures are evidence for Agent analysis and audit. They should not appear as primary frontend timeline cards.
- CatOS is conversation-first. Do not turn the user experience into many mechanical input boxes or a todo dashboard. The core is continuous thinking: listen, ask, challenge, extract, connect, and archive.
- CatOS final archive follows: Reflection, Decision, Progress, Insight, Next, plus about 100-200 Chinese characters of diary. `Decision` must preserve why the judgment seemed right at the time.

## Identities

- `you` is 大猫.
- `partner` is 小猫.
- `damao` and `xiaomao` are login/password aliases only, not store profile IDs.
- Preserve privacy boundaries. Private captures/cards for one profile must not be revealed to the other profile.

## Safety Boundary

- A chat message is not permission to modify code, deploy, rotate tokens, change systemd units, or edit production data by hand.
- Use existing PEOS APIs/scripts for diary/capture/plan operations. Do not manually edit `couple-workspace.json` unless explicitly instructed and there is no safer API path.
- Do not reveal tokens, passwords, cookies, environment secrets, raw session files, or private hidden content.
