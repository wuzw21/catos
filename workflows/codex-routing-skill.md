# Codex 路由 Skill

## 目的

这份 skill 用本地 `codex` CLI 做随手记内容的结构化判断。  
目标不是靠关键词硬匹配，而是直接让模型判断一条内容该不该沉淀到某个行动领域，以及应该进入哪个 section。

## 当前调用方式

使用脚本：

- `scripts/codex-route-capture.js`

底层命令：

- `codex exec --ephemeral --skip-git-repo-check -C <project-root> --output-schema schemas/codex-capture-routing.schema.json -o <tmp-output.json> "<prompt>"`

## 为什么这样做

- 还是用你本地的 `codex`
- 不额外接 OpenAI SDK
- 可以直接复用你当前 `~/.codex/config.toml` 里的 provider / model
- 用 schema 强约束输出，方便脚本接入

## 输出结构

schema 位置：

- `schemas/codex-capture-routing.schema.json`

核心字段：

- `should_archive_to_iteration`
- `iteration_id`
- `section`
- `title`
- `summary`
- `reason`
- `markdown_bullet`

## 目前 section 语义

- `recent_changes`
- `current_problems`
- `insights`
- `next_step`
- `ignore`

## 适合的输入

- `投篮：肩膀对准+释放`
- `今天投篮时右侧出手更稳`
- `足球长传还是发不上力`
- `护肤后这两天没有长新痘`

## 后续接入方式

下一步应该把 `scripts/archive-capture.js` 中的规则路由替换成：

1. 先调用 `codex-route-capture.js`
2. 拿到结构化判断
3. 再把结果写进对应领域 markdown

## 当前限制

- 依赖本机 `codex exec` 可用
- 依赖你当前 `.codex/config.toml` 里的 provider 能正常访问 `responses` 端点
- 如果 provider 掉线，脚本会直接失败，不会 silently fallback
