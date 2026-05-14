# Product Rules

## Identity

PEOS / 猫猫日记本 is a private two-person life system. It should feel like a shared daily surface for two people, not a generic task app, analytics dashboard, or database admin UI.

Core objects:

- `Capture`: raw input, photos, snippets, and evidence.
- `Life Card`: dated or routine thing to act on.
- `Check-in`: routine per-person rows inside a fixed check-in layer/card.
- `Long-term Memory`: preferences, wishes, anniversaries, promises, care, identity, goals, and lists.
- `Daily Story`: generated daily reflection from factual source material.

## Life Cards

- A life card can be `thing`, `work`, `date`, `purchase`, `reminder`, `checkin`, or `habit`.
- Compact cards show title, time/date, owner/participants, status, and meaningful markers.
- Detail pages should answer: what is this, who is involved, what is done, what can be changed.
- Avoid database-facing labels such as tags-as-debug, raw IDs, agent labels, or internal marker tags.
- `下一步` is not a compact-card default. Steps belong in detail/expanded views unless the card is a check-in that needs direct row display.

## Two-Person Completion

- Always separate ownership, participation, completion target, and completion actor.
- Shared cards need per-person status, not just `0/4` or one total completion.
- Steps may also need per-person/assignee status and should be editable.
- Proxy completion is allowed, but the UI must make it explicit and preferably confirm it.
- Good visible language uses profile names: `大猫已完成`, `等小猫`, `小猫由大猫代点`.

## Check-Ins And Habits

- Check-ins/habits are routine modes, not normal rollover tasks.
- Adding `运动打卡`, `起床时间`, `睡前打卡`, `喝水` should add a row to the fixed daily check-in card when possible.
- The check-in title can remain simple (`打卡`); specific items live as child rows/steps.
- The homepage should show check-in rows directly, split by person.
- Check-ins may be hidden/collapsed, but collapsed state still needs a useful summary.
- Wake/sleep time check-ins are per-person values, not just binary done.

## Anniversaries

- Natural language such as `纪念日：1月9日在一起` creates long-term anniversary memory by default.
- Do not treat the creation day as the anniversary date.
- If no year is provided, use the selected/current year for the date value and yearly recurrence semantics.
- Anniversary UI should support countdown, day-of-year/context, reminder lead time, and suggested preparation cards.
- Gift, dinner, photos, letters, booking, or celebration actions can become related schedule cards when explicitly requested.

## Private Cards

- Phrases like `小秘密`, `私密`, `仅我可见`, `不要/不准被对方看到` set private visibility.
- Private schedule items should use current user as owner and participant.
- Strip privacy trigger words from titles and normal details.
- Never include another user's private captures in summaries, route context, dashboard counts, or generated memories unless explicitly authorized by the caller.

## Daily Story

- Daily Story is not a raw capture shelf.
- The generated content should include richer sections when facts support them:
  - today worth encouraging
  - today worth recording
  - today needs effort
- It must stay factual and avoid inventing events, emotions, photos, or who completed something.
- Raw captures are evidence/source material. The dashboard should not show a separate recent-captures shelf.

## Cat Words

- Cat words are a communication feature, not just notes.
- Sent status should be visible after sending. Support at least delivered, and later read/unread.
- The edit/send UI should be warm and direct, but not hide delivery state or recipient.
