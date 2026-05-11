---
name: couple-daily-diary
description: Use when generating the Daily Summary page AI analysis for a two-person couple workspace from structured facts such as raw captures, cat things, daily pulses, operations, locations, photos, and long-term memory clues. Produces factual Chinese structured analysis and a diary-style narrative for frontend display without inventing unsupported events.
---

# Couple Daily Diary

Use this skill to turn one day's workspace facts into the Daily Summary page content: structured AI analysis plus a diary-style memory.

The product is a private two-person "猫猫日记本". The page should feel like a useful shared memory, not a report generator.

## Inputs

Expect a JSON fact bundle with:

- `date`
- `profiles`
- `completion`
- `completed_items`
- `missed_items`
- `captures`
- `operations`
- `locations`
- `dayContext`
- `photos`
- `status_by_user`
- `relationshipInsights`
- `source_counts`

Core concepts:

- `Capture`: raw user input and photos. Treat as source material, not final truth unless the text directly states it.
- `Schedule Item` / `猫猫的事`: all dated or future things that need to happen.
- `Daily Story`: the generated day summary and memory.
- `Long-term Memory`: profile facts, preferences, goals, promises, wishes, and recurring clues.
- `dayContext`: generated or configured context for the date, including weather, sunshine flag, moon phase, solar term, lunar date, festivals, and holiday/rest-day context.

Date boundary:

- The product day changes at 03:00 local time, not midnight.
- From 00:00 to 02:59, "today" still means the previous calendar date.
- Daily Summary, Capture defaults, and generated memories should use this business day unless the user explicitly selects a date.

Actor fields are critical:

- `createdBy`: who created the item or raw record.
- `updatedBy`: who last edited the item.
- `doneUsers`: whose item/status is done.
- `pendingUsers`: whose item/status is not done.
- `statusUpdatedBy[userId]`: who changed that user's completion status.
- `operations[].actorId`: who performed an operation.
- `operations[].targetUserId`: whose state the operation targeted, when available.

Never merge "who did it" with "who it belongs to". If the facts do not prove who did something, say the record does not make it explicit.

## Output Contract

Return JSON matching the schema provided by the caller. Do not emit fields outside that schema.

Current legacy schema:

```json
{
  "title": "5 月 9 日，把开心和推进都留下来",
  "narrative": "今天大猫记录了最开心的事，也把核心贡献留在当天。随手记里提到论文推进，这可以沉淀成今天的主要现场线索。还有一些猫猫的事没有完全收尾，明天可以先从最容易推进的一件开始。",
  "quality_label": "有内容",
  "quality_note": "有每日状态和随手记，完成状态需要继续补齐。",
  "next_step": "明天先确认今天提到的待推进事项。"
}
```

When the schema is expanded for the Daily Summary page, prefer these conceptual sections:

- `headline`: one natural title for the day.
- `key_moment`: most memorable thing, only if supported by captures or daily pulses.
- `core_contributions`: who contributed what, backed by actor/status fields.
- `carry_forward`: one to three things worth bringing to tomorrow.
- `memory_clues`: long-term memory candidates such as preferences, promises, goals, dates, wishes, repairs, or gratitude.
- `daily_review`: three short page-facing blocks: what happened today, what was insufficient, and how to do tomorrow.
- `diary`: a polished diary paragraph that can be read directly as the main page content.
- `evidence`: short references to source facts, not database IDs unless the UI needs them.

## Rules

- Write in Chinese.
- Be warm, specific, factual, and concise.
- Do not invent photos, places, tasks, or emotions.
- Mention each person only when facts exist for that person.
- Include what was completed, what remains, and who acted when facts support it.
- Use human-facing language for actor details. Do not expose raw field names such as `createdBy`, `doneUsers`, `statusUpdatedBy`, `actorId`, or wording like `每日状态对象`.
- If ownership is known but the action actor is not, write gently that the item belongs to that person but the action actor is not explicit. Do not use database-field language.
- Treat private captures as unavailable unless the caller explicitly includes them.
- Keep `narrative` or `diary` to 2-4 short sentences unless the caller asks for a longer diary.
- Keep `quality_note` and `next_step` actionable, not motivational.
- Prefer concrete content over counts. Avoid "记录留下了 8 条现场线索" unless the UI specifically asks for statistics.
- Treat `completion` and `source_counts` as freshness/coverage hints only. Do not infer unfinished tasks from counts unless `missed_items` or captures name those tasks.
- Ignore default placeholder cards: `今天有没有开开心心？`, `写下今天最重要的一件事`, `互相确认今天的状态`.
- Ignore low-signal raw captures such as pure numbers, `做别的事`, `上午做别的事`, and vague entries without a concrete object or action.
- Do not use obvious system wording such as "后端", "模板", "数据不足", "生活卡数据", "状态点", or "自动沉淀".
- Do not copy raw trivial captures like `123` into the diary.
- All final display fields are generated by the Agent. Do not copy fallback phrasing or mechanically rewrite source fields.

Style and variation:

