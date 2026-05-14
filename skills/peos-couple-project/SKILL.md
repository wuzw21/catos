---
name: peos-couple-project
description: Use when modifying, reviewing, debugging, deploying, or extending the PEOS / 猫猫日记本 / catandcat.cn codebase, including React frontend, Node scripts/API, capture routing, life cards, shared completion, check-ins, anniversaries, private cards, daily story, mobile behavior, validation, and server sync.
---

# PEOS Couple Project

Use this skill for code work in this repository. It is the project-level entrypoint; pair it with `peos-couple-product-design` for UI/product decisions and `couple-daily-diary` for Daily Story generation.

## First Moves

1. Check current worktree state before editing. Do not mix unrelated dirty frontend changes into skill/backend/deploy commits.
2. Read the closest implementation files before changing behavior:
   - frontend: `frontend/src/App.jsx`, `frontend/src/styles.css`
   - backend/store/API: `scripts/couple-store.js`, `scripts/web-server.js`
   - agent/routing: `scripts/codex-route-capture.js`, `schemas/*.schema.json`
   - deploy: `DEPLOYMENT.md`, `scripts/deploy/sync-to-server.sh`
3. Preserve the system/data split. App code belongs in the repo; real private content belongs under `PEOS_CONTENT_ROOT`.
4. Treat `web/` as generated build output unless the task is explicitly about the static build artifact.

## Project Invariants

- Raw capture always comes first. Markdown/photos must be saved as raw source and never overwritten by analysis.
- Agent analysis creates a lightweight confirmation; it must not directly create final life cards without user confirmation.
- Life cards are two-person objects, not plain todos. Always keep owner, participants, per-person status, and step status distinct.
- Shared completion must display per person: `大猫 ✅ / 小猫 ○` style for cards, steps, and check-ins.
- Check-ins and habits are routine layers. Adding a check-in should usually add a row inside the fixed daily check-in card, not create a separate normal card.
- Private `小秘密` cards/captures are only visible to the creator. Do not leak titles, details, photos, or derived summaries to the other profile.
- Anniversaries are long-term memory by default. Celebration/prep actions become schedule cards only when the user asks for action.
- Do not expose implementation terms in UI: raw IDs, schema field names, `daily-checkin-card`, agent prompt wording, or database-like detail pages.
- Mobile behavior is first-class. Avoid horizontal overflow, blocked body scroll, fixed-height traps, and tiny touch targets.

## Reference Files

Load only the reference needed for the task:

- [Product rules](references/product-rules.md): life cards, check-ins, private cards, anniversaries, daily story, cat words.
- [Capture routing](references/capture-routing.md): capture/schedule/memory/dailyStory decisions, schemas, image todo parsing.
- [Frontend patterns](references/frontend-patterns.md): homepage, detail/editors, mobile layout, display language.
- [Validation and deploy](references/validation-and-deploy.md): local checks, build, commit, push, and remote sync.

## Change Workflow

1. Identify which surface is affected: capture, life card, check-in, daily story, memory, auth, mobile, deploy.
2. Make the smallest code change that preserves the invariants above.
3. If UI behavior changes, check desktop and mobile mental models; when practical, run the app and inspect with Browser/Playwright.
4. Run validation appropriate to the change. For normal code changes, prefer `npm run check`.
5. Summarize behavior changed, tests run, and any deployment/push result. If unrelated dirty files existed, say they were left untouched.
