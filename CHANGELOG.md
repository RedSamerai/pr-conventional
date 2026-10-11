# pr-conventional

A GitHub Action that enforces — and can automatically fix — Conventional Commits, PR titles, and PR descriptions.

## 0.1.0 - 2026-10-11

### Added
- Initial release
- Conventional Commits, PR title, and PR body validation rules
- Auto-fix: amend commit messages, append missing PR-body sections, truncate over-long titles (opt-in via `fix-mode`)
- Multi-commit push validation across `before..after` (up to 20)
- SARIF output (`pr-conventional.sarif`) for GitHub Security tab
- `extends` config field: inherit one or more rule packs from a remote HTTP(S) URL (24h cache, silent fallback to built-in defaults on failure; local paths rejected for supply-chain safety)
- Monorepo-friendly via `config-path` + `scopeRegex` (per-package rule routing planned for v0.2.0)
- CLI flags: `--config`, `--dry-run`, `--help`
- 44+ unit/integration tests, all green

### Fixed
- P0: action `inputs` (`config-path` / `fix-mode` / `token`) were silent no-ops — now wired via GitHub's `INPUT_*` env convention
- P0: PR auto-fix was dead code (read a non-injected `GITHUB_PR_NUMBER` env) — now reads `pr.number` from the event payload
- P0: push validation read git reflog instead of real commit messages — now uses `git log` via the push payload's `before..after`
- P1: body auto-fix replaced the whole PR body with the template (losing user content) — now appends missing sections
- P1: `guessFixedCommit` forced lowercase on the subject (degraded) and guessed type from the first allowed entry — now uses keyword inference with no forced casing and word-boundary type replacement
- `git commit --amend` for empty commits was rejected by git — now uses `--allow-empty` and goes through `git.raw` (simple-git's `commit()` silently drops custom args)
