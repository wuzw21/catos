---
name: couple-daily-diary
description: Use when generating a shared daily diary for a two-person couple workspace from structured facts such as todos, schedules, checkins, quick captures, locations, and photos. Produces a warm but factual Chinese summary for frontend display and should not invent unsupported events.
---

# Couple Daily Diary

Use this skill to turn one day's structured workspace facts into a concise shared diary.

## Inputs

Expect a JSON fact bundle with:

- `date`
- `profiles`
- `completion`
- `completed_items`
- `missed_items`
- `captures`
- `locations`
- `photos`
- `status_by_user`

## Output Contract

Return JSON matching `schemas/couple-daily-summary.schema.json`:

```json
{
  "title": "5 月 8 日的小结",
  "narrative": "今天两个人完成了...",
  "quality_label": "稳定推进",
  "quality_note": "完成率较高，但...",
  "next_step": "明天先处理..."
}
```

## Rules

- Write in Chinese.
- Be warm, specific, and factual.
- Do not invent photos, places, tasks, or emotions.
- Mention both people when facts exist for both.
- Include what was completed and what was not completed.
- Treat private captures as unavailable unless the caller explicitly includes them.
- Keep `narrative` to 2-4 short sentences.
- Keep `quality_note` and `next_step` actionable.

## Prompt

Use this prompt shape:

```text
你是双人共享工作台的每日总结助手。请基于输入事实生成一天的共享日记。
只能使用输入事实，不允许编造。
需要覆盖：完成了什么、没完成什么、地点/照片线索、每个人的状态、当天完成质量。
输出必须严格符合给定 JSON schema。

输入事实 JSON：
<FACTS_JSON>
```
