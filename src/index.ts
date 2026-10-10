import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';
import simpleGit, { SimpleGit } from 'simple-git';
import { Config, Violation } from './types';
import pkg from '../package.json';
import { validateCommitMessage, CONVENTIONAL_TYPES } from './rules/conventional';
import { validatePRTitle } from './rules/pr-title';
import { validatePRBody } from './rules/pr-body';
import { fixCommitMessage, CommitFixResult } from './fix/git';
import { applyPRFixes } from './fix/github';


const ZERO_SHA = '0000000000000000000000000000000000000000';
const MAX_COMMITS_TO_CHECK = 20;


function loadConfig(configPath: string): Config {
  const defaultConfig: Config = {
    rules: {
      'commit-message': { enabled: true, types: CONVENTIONAL_TYPES, subjectMaxLength: 72 },
      'pr-title': { enabled: true, maxLength: 100 }
    }
  };
  const resolved = path.resolve(configPath);
  if (fs.existsSync(resolved)) {
    const fileConfig = parse(fs.readFileSync(resolved, 'utf-8')) as Partial<Config>;
    if (fileConfig.extends && fileConfig.extends.length > 0) {
      console.log("[pr-conventional] 'extends' is not yet implemented and was ignored");
    }
    return deepMerge(defaultConfig, fileConfig);
  }
  return defaultConfig;
}


function deepMerge<T>(target: T, source: Partial<T>): T {
  const out: Record<string, unknown> = { ...target } as Record<string, unknown>;
  for (const [key, value] of Object.entries(source)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value) && out[key] && typeof out[key] === 'object') {
      out[key] = deepMerge(out[key] as object, value as object);
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out as T;
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
  const configPath = process.env.CONFIG_PATH || '.github/pr-conventional.yml';
  const config = loadConfig(configPath);


  let violations: Violation[] = [];
  let commitsChecked = 0;
  let prNumber: number | undefined;


  // push 事件：校验 before..after 全部 commit
  const sha = process.env.GITHUB_SHA;
  const eventName = process.env.GITHUB_EVENT_NAME;
  if ((eventName === 'push' || !eventName) && sha && process.env.GITHUB_REPOSITORY) {
    try {
      const commits = await resolvePushCommits();
      for (const c of commits) {
        violations.push(...validateCommitMessage(c.message, config.rules['commit-message']));
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
  if (config.fixMode) {
    const fixable = violations.filter(x => x.fixable);

    // commit-message 修复（本地 amend + push）
    for (const v of fixable.filter(x => x.type === 'commit-message')) {
      const result: CommitFixResult = await fixCommitMessage(v);
      if (result.ok && v.fixedValue) {
        // 修复成功 → 用 fixedValue 重算该条；全绿则从 violations 移除，否则替换为重算结果
        const recheck = validateCommitMessage(v.fixedValue, config.rules['commit-message']);
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
      const { fixed } = await applyPRFixes(finalViolations, prNumber);
      if (fixed > 0) {
        // 移除本次实际修复的 PR 违规（pr-title-length / pr-body-section / pr-body-template）
        const prFixableRules = new Set(['pr-title-length', 'pr-body-section', 'pr-body-template']);
        finalViolations = finalViolations.filter(v => !prFixableRules.has(v.rule));
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
