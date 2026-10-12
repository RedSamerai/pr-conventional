# pr-conventional

A GitHub Action that enforces — and can automatically fix — Conventional Commits, PR titles, and PR descriptions.

## 0.3.2 - 2026-10-12

### Changed
- `scripts/keygen.ts` now defaults to **lifetime** keys (`payload = { v: 1 }`, no `expires`). `--expires` is now optional (kept for trials / back-compat only).
- Keygen summary line prints `lifetime` by default; shows the expiry date only when `--expires` is supplied.

## 0.3.1 - 2026-10-12

### Changed
- License keys are now **lifetime** (one-time purchase, no expiry). `LicensePayload.expires` is optional; a key with no `expires` is `pro` indefinitely.
- Keys that still carry an `expires` field keep their legacy semantics (expired → `invalid`), so previously issued keys remain valid until their stated date.
- README Free/Pro copy updated to "one-time purchase, lifetime license".
- Added 3 tests (total 82).

## 0.3.0 - 2026-10-12

### Added
- New `license-key` input: FREE / PRO two-tier gating
  - No key → **FREE**: monorepo routing and `extends` are ignored; base validation + auto-fix + SARIF are kept; a FREE-tier notice is printed
  - Invalid / expired key → degrades to FREE + prints an error (does not crash)
  - Key format `PCF-<b64url payload>.<b64url HMAC-SHA256 signature>`, UTC date expiry check
- 11 new tests (total 79), all green

### Changed
- Phase 1 is honor-system: the HMAC secret ships in `dist/index.js` (public), so it can be reverse-engineered to forge a key. Phase 4 will move to server-side verification; the 0.3.0 `PCF_SECRET` is generation-1 and will be invalidated when that lands.
- `gitleaks.toml` allowlists `PCF_SECRET` with a Phase-1 design note.

## 0.2.1 - 2026-10-12

### Changed
- Product renamed to **PR Conventional Fix** (action.yml `name`/`description`); repository slug `pr-conventional` unchanged. No behavior change.

## 0.2.0 - 2026-10-11

### Added
- **Monorepo per-package rule routing**: with `monorepo.packages[]`, each commit is routed by its changed files to the matching package's rule set (root config deep-merged with the package override). A commit touching multiple packages is checked against each rule set (strictest semantics, no intersection). Root-level / merge / shallow-clone files fall back to the root config.
  - `routeConfigs(changedFiles, config)` is a pure function in `src/rules/monorepo.ts` — unit-testable, no git I/O.
  - The same routed rule set is reused for both validation and fix-mode re-validation, so type inference respects the package allow-list.
  - `deepMerge` preserves inherited fields: a package that omits `enabled` keeps the root rule's `enabled: true` (no `undefined` clobber).
- 68 tests total, all green.

### Changed
- `monorepo` config field is now an object `{ enabled?, packages?: [{ path, rules? }] }` (was a boolean placeholder in 0.1.0). `config.schema.json` regenerated.

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
