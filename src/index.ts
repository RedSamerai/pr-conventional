import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';
import simpleGit, { SimpleGit } from 'simple-git';
import { Config, Violation, RuleConfig } from './types';
import pkg from '../package.json';
import { validateCommitMessage, CONVENTIONAL_TYPES } from './rules/conventional';
import { validatePRTitle } from './rules/pr-title';
import { validatePRBody } from './rules/pr-body';
import { fixCommitMessage, CommitFixResult } from './fix/git';
import { applyPRFixes } from './fix/github';
import { input } from './inputs';
import { parseCliArgs, CLI_HELP } from './cli';
import { resolveExtendsConfig } from './config/extends';
import { deepMerge } from './util/merge';
import { routeConfigs } from './rules/monorepo';


const ZERO_SHA = '0000000000000000000000000000000000000000';
const MAX_COMMITS_TO_CHECK = 20;


async function loadConfig(configPath: string): Promise<Config> {
  const defaultConfig: Config = {
    rules: {
      'commit-message': { enabled: true, types: CONVENTIONAL_TYPES, subjectMaxLength: 72 },
      'pr-title': { enabled: true, maxLength: 100 }
    }
  };
  const resolved = path.resolve(configPath);
  let fileConfig: Partial<Config> = {};
  if (fs.existsSync(resolved)) {
    fileConfig = parse(fs.readFileSync(resolved, 'utf-8')) as Partial<Config>;
  }

  // extends：远程/URL 规则包（http(s) 仅），加载后与本地 fileConfig 合并
  // extends 优先级：extends 提供的基础层 < fileConfig 本地层
  const extended = await resolveExtendsConfig(defaultConfig, fileConfig.extends);
  const merged = deepMerge(extended, fileConfig) as Config;
  // 剔除 extends 本身，避免回写到 SARIF 等下游
  delete (merged as { extends?: unknown }).extends;
  return merged;
}


function toSarif(violations: Violation[]): string {
  return JSON.stringify({
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [{
      tool: { driver: { name: 'pr-conventional', version: pkg.version } },
      results: violations.map(v => ({
        ruleId: v.rule,
        level: v.severity === 'error' ? 'error' : 'warning',
        message: { text: v.message }
      }))
    }]
  }, null, 2);
}


export interface CommitRef {
  sha: string;
  message: string;
}


export function listChangedFiles(sha: string): Promise<string[] | null> {
  const git: SimpleGit = simpleGit(process.env.GITHUB_WORKSPACE || '.');
  // 返回某 commit 相对父 commit 改动的文件列表；读不到/merge commit/浅克隆缺失父 → null
  // 调用方按 monorepo.ts 的语义回退到根配置（安全降级）
  return (async (): Promise<string[] | null> => {
    try {
      const out = await git.raw(['diff-tree', '--no-commit-id', '-r', '--name-only', '--root', sha]);
      const files = out.split('\n').map(s => s.trim()).filter(Boolean);
      // diff-tree 对空改动会返回空；对读不到的 sha 会抛（被 catch）
      return files.length > 0 ? files : null;
    } catch {
      return null;
    }
  })();
}


export async function resolvePushCommits(): Promise<CommitRef[]> {
  const eventName = process.env.GITHUB_EVENT_NAME;
  const git: SimpleGit = simpleGit(process.env.GITHUB_WORKSPACE || '.');

  // 优先：从 push 事件 payload 读 before/after（两者均为合法 40-hex 才走区间逻辑）
  const HEX40 = /^[0-9a-f]{40}$/;
  if (eventName === 'push' && process.env.GITHUB_EVENT_PATH) {
    try {
      const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf-8'));
      const before: string = event.before;
      const after: string = event.after;

      if (HEX40.test(before) && HEX40.test(after) && before !== ZERO_SHA) {
        // 校验 before..after 区间
        const shas: string[] = (await git.raw(['rev-list', `${before}..${after}`, `--max-count=${MAX_COMMITS_TO_CHECK}`]))
          .split('\n')
          .map(s => s.trim())
          .filter(Boolean);
        const commits: CommitRef[] = [];
        for (const s of shas) {
          const msg = await git.raw(['log', '-1', '--format=%B', s]);
          commits.push({ sha: s, message: msg.trim() });
        }
        return commits;
      }

      // before 全零（新建分支）：校验 after 最近 MAX 个
      if (HEX40.test(after)) {
        const logResult = await git.log({ maxCount: MAX_COMMITS_TO_CHECK });
        return logResult.all.map(c => ({ sha: c.hash, message: c.message }));
      }
    } catch (e) {
      console.log(`[pr-conventional] could not read push event payload: ${(e as Error).message}`);
    }
  }

  // 回退（本地/e2e/无 payload）：simple-git 读最近 N 个
  const n = Number(process.env.CHECK_LAST_N_COMMITS || '1');
  const logResult = await git.log({ maxCount: Math.min(n, MAX_COMMITS_TO_CHECK) });
  return logResult.all.map(c => ({ sha: c.hash, message: c.message }));
}




