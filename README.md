# pr-conventional

GitHub Action，强制并自动修复 Conventional Commits、PR 标题与描述规范。一次 push/PR 事件里校验**所有**新 commit、PR 标题与 Body，输出 SARIF，可选 `fix-mode` 自动修复（改 commit message、补 PR 正文段落、截断超长标题）。

## 卖点

- **自动修复**：`fix-mode: true` 时，能修的直接修（commit message amend、PR body 追加缺失段落、标题截断），修完重算，全绿才 exit 0
- **多 commit**：push 事件校验 `before..after` 区间全部 commit（上限 20），不再只查 HEAD 一条
- **monorepo 友好**：`config-path` 指向任意目录，scope 正则约束模块边界
- **SARIF**：每次运行产出 `pr-conventional.sarif`，接 `upload-sarif` 进 GitHub Security tab

## 快速上手

1. 在仓库放一份配置（示例见下）：`.github/pr-conventional.yml`
2. 在 workflow 里调用：

```yaml
# .github/workflows/pr-check.yml
name: PR Conventional
on:
  push:
    branches: [master, main]
  pull_request:

jobs:
  pr-conventional:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0   # 多 commit 校验需要完整历史
      - uses: RedSamerai/pr-conventional@master
        with:
          config-path: .github/pr-conventional.yml
          fix-mode: 'false'
      - uses: github/codeql-action/upload-sarif@v4
        if: success()
        with:
          sarif_file: pr-conventional.sarif
```

> 发布到 Marketplace 后可换成 `RedSamerai/pr-conventional@v0` 等 tag。
> **SARIF 进 Security tab 前提**：仓库需先在 Settings → Code security（左侧导航）→ Code scanning 启用 Code scanning（私有仓库默认关闭，无 API 可代启，需手动）。未启用时 `upload-sarif` 会 warning 但不阻塞（本仓库 self-check 用 `continue-on-error` 兜底）。

## 配置

配置文件默认路径 `.github/pr-conventional.yml`（可用 `config-path` 覆盖）。全字段表：

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `rules.commit-message.enabled` | bool | `true` | 关闭 commit message 校验 |
| `rules.commit-message.types` | string[] | 11 个标准 Conventional 类型 | 允许的 commit 类型白名单 |
| `rules.commit-message.scopeRegex` | string | 无 | scope 必须匹配的正则（如 `^\w+$`） |
| `rules.commit-message.subjectMaxLength` | number | `72` | subject 最大长度 |
| `rules.pr-title.enabled` | bool | `true` | 关闭 PR 标题校验 |
| `rules.pr-title.maxLength` | number | `100` | 标题最大长度，超长可自动截断 |
| `rules.pr-title.pattern` | string | 无 | 标题必须匹配的正则（如 `^(feat\|fix\|docs)\(\w+\): .+`） |
| `rules.pr-body.enabled` | bool | 无（默认关） | 启用 PR 正文校验 |
| `rules.pr-body.requiredSections` | string[] | 无 | 正文必须包含的段落名（缺失会自动追加） |
| `rules.pr-body.template` | string | 无 | 正文为空时的模板（仅空 body 时整段替换，不丢已有内容） |
| `fixMode` | bool | `false` | 自动修复开关 |
| `extends` | string[] | 无 | **尚未实现**，配置会打 warning 并忽略 |

### 对外示例配置

```yaml
# .github/pr-conventional.yml
fixMode: true
rules:
  commit-message:
    enabled: true
    types: [feat, fix, docs, style, refactor, perf, test, chore, build, ci, revert]
    scopeRegex: '^[a-z][a-z0-9-]*$'   # monorepo：约束模块 scope
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

## Token 权限

- **只校验**（`fix-mode: false`，默认）：`contents: read` 即可
- **自动修复**（`fix-mode: true`）：
  - 改 PR 标题/正文 → `pulls: write`
  - amend commit 并 push → 需要 `contents: write` 的 token（`GITHUB_TOKEN` 默认没有，需在 workflow 里换 PAT，或在调用处传 `token: ${{ secrets.XXX }}`）
- 权限不足时**不是静默失败**：`fix` 模块会打印 `[fix] skipped: branch 'main' is protected; push your fixed commit manually` 或 `[fix] ... failed: <reason>`，可在 runner 日志排查

## 本仓库自用：self-check 案例

本仓库 `.github/workflows/ci.yml` 的 `self-check` job 在自己身上跑这个 action：

- **push 事件**：回退读最近 1 个 commit（`CHECK_LAST_N_COMMITS` 默认 1）
- **pull_request 事件**：读平台注入的真实 event payload，校验真实 PR 的标题与 Body
- **SARIF 上传**：`upload-sarif` 步骤把每次产出的 `pr-conventional.sarif` 送进 GitHub Security tab

**它真的在工作的证据**：commit `1c5228b`（"fix: buildPRContext takes prNumber as param (was reading non-injected env var)"）subject 是 **73 字符**，超过 72 上限，被自己的 self-check 拦下 → 那次 CI 直接红。后来追加一条 58 字符的合规 commit，CI 转绿。

## 开发与发布

```bash
npm install
npm test          # vitest，31 个用例
npm run build     # ncc 打包 dist/index.js（自包含单文件，action 端无需 npm install）
```

- `dist/` 是构建产物，**必须随源码一起 commit**（CI 有 dist 新鲜度检查，stale 会挂）
- 改 `src/` 后：`npm run build && git add dist/ && git commit`
- `action.yml` 用 `node24` runtime，无需 `npm ci`

## License

MIT — Copyright (c) 2026 RedSamerai
