# Frontend Patterns

## Homepage

- The homepage is the working surface: timeline, life cards, check-ins, capture input, daily story access.
- Show today by default. Future/older cards should appear only through explicit navigation, filters, pinned/routine sections, or clear date grouping.
- Timeline should visually separate current-time-forward items from earlier items. Avoid duplicate "now" dots/labels.
- Date belongs on the left rail when timeline grouping is visible.
- Do not show a recent raw-capture shelf on the dashboard.

## Life Card Display

- Compact view: title, date/time, per-person status, owner/participants, important/routine/private markers.
- Detail view: human meaning first, then people/status, then editable details.
- Hide or translate internal tags like `daily-checkin-card`.
- Show completion as per-person chips or rows, not only aggregate counts.
- Shared cards and child steps should use the same completion language.

## Check-In Display

- Check-ins can live in an independent layer, but should still look like the app's life cards.
- The fixed check-in card title can be `打卡`; child rows carry concrete items such as `明天安排`, `运动`, `起床时间`.
- Show all check-in rows directly when expanded.
- Split each row by person. For value rows, show the value per person, such as wake time.
- Keep rows compact; avoid each person occupying a full-width giant block.

## Editors

- Editors should support title, detail, date, segment/time, owner, participants, priority, recurrence, private visibility, and steps.
- Step editing should support add/remove/reorder, title, owner/assignee, and per-person completion when shared.
- Use app-native modals/confirm UI for destructive actions, proxy completion, unsaved close, and create-life-card confirmation.
- Confirmation dialogs for Agent output should allow editing before commit, especially multi-item todo extraction.
- Prefer structured form state (`react-hook-form + zod`) when the editor grows complex.

## Mobile

- Treat iOS Safari/PWA as a primary target.
- Use `100dvh`/safe-area aware layouts where needed.
- Avoid body scroll locks that can trap the whole page.
- Do not rely on hover-only controls.
- Keep touch targets roughly 44px when practical.
- Prevent horizontal overflow with responsive constraints, wrapping, and min-width resets.
- Fixed headers/footers must leave content scrollable.

## Visual Tone

- Warm and practical, not a marketing page.
- Cute details should be small interaction details and microcopy, not decorative clutter.
- Use profile names/colors/avatars to clarify people.
- Avoid one-note color palettes and nested card stacks.
