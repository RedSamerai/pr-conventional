import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';
import { Config, Violation } from './types';
import { validateCommitMessage, CONVENTIONAL_TYPES } from './rules/conventional';


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


function main(): void {
  const configPath = process.env.CONFIG_PATH || '.github/pr-conventional.yml';
  const config = loadConfig(configPath);


  let violations: Violation[] = [];
  let commitsChecked = 0;


  // push 事件：校验新增 commit
  const sha = process.env.GITHUB_SHA;
  const eventName = process.env.GITHUB_EVENT_NAME;
  if (eventName === 'push' && sha && process.env.GITHUB_REPOSITORY) {
    // 通过 .git 读本次 push 引入的 commit 信息（Runner 上已 checkout）
    try {
      const gitDir = process.env.GITHUB_WORKSPACE ? path.join(process.env.GITHUB_WORKSPACE, '.git') : '.git';
      const log = fs.readFileSync(path.join(gitDir, 'logs', 'HEAD'), 'utf-8').trim().split('\n');
      const last = log[log.length - 1] || '';
      const m = last.split('\t').pop();
      if (m) {
        violations.push(...validateCommitMessage(m, config.rules['commit-message']));
        commitsChecked = 1;
      }
    } catch (e) {
      console.log(`[pr-conventional] could not read git log: ${(e as Error).message}`);
    }
  }


  // 输出 SARIF
  fs.writeFileSync('pr-conventional.sarif', toSarif(violations));


  const errors = violations.filter(v => v.severity === 'error');
  console.log(`[pr-conventional] commits checked: ${commitsChecked}, violations: ${violations.length}, errors: ${errors.length}`);
  if (config.fixMode) {
    console.log('[pr-conventional] fix-mode enabled (fix logic pending next step)');
  }


  if (errors.length > 0) {
    for (const v of errors) console.error(`  ✖ ${v.type} [${v.rule}]: ${v.message}`);
    process.exit(1);
  }
  console.log('[pr-conventional] all checks passed');
}


main();
