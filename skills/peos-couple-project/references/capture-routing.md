# Capture Routing

## Core Contract

Every input starts as raw capture:

- raw markdown/photo is saved first
- analysis output references the raw capture
- analysis cannot overwrite raw
- final schedule/memory writes require confirmation when they affect life cards or long-term state

Allowed route decisions:

- `capture`: raw only
- `schedule`: life card draft
- `memory`: long-term memory
- `dailyStory`: daily summary source material

Allowed schedule item types:

- `thing`
- `work`
- `date`
- `purchase`
- `reminder`
- `checkin`
- `habit`

Allowed memory kinds:

- `preference`
- `wish`
- `purchase`
- `promise`
- `care`
- `anniversary`
- `memory`
- `gratitude`
- `repair`
- `identity`
- `goal`
- `list`

## Decision Rules

- Clear future/action language becomes `schedule`: do, remind, buy, meet, prepare, practice, study, search, review, organize, handle.
- Preferences, wishes, commitments, care clues, anniversaries, gratitude, repair, identity, or goals become `memory` unless there is also a concrete action.
- Photos, feelings, day fragments, or memory snippets without future action become `dailyStory` when useful for the day, otherwise `capture`.
- If a sentence contains multiple actions, split into `relatedItems` with a shared `relatedGroupId`.
- If a sentence contains both a wish/preference and a concrete action, schedule the action and keep the wish/preference in `detail`/`reason` for later memory extraction.
- Relative dates must be resolved against `selectedDate`, using the 03:00 product-day boundary when relevant.
- The product day is `03:00 -> next day 02:59` in `Asia/Shanghai`. At `00:00-02:59`, "today/now/tonight" still belongs to the previous business date.
- For events at `00:00-02:59`, keep `date` on the business date and put the true calendar timestamp in `plannedAt` / `dueAt`.
- The router should read `timeContext` rather than assuming midnight is the day boundary.
- The router should read `longTermMemory`, `memoryHints`, and `relationshipInsights` before deciding. Existing preferences, wishes, anniversaries, promises, care clues, repair notes, and place nicknames can convert a vague message into a memory update, a daily story, or a better-tagged schedule item.
- Do not duplicate long-term memories. If a new capture confirms or refines an existing memory, return `memory` with a stable title matching that memory and put the new evidence in `detail`.

## Special Cases

- Anniversary definitions become `memory` with `memoryKind=anniversary`, shared owner/participants, and yearly semantics.
- Anniversary preparation actions (`买礼物`, `订餐厅`, `写信`, `整理照片`) become `schedule` and may carry `memoryKinds=["anniversary"]`.
- New routine check-ins/habits become `schedule` with `itemType=checkin` or `habit`, but backend should merge them into the fixed daily check-in card.
- Private trigger language sets `visibility=private`, current user owner, and current user participant.
- Pure numbers, low-signal fragments, and test text should normally stay `capture`.

## Image Capture

Image/photo input is raw capture first. For screenshots, handwritten notes, or todo-list photos:

1. Save the original photo.
2. Ask the Agent to extract draft items.
3. Show a confirmation dialog with each detected item as an editable row.
4. Let the user check/uncheck rows, edit title/date/owner/participants/type, then confirm.
5. Only confirmed rows become life cards or check-in rows.

Do not show only `+N` for extracted todo lists; users need row-level control before committing.

## Useful Files

- `scripts/couple-store.js`: capture persistence, confirmation draft building, memory/check-in/anniversary rules.
- `scripts/codex-route-capture.js`: Codex CLI structured route helper.
- `schemas/couple-capture-analysis.schema.json`: couple capture Agent output.
- `schemas/codex-capture-routing.schema.json`: markdown/workflow routing output.
- `schemas/couple-daily-summary.schema.json`: Daily Story output.
