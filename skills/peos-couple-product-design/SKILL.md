---
name: peos-couple-product-design
description: Use when designing, implementing, or reviewing PEOS / 猫猫日记本 / 双人生活系统 product behavior or frontend UI, especially homepage timeline, life cards, shared completion, recurring cards, capture routing, daily story, memory, cute interactions, and avoiding generic todo-app complexity.
---

# PEOS Couple Product Design

Use this skill when working on PEOS, also called 猫猫日记本 or 双人生活系统.

PEOS is a private two-person life OS. The frontend should feel like a warm, practical daily surface for two people, not a generic productivity dashboard or a Todoist clone.

## Product Thesis

- The app is built around two core surfaces: `时间轴` and `生活卡`.
- The frontend stays simple. Parsing, memory, recurrence expansion, summarization, and complex decisions should live in backend/agents.
- Life cards are not plain todos. A card can represent a thing, work, date, purchase, reminder, check-in, or habit.
- The strongest product difference is two-person interaction: shared progress, waiting for the other person, proxy completion, care, and tiny daily rituals.
- Cute means friendly language, soft interaction, and small moments of care. Do not add decorative complexity that makes the working surface harder to scan.

## Core Surfaces

Homepage:

- Keep the first screen centered on the timeline and life cards.
- Put the simple text time display near the 猫猫日记本 brand at the top.
- Do not build a marketing hero, large dashboard mosaic, analytics page, or big card wrapper around the whole page.
- Date, weather, lunar, moon, and daily context should be small ambient context, not a dominant card.
- Mobile layout must remain single-column, readable, and free of horizontal overflow.

Timeline:

- Timeline is the primary organization model. Sort by date and time first.
- Use a left date rail when there are multiple days or future groups.
- Separate `全天` from truly unscheduled items. All-day is a valid time segment, not a fallback bucket.
- Future work should be reachable with simple jumps such as tomorrow, three days later, weekend, or next week.
- Inserted cards should land in chronological order. Priority should not break the time story.

Life cards:

- Compact cards show only essential scan info: time/date, title, completion or waiting state, important/pinned/recurring markers, and owner/participants when relevant.
- Compact cards should not show `下一步`. Steps belong in the detail view or expanded card.
- Detail view can show steps, notes, recurrence, owner, participants, and action history.
- Keep the information hierarchy clean: primary title and time first; status second; secondary metadata last.
- Avoid stacking many nested cards inside a card. Prefer grouped rows, sections, chips, segmented controls, and inline controls.

## Priority And Recurrence

- Priority should be visible through emphasis, not by disrupting time order.
- Use `置顶`, `重要`, subtle color bands, badges, or stronger border treatment for priority.
- Pinned items may appear in a small pinned band, but the main timeline remains time-ordered.
- A life card can be set as recurring: daily, weekdays, weekly, monthly, yearly, or custom when backend support exists.
- Recurring cards should show a compact repeat marker in list view and editable recurrence controls in the editor.
- Recurrence completion is per occurrence. Do not make one completion accidentally finish the whole series unless the UI explicitly says so.

## Two-Person Logic

- Always distinguish who owns a card, who participates, and who completed which part.
- Shared cards must show each person's state: done, pending, or waiting.
- For shared check-ins and habits, the core question is `两个人是否都完成`.
- If one person completes and the other has not, show the state as waiting for the other person, not simply incomplete.
- Proxy completion is allowed, but should feel explicit and confirmable: one person may mark the other done, and the UI should make the actor clear.
- Detailed steps can have assignees. Show who needs to complete each step and who has already completed it.
- Use profile display names and avatars/colors where available. Avoid raw IDs like `you` or `partner` in visible UI.

## Capture And Agent Boundary

- All user input starts as raw capture. Raw markdown/photos must be preserved and never overwritten by analysis.
- The capture router can suggest schedule, memory, daily story, or raw capture, but the frontend should show a lightweight confirmation before final write when needed.
- If text contains multiple concrete actions, create related life-card drafts with a shared `relatedGroupId`.
- If input combines a preference/wish and a concrete action, schedule the action and keep the preference as detail/reason for later memory extraction.
- Anniversary, birthday, and important-date definitions are long-term memory unless the user also asks for a concrete celebration/reminder/action.
- Images are part of raw capture. Screenshot, handwritten list, note, or todo-list images should be parsed into draft actions only after preserving the raw asset.

## Form And Editor Rules

- As editors grow, use `react-hook-form + zod` for validation, dirty state, submit state, and schema-driven defaults.
- Prefer existing UI libraries already in the app: Radix primitives, lucide icons, sonner toasts, react-day-picker, react-hook-form, and zod.
- Editors should feel light: section rows, inline chips, segmented controls, date/time shortcuts, and clear primary action.
- Avoid many heavy cards and full-width bordered input blocks. Use rhythm, labels, and grouped controls instead.
- Editing a life card should support date, time segment, planned time, duration, owner, participants, priority, pin/important, recurrence, steps, and details.
- Destructive actions, proxy completion, and unsaved close should use app-native confirm UI, not `window.confirm`.

## Cute Interaction

- Use small, concrete microcopy tied to the two-person context.
- Prefer gentle state language such as `等小猫`, `等大猫`, `一起完成`, `今天先放这里`.
- Motion should clarify feedback: completion, waiting, pinning, and recurrence changes.
- Keep controls discoverable. Cute styling must not hide primary actions or make compact lists hard to scan.
- Use icons for common actions when an existing lucide icon fits. Add tooltips for unfamiliar icons.

## What Not To Build

- Do not expand the frontend into a full todo/productivity suite unless the user asks.
- Do not add many tabs, dashboards, analytics panels, or configuration-heavy surfaces to the homepage.
- Do not put all content into one oversized wrapper card.
- Do not make compact cards dense with next steps, long descriptions, debug text, or raw agent analysis.
- Do not make priority a drag-sort system that fights chronological order.
- Do not expose backend concepts, database IDs, schema field names, or agent prompt language in user-facing UI.

## Implementation Checklist

Before finishing a PEOS frontend change:

- Timeline still sorts by date/time and keeps all-day distinct.
- Compact list remains readable on mobile and has no horizontal overflow.
- Shared cards show both people's completion states clearly.
- Compact cards do not show next-step content.
- Detail view shows step ownership and pending/done states when steps exist.
- Priority and pinned state are visible without breaking time order.
- Recurring cards can be recognized and edited.
- Raw capture is preserved before analysis-derived drafts.
- Form validation and submit/dirty behavior are handled by structured form state for complex editors.
- Visual style stays warm, simple, and useful rather than decorative or dashboard-heavy.
