import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { parse } from 'yaml';
import { Config, Violation } from './types';
import { validateCommitMessage, CONVENTIONAL_TYPES } from './rules/conventional';
import { validatePRTitle } from './rules/pr-title';
import { validatePRBody } from './rules/pr-body';
import { fixCommitMessage } from './fix/git';
import { fixPRField } from './fix/github';


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
      tool: { driver: { name: 'pr-conventional', version: '0.1.0' } },
      results: violations.map(v => ({
        ruleId: v.rule,
        level: v.severity === 'error' ? 'error' : 'warning',
        message: { text: v.message }
      }))
    }]
  }, null, 2);
}


function readCommitMessage(sha: string): string {
  try {
    const cmd = `git -c core.quotepath=false log -1 --format=%B ${sha}`;
    return execSync(cmd, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
  } catch (e) {
    console.log(`[pr-conventional] could not read commit message for ${sha}: ${(e as Error).message}`);
    return '';
  }
}


async function main(): Promise<void> {
  const configPath = process.env.CONFIG_PATH || '.github/pr-conventional.yml';
  const config = loadConfig(configPath);


  let violations: Violation[] = [];
  let commitsChecked = 0;


  // push 事件：校验新增 commit
  const sha = process.env.GITHUB_SHA;
  const eventName = process.env.GITHUB_EVENT_NAME;
  if (eventName === 'push' && sha && process.env.GITHUB_REPOSITORY) {
    const msg = readCommitMessage(sha);
    if (msg) {
      violations.push(...validateCommitMessage(msg, config.rules['commit-message']));
      commitsChecked = 1;
    }
  }


  // pull_request 事件：校验标题与 Body
  if (eventName === 'pull_request' && process.env.GITHUB_EVENT_PATH) {
    try {
      const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf-8'));
      const pr = event.pull_request;
      process.env.GITHUB_PR_NUMBER = String(pr.number ?? '');
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


  const errors = violations.filter(v => v.severity === 'error');
  console.log(`[pr-conventional] commits checked: ${commitsChecked}, violations: ${violations.length}, errors: ${errors.length}`);
  if (config.fixMode) {
    for (const v of violations.filter(x => x.fixable)) {
      if (v.type === 'commit-message') await fixCommitMessage(v);
      else await fixPRField(v);
    }
  }


  if (errors.length > 0) {
    for (const v of errors) console.error(`  ✖ ${v.type} [${v.rule}]: ${v.message}`);
    process.exit(1);
  }
  console.log('[pr-conventional] all checks passed');
}


main().catch((err: unknown) => {
  console.error('[pr-conventional] fatal:', err);
  process.exit(1);
});
