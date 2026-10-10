# pr-conventional

A GitHub Action that enforces — and can automatically fix — Conventional Commits, PR titles, and PR descriptions. On every `push` / `pull_request` it checks **all** new commits, the PR title, and the PR body, emits a SARIF report, and (opt-in) auto-fixes what it can.

## Why

- **Auto-fix, not just fail.** With `fix-mode` on, it amends commit messages, appends missing PR-body sections, and truncates over-long titles — then re-validates. Only exits 0 when it's genuinely clean.
- **Checks the whole push, not just HEAD.** A push of 5 commits is validated across the `before..after` range (up to 20), so no one smuggles bad commits through.
- **Monorepo-aware.** Point `config-path` at any directory; constrain module boundaries with `scopeRegex`.
- **SARIF out of the box.** Every run writes `pr-conventional.sarif`; pipe it into `upload-sarif` and findings land in the GitHub Security tab.

## Quick start

Drop a config file into your repo, then call the action from any workflow:

```yaml
# .github/workflows/pr-check.yml
name: PR Conventional
on:
  push:
    branches: [main]
  pull_request:

jobs:
  pr-conventional:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0        # multi-commit validation needs full history
      - uses: <owner>/pr-conventional@v0
        with:
          config-path: .github/pr-conventional.yml
          fix-mode: 'false'
      - uses: github/codeql-action/upload-sarif@v4
        if: success()
        with:
          sarif_file: pr-conventional.sarif
```

> Publish to your account's Marketplace and reference by tag, e.g. `RedSamerai/pr-conventional@v0`.

## Inputs

| Input | Default | Description |
|---|---|---|
| `config-path` | `.github/pr-conventional.yml` | Path to the config file (YAML or JSON). |
| `fix-mode` | `false` | `'true'` enables auto-fix. Requires write permission (see Token permissions). |
| `token` | `${{ github.token }}` | Token used for fixes. Supply a PAT with `contents: write` to amend commits. |

## Configuration

Default file location is `.github/pr-conventional.yml` (override with `config-path`). All fields:

| Field | Type | Default | Notes |
|---|---|---|---|
| `rules.commit-message.enabled` | bool | `true` | Disable commit-message checks. |
| `rules.commit-message.types` | string[] | 11 standard Conventional types | Allow-list of commit types. |
| `rules.commit-message.scopeRegex` | string | — | Scope must match (e.g. `^[a-z][a-z0-9-]*$`). |
| `rules.commit-message.subjectMaxLength` | number | `72` | Max subject length. |
| `rules.pr-title.enabled` | bool | `true` | Disable PR-title checks. |
| `rules.pr-title.maxLength` | number | `100` | Max title length; over-length is auto-truncatable. |
| `rules.pr-title.pattern` | string | — | Title must match a regex. |
| `rules.pr-body.enabled` | bool | off | Enable PR-body checks. |
| `rules.pr-body.requiredSections` | string[] | — | Sections the body must contain; missing ones are appended when `fix-mode` is on. |
| `rules.pr-body.template` | string | — | Used only when the body is empty (never overwrites existing content). |
| `fixMode` | bool | `false` | Config-file switch for auto-fix (in addition to the `fix-mode` input). |
| `extends` | string[] | — | Reserved, not implemented — a warning is logged and it is ignored. |

### Example

```yaml
# .github/pr-conventional.yml
fixMode: true
rules:
  commit-message:
    enabled: true
    types: [feat, fix, docs, style, refactor, perf, test, chore, build, ci, revert]
    scopeRegex: '^[a-z][a-z0-9-]*$'
    subjectMaxLength: 72
  pr-title:
    enabled: true
    maxLength: 100
    pattern: '^(feat|fix|docs|chore|refactor)\(\w+\): .+'
  pr-body:
    enabled: true
    requiredSections: [测试方案, 回滚方案]
    template: |
      ## 测试方案

      ## 回滚方案
```

## Token permissions

- **Check-only** (`fix-mode: false`, the default): `contents: read` is enough.
- **Auto-fix** (`fix-mode: true`):
  - Updating the PR title/body needs `pulls: write`.
  - Amending + pushing a commit needs a token with `contents: write` — the built-in `github.token` does **not** have this. Pass a PAT via the `token` input:
    ```yaml
    - uses: RedSamerai/pr-conventional@v0
      with:
        fix-mode: 'true'
        token: ${{ secrets.FIX_PAT }}
    ```
- Insufficient permission is **never silent**: the fix module logs `[fix] skipped: branch 'main' is protected; push your fixed commit manually` or `[fix] ... failed: <reason>` so it's visible in the runner logs.

## Output

Every run writes `pr-conventional.sarif` to the workspace. Feed it to `github/codeql-action/upload-sarif` to surface findings in the Security tab. Uploading SARIF requires the repository's Code scanning to be enabled (Settings → Code security → Code scanning; off by default for private repos) — without it, `upload-sarif` warns but does not block the run.

## License

MIT — Copyright (c) 2026 RedSamerai

---

<details>
<summary>Developing this action (repo maintainers)</summary>

```bash
npm install
npm test          # vitest
npm run build     # ncc bundle → dist/index.js (self-contained; no npm install at action runtime)
```

- `dist/` is a build artifact and **must be committed** alongside source. The repo's own CI verifies it is up to date and fails if stale.
- After changing `src/`: `npm run build && git add dist/ && git commit`.
- `action.yml` runs on the `node24` runtime.

The repo also dogfoods the action in `.github/workflows/ci.yml`:
- `test` job: unit tests + build + a `dist/` freshness gate.
- `self-check` job: runs the action against the real event payload (PR) or a static sample (push), and uploads the SARIF.

</details>
