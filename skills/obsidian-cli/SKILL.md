---
name: obsidian-cli
description: Use when the user wants to open this project in Obsidian, open a specific note from the terminal, or work with this repository as an Obsidian vault on macOS. This machine does not expose a native `obsidian` binary, so use the bundled shell wrapper and the macOS `open` workflow instead.
---

# Obsidian CLI

Use this skill when the task is about opening the vault, opening notes, or wiring terminal workflows to Obsidian.

## What to assume

- This repository can be used directly as an Obsidian vault.
- On this machine, `command -v obsidian` does not exist.
- Obsidian is installed as a macOS app.
- The reliable terminal entrypoint is `open <path> -a Obsidian`.

## Preferred workflow

1. Open the whole vault:
   `open /Users/wuzewen/Projects/myself -a Obsidian`
2. Open a specific note:
   `open /Users/wuzewen/Projects/myself/notes/obsidian-schedule-board.md -a Obsidian`
3. Open the current directory as vault:
   `open "$(pwd)" -a Obsidian`

## Notes

- Prefer passing a concrete absolute path when opening a note.
- If the user asks for an Obsidian automation flow, first check whether simple `open <path> -a Obsidian` is enough before inventing URI or plugin-based solutions.
- Keep Markdown as the source of truth. Obsidian is the editing layer, and the web app is the display layer.