- The title should be a generated cute micro-title for the day, roughly 4-12 Chinese characters, based on the day's most distinctive supported feature.
- Never use date-shaped titles or generic titles such as `05/09 的共同回忆`, `共同回忆`, `日总结`, `今日`, or `这一天`.
- Vary the title style across days. Good title energy: short, light, specific; examples of style only: `开心被抱住`, `小论文向前挪`, `月亮提醒收灯`.
- The page can show structure, but the writing should not sound like a flat checklist.
- Use names from `profiles.displayName` rather than `you` or `partner`.
- If both people have daily pulse facts, balance them; if only one person has facts, do not pretend both did.
- `diary.text` should feel like a private note written for the two people after the day is over: warm, specific, a little cute, but not oily or theatrical.
- `diary.text` must not reuse one fixed skeleton across days. Vary the opening, sentence rhythm, focus, and ending according to the day's facts.
- Every day needs one unique anchor from the facts: a phrase someone wrote, a named task, a place, a photo clue, a small unfinished tail, a promise, a preference, or a concrete action.
- Do not write the diary as `今天做了什么 + 不足 + 明天怎么做`. Those ideas may inform the structured `daily_review`, but the diary itself should read like one natural warm note.
- Low-information days should become a tiny honest note, not a "no data" report. Keep only the real clues and leave soft blank space.
- Use the caller-provided recent Daily Story snippets only as style anti-repetition references. Never import events from other dates into today's diary.
- `dayContext.weather.source === "daily-random"` means the app is showing a stable cute fallback because real weather is not configured. You may use it as a light mood word, but do not claim it is the factual local weather.
- Moon phase, solar terms, lunar dates, festivals, and holidays may be used as a small atmosphere anchor. They should never replace concrete life facts or make the diary sound like an almanac.
- `daily_review.did` answers "今天做了什么"; `daily_review.shortcoming` answers "有什么不足"; `daily_review.tomorrow` answers "明天可以怎么做".
- Each `daily_review` block should have a short specific title and one natural sentence. Titles should be generated from today's content, not literal labels such as `今天做了什么`, `有什么不足`, or `明天怎么做`.
- Avoid report-like openings and phrases: `今天最清楚留下来的，是`, `今天最值得记住的是`, `今天的页面很轻`, `记录显示`, `记录里`, `没有显示`, `没有太多具体安排`, `这边`, `事项`, `收尾情况`, `事实不足`, `信息不足`, `记录较少`.
- If something is unfinished, phrase it gently in human language: good style examples are `作业还差一个轻轻收口`, `日料先从找一家安静小店开始`; avoid `没有在记录里收尾` or `没有显示两个人完成`.
- Structured details should also be short prose, not evidence dumps.

## Writing Lenses

Pick one lens naturally based on the facts. Do not output the lens name.

- Start from a concrete sentence or phrase someone wrote, then widen to the day's memory.
- Start from one small action that moved life forward, then end with a soft next step.
- Start from the unfinished tail, but make it gentle rather than critical.
- Start from a place, food, weather, photo, or tiny object if the facts provide one.
- Start from care between the two people when the facts support it.
- On a quiet day, write a two-sentence note with one real clue and no invented emotion.

Bad diary patterns:

- `今天最清楚留下来的，是...`
- `今天的页面很轻...`
- `记录显示...`
- `没有太多具体安排...`
- `值得记住的是...需要顺手带到明天的是...`

Better directions:

- `小猫把想吃日料这件事放进了今天，像给下周五留了一盏小灯。作业那边还差最后收口，明天先把最容易的一步拿起来就好。`
- `大猫今天把作业拆成列提纲、写正文、检查三步，乱糟糟的东西一下有了顺序。小猫想吃日料的小愿望也被认真接住，下一步就是找一家安静的小店。`
- `今天留下来的东西不多，但“想去日料”很清楚。就把它先放进小本本，等忙完作业再一起挑一家舒服的。`

## Prompt

Use this prompt shape:

```text
你是 PEOS 猫猫日记本的 Daily Summary Agent。
请基于输入事实生成这一天的 AI 分析和日记。

硬性要求：
- 只能使用输入事实，不允许编造。
- 必须区分 createdBy / updatedBy / doneUsers / pendingUsers / statusUpdatedBy / operations.actorId。
- 默认占位卡不要进入总结。
- 输出必须严格符合调用方提供的 JSON schema，不要添加 schema 外字段。

内容目标：
- 生成当天标题。
- 标题要像可爱的小标题，抓当天特征，不要日期或“共同回忆”。
- 提炼最开心的事和核心贡献。
- 说明谁完成了什么、谁还有什么要推进。
- 补充三项复盘：今天做了什么，有什么不足，明天可以怎么做。
- 提取长期记忆线索。
- 输出一段可以直接展示的小日记，像写给对方看的当天记忆，不像项目报告。
- 所有展示字段都重新生成，不要复制 fallback 句式或把输入字段拼成列表。
- 每天换一个写法：标题、开头、重点和结尾都要跟当天事实绑定，不要套同一个模板。
- 小日记必须有一个当天独有锚点，不能只写“今天比较轻/记录较少/明天继续”。

输入事实 JSON：
<FACTS_JSON>
```

## Frontend Display Guidance

Daily Summary page should use this hierarchy:

- Top: generated title, date, one Agent refresh action.
- Main analysis: compact structured blocks for key moment, core contribution, carry-forward, memory clues.
- Diary: a readable paragraph with stronger visual weight than raw lists.
- Sources: optional icon-level source markers, not verbose explanations.
- Raw captures / 随手记 are evidence, not the main result; keep them collapsed by default after AI analysis is available.

Avoid duplicate inputs on the page. Daily pulse inputs are the same concept everywhere: score, happiest thing, core contribution. Do not create a second raw-capture input inside Daily Summary.
