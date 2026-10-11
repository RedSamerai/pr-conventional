import { Config, RuleConfig } from '../types';
import { deepMerge } from '../util/merge';


/**
 * monorepo 按包路由（v0.2.0，commit-message only）。
 *
 * 语义（与 types.ts / examples/monorepo.yml 对齐）：
 * - monorepo.enabled !== true 或无 packages → 返回 []（调用方走根配置）
 * - 每个 commit 按改动文件归属到 path 前缀（改动文件落在该前缀下才算命中）
 * - 命中的每个 package 生成一份「根 config.rules['commit-message'] + package.rules」
 *   deepMerge 后的规则集；一个 commit 触及多个 package → 返回多份（各校验一次，最严）
 * - 无归属 / merge commit / 浅克隆读不到改动文件（changedFiles 为 null 或空）→ 返回 []（根配置）
 * - PR 标题/正文不路由，走根配置（v0.3）
 *
 * 纯函数，不做 git 操作（改动文件由调用方传入）。
 */
export function routeConfigs(
  changedFiles: string[] | null,
  config: Config
): RuleConfig[] {
  const mono = config.monorepo;
  if (!mono?.enabled || !mono.packages?.length) return [];
  if (!changedFiles || changedFiles.length === 0) return [];

  const rootCommitRule = config.rules?.['commit-message'];
  if (!rootCommitRule) return [];

  // 归一化：去 ./ 前缀、统一正斜杠
  const norm = changedFiles
    .map(f => f.replace(/^\.\//, '').replace(/\\/g, '/'))
    .filter(Boolean);

  // 命中的 package（path 前缀匹配，兼容 path 末尾有无斜杠；文件本身等于 path 也算）
  const touched = mono.packages.filter(p => {
    const prefix = (p.path || '').replace(/\/+$/, '');
    return norm.some(f => f === prefix || f.startsWith(prefix + '/'));
  });

  if (touched.length === 0) return [];

  // 每个触及的 package 生成一份「根 + package.rules」deepMerge 后的规则集。
  // deepMerge 语义：package.rules 里未写的字段（如 enabled）继承根规则，不被 undefined 冲掉
  // （Hermes 验收要点：只写 types、不写 enabled 时，enabled 保留根规则的 true）。
  return touched.map(p => deepMerge<RuleConfig>(rootCommitRule, p.rules ?? {}));
}
