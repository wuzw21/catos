# Validation And Deploy

## Local Validation

Use the narrowest validation that covers the change:

- Markdown/skill-only changes: inspect frontmatter and `git diff`.
- Node script changes: `node --check <file>`.
- Frontend/backend project changes: `npm run check`.
- Frontend visual/mobile changes: start `npm run dev:web` or `npm run serve`, then inspect local pages with Browser/Playwright.

`npm run check` currently validates key Node scripts, route parsing tests, frontend boot JS, and runs `npm run build:web`.

## Local URLs

- Dev frontend: `npm run dev:web`, usually `http://127.0.0.1:5173`.
- Full local app/API: `npm run serve`, then `http://127.0.0.1:2333/web/index.html`.
- Demo content: `npm run init:demo`, `npm run serve:demo`.

## Deployment

The production site is served at:

- `https://catandcat.cn/web/index.html`

Normal sync path:

```bash
scripts/deploy/sync-to-server.sh
```

The server app runs under systemd as the production service described in `DEPLOYMENT.md`.

## Remote Agent/Codex

Production Agent features execute `codex exec` on the server as the service user. The service should use the mirror provider, not `omnimind`, when configured that way.

Check:

- `/home/peos/.codex/config.toml`
- `/etc/peos/peos.env`
- `CODEX_HOME=/home/peos/.codex`
- `sudo -u peos -H codex exec --ephemeral --skip-git-repo-check -C /srv/peos/app "Return exactly: pong"`

If logs say `Missing environment variable: OMNIMIND_API_KEY`, the active Codex config/provider is still `omnimind` for that service user or environment.

## Git Hygiene

- Check `git status --short` before and after edits.
- Do not revert user changes.
- Stage only files relevant to the task.
- For successful local staging/commit/push in Codex Desktop, emit the matching git directives in the final response.
- Push with `git push origin master` when the user asks to push all committed changes.
