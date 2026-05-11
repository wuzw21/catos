---
name: fitness-cut-planner
description: Use when the user wants a gym, fat-loss, recomposition, or monthly training plan involving weight loss, muscle retention, strength maintenance, cardio安排, macros, or athletic performance preservation, especially when the goal is to lose weight while keeping muscle and运动表现.
---

# Fitness Cut Planner

Use this skill when the user wants a practical fitness plan rather than a generic motivation reply.

## Goal

Build a plan that can reduce body weight over 4 weeks while protecting:

- muscle mass
- strength output
- sport performance
- recovery capacity

## What to collect first

Collect or infer only the inputs that materially change the plan:

- sex
- age
- body weight
- estimated body fat if known
- training age
- current lifts or sport level
- available training days
- equipment access
- injuries or pain
- daily activity and step count
- food constraints

If the repo already has a stable baseline, reuse it instead of asking again.

In this repo, the default nutrition baseline example is:

- `content.example/notes/fat-loss-calorie-control.md`

## Planning rules

1. Default target loss rate: about `0.4%` to `0.8%` body weight per week.
2. Use a moderate calorie deficit, not an aggressive crash cut.
3. Keep `3` to `5` hard training exposures per week.
4. Keep at least `1` to `2` heavy compound exposures per movement pattern each week.
5. Use low-intensity cardio as the default conditioning tool.
6. Use hard intervals sparingly because they compete with recovery.
7. Keep protein high: usually `1.8` to `2.2 g/kg/day`.
8. Put more carbs near training or sport sessions.
9. Protect sleep, hydration, and step consistency before adding more cardio.
10. Week 4 should usually reduce fatigue with lower volume while keeping some intensity.

## Programming heuristics

- Major muscle groups should usually keep `8` to `16` hard sets per week during a cut.
- Most compound lifts should stay around `RPE 7` to `9`.
- Isolation work can stay around `RPE 8` to `9`.
- If performance matters, reduce cardio or deficit before cutting lifting intensity.
- If the user also plays a sport, count that sport toward weekly fatigue.

## Output format

Prefer this structure:

- objective
- assumptions
- calorie and macro targets
- weekly schedule
- session details
- 4-week progression
- recovery rules
- tracking rules
- adjustment rules

## Repo conventions

- If the user wants the plan saved, write it into a markdown note under the active content root.
- Keep training log examples compatible with `workflows/train.md`.
- For a ready-made example, read:
  - `skills/fitness-cut-planner/references/4-week-fat-loss-plan.md`