async function main(): Promise<void> {
  // CLI 参数（本地试跑）：--config <path> / --dry-run / --help
  // 优先级：CLI > INPUT_* > 裸 env > 默认值
  const args = parseCliArgs(process.argv);
  if (args.help) {
    console.log(CLI_HELP);
    process.exit(0);
  }

  // config-path: CLI > input > 裸 env > 默认（input() 内部已实现 INPUT_* > 裸 env 优先级）
  const configPath = args.config || input('config-path') || '.github/pr-conventional.yml';
  const config = await loadConfig(configPath);

  // fix-mode 语义：CLI > input('fix-mode') === 'true' 优先；否则回退配置文件里的 fixMode
  const fixModeInput = input('fix-mode');
  let effectiveFixMode: boolean;
  if (args.dryRun !== undefined) {
    effectiveFixMode = false;
  } else if (fixModeInput !== undefined) {
    effectiveFixMode = fixModeInput === 'true';
  } else {
    effectiveFixMode = !!config.fixMode;
  }
  // --dry-run：只报告、不修复（即便 fixMode 为 true 也不改任何东西）
  const dryRun = args.dryRun === true;
  if (dryRun) {
    console.log('[pr-conventional] --dry-run: report only, no fixes will be applied');
  }


  let violations: Violation[] = [];
  let commitsChecked = 0;
  let prNumber: number | undefined;


  // push 事件：校验 before..after 全部 commit（monorepo 启用时按改动文件路由到各 package 规则集）
  const sha = process.env.GITHUB_SHA;
  const eventName = process.env.GITHUB_EVENT_NAME;
  // 记录每个 commit 的有效 commit-message 规则集（monorepo 路由结果），fixMode 重算时复用同一份
  const commitRulesBySha = new Map<string, RuleConfig[]>();
  if ((eventName === 'push' || !eventName) && sha && process.env.GITHUB_REPOSITORY) {
    try {
      const commits = await resolvePushCommits();
      for (const c of commits) {
        // monorepo 路由：按该 commit 改动文件归属选规则集；未启用/无归属/读不到 → 走根配置
        const files = await listChangedFiles(c.sha);
        const routed = routeConfigs(files, config);
        const ruleSets: RuleConfig[] = routed.length > 0
          ? routed
          : [config.rules['commit-message']];
        commitRulesBySha.set(c.sha, ruleSets);
        // 最严语义：触及多个 package 时各校验一次，全部通过才算过
        for (const rc of ruleSets) {
          const vs = validateCommitMessage(c.message, rc);
          // 打上该 commit 的 sha（存进 violation.file），供 fixMode 重算时找回路由规则集
          for (const v of vs) v.file = c.sha;
          violations.push(...vs);
        }
      }
      commitsChecked = commits.length;
    } catch (e) {
      console.log(`[pr-conventional] could not read commits: ${(e as Error).message}`);
    }
  }


  // pull_request 事件：校验标题与 Body
  if (eventName === 'pull_request' && process.env.GITHUB_EVENT_PATH) {
    try {
      const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf-8'));
      const pr = event.pull_request;
      prNumber = pr.number;
      violations.push(...validatePRTitle(pr.title, config.rules['pr-title']));
      if (config.rules['pr-body']) {
        violations.push(...validatePRBody(pr.body || '', config.rules['pr-body']));
      }
    } catch (e) {
      console.log(`[pr-conventional] could not read PR event: ${(e as Error).message}`);
    }
  }


  // 输出 SARIF
  fs.writeFileSync('pr-conventional.sarif', toSarif(violations));


  const initialErrors = violations.filter(v => v.severity === 'error');
  console.log(`[pr-conventional] commits checked: ${commitsChecked}, violations: ${violations.length}, errors: ${initialErrors.length}`);

  let finalViolations = violations;
  let fixedCount = 0;
  if (effectiveFixMode && !dryRun) {
    const fixable = violations.filter(x => x.fixable);

    // commit-message 修复（本地 amend + push）
    for (const v of fixable.filter(x => x.type === 'commit-message')) {
      const result: CommitFixResult = await fixCommitMessage(v);
      if (result.ok && v.fixedValue) {
        // 修复成功 → 用 fixedValue + 该 commit 的路由后规则集重算（与 validate 时同一份 rc，
        // 保证 monorepo 下按触及 package 的白名单猜类型）
        const recheckSets: RuleConfig[] = v.file
          ? (commitRulesBySha.get(v.file) ?? [config.rules['commit-message']])
          : [config.rules['commit-message']];
        let recheck: Violation[] = [];
        for (const rc of recheckSets) {
          recheck = recheck.concat(validateCommitMessage(v.fixedValue, rc));
          if (recheck.length > 0) break; // 任一规则集报违规即视为未修好
        }
        const idx = finalViolations.indexOf(v);
        if (recheck.length === 0) {
          finalViolations.splice(idx, 1);
          fixedCount += 1;
        } else {
          finalViolations[idx] = recheck[0];
        }
      }
    }

    // PR 字段修复（title + body 合并一次 pulls.update；仅对真正有可修值的字段下 patch）
    if (prNumber !== undefined) {
      const tokenOverride = input('token');
      const { fixed, removedRules } = await applyPRFixes(finalViolations, prNumber, tokenOverride);
      if (fixed > 0) {
        // 移除本次实际修复清除的 PR 违规 rule（由 applyPRFixes 返回，语义精确）
        const clearSet = new Set(removedRules);
        finalViolations = finalViolations.filter(v => !clearSet.has(v.rule));
        fixedCount += fixed;
      }
    }

    violations = finalViolations;
    const remainingErrors = violations.filter(v => v.severity === 'error');
    if (remainingErrors.length === 0) {
      console.log(`[pr-conventional] auto-fixed ${fixedCount}, re-validated clean`);
    }
  }


  const errors = violations.filter(v => v.severity === 'error');
  if (errors.length > 0) {
    for (const v of errors) console.error(`  ✖ ${v.type} [${v.rule}]: ${v.message}`);
    process.exit(1);
  }
  console.log('[pr-conventional] all checks passed');
}


export {
  loadConfig,
  toSarif,
  deepMerge,
};


// 仅在作为 CLI 入口（ncc 产物被 node 直接执行）时运行；被测试 import 时不执行
if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  main().catch((err: unknown) => {
    console.error('[pr-conventional] fatal:', err);
    process.exit(1);
  });
}
