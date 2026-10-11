#!/usr/bin/env node
// 校验 config.schema.json 合法且覆盖真实配置的所有 key。
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

const schema = JSON.parse(readFileSync(new URL('../config.schema.json', import.meta.url), 'utf8'));
const defs = schema.definitions ?? {};

// 1) 结构自检：Config 必须包含全部顶层字段
const cfgProps = defs.Config?.properties ?? {};
for (const k of ['extends', 'fixMode', 'monorepo', 'rules']) {
  if (!(k in cfgProps)) {
    console.error(`FAIL: Config missing property "${k}"`);
    process.exit(1);
  }
}

// 2) 收集 schema 允许的所有字段名（RuleConfig 的 properties + Config 的 properties）
const ruleProps = defs.RuleConfig?.properties ?? {};
const allowed = new Set([...Object.keys(cfgProps), ...Object.keys(ruleProps), ...Object.keys(defs.CustomRule?.properties ?? {})]);

// 3) 用真实仓库配置做一次形状校验
const realConfig = parse(readFileSync(new URL('../.github/pr-conventional.yml', import.meta.url), 'utf8'));
let warn = 0;
for (const key of Object.keys(realConfig)) {
  if (!allowed.has(key)) { console.error(`WARN: config key "${key}" not in schema`); warn++; }
}
for (const [section, secObj] of Object.entries(realConfig.rules ?? {})) {
  if (typeof secObj !== 'object' || secObj === null) continue;
  for (const key of Object.keys(secObj)) {
    if (!allowed.has(key)) { console.error(`WARN: "${section}.${key}" not in schema`); warn++; }
  }
}

if (warn > 0) process.exit(1);
console.log('OK: config.schema.json valid; covers all real config keys. Allowed fields:', [...allowed].join(', '));
process.exit(0);
