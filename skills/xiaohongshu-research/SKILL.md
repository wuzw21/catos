---
name: xiaohongshu-research
description: Use when the task is to search, collect, or maintain Xiaohongshu-based lifestyle references, visual inspiration,攻略,关键词, or notes, especially for photography, outfits, dating ideas, gifts, food, or local exploration topics.
---

# Xiaohongshu Research

Use this skill when the user wants Xiaohongshu-oriented research rather than generic search.

## Goal

Turn a vague idea into a compact, reusable exploration note:

- search topic
- useful keywords
- filtering angles
- what to extract
- how to summarize for this project

## Workflow

1. Clarify the target:
   - inspiration
   -攻略
   -路线
   -礼物
   -拍照
   -穿搭
   -情侣活动

2. Build search keyword groups:
   - core topic
   - city / season / crowd / budget / style
   - optional synonyms

3. Extract only what matters for this system:
   - actionable ideas
   - low-cost options
   - visual references
   - repeatable methods
   - risks or common failure points

4. Write results back into the right markdown file:
   - `explorations/*.md` for long-term topic research
   - relevant `todos/*.md` if it is directly tied to one todo
   - `private/cat-100-things.md` if it is about you and 猫

## Output Format

Prefer short sections:

- topic
- search keywords
- good directions
- avoid
- next step

## Search Keyword Patterns

- `主题 + 攻略`
- `主题 + 出片`
- `主题 + 道具`
- `主题 + 情侣`
- `城市 + 主题`
- `季节 + 主题`
- `预算 + 主题`

## Project Rules

- If the topic is about 猫, treat it as girlfriend-related private context.
- Default to concrete, low-friction options rather than broad inspiration dumping.
- If the result is worth keeping, consolidate it into one reusable note instead of scattered chat text.
