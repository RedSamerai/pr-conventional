import { Octokit } from '@octokit/rest';
import { Violation } from '../types';


export interface PRContext {
  octokit: Octokit;
  owner: string;
  repo: string;
  pullNumber: number;
}


export function buildPRContext(prNumber: number, tokenOverride?: string): PRContext | null {
  // token 优先级：调用方传入的 tokenOverride（input('token')/裸 env）> 平台注入的 GITHUB_TOKEN
  const token = tokenOverride || process.env.GITHUB_TOKEN;
  const [owner, repo] = (process.env.GITHUB_REPOSITORY || '').split('/');
  if (!token || !owner || !repo || !Number.isFinite(prNumber)) return null;
  return {
    octokit: new Octokit({ auth: token }),
    owner,
    repo,
    pullNumber: prNumber,
  };
}


export async function applyPRFixes(
  violations: Violation[],
  prNumber: number,
  tokenOverride?: string
): Promise<{ fixed: number; failed: number; removedRules: string[] }> {
  const ctx = buildPRContext(prNumber, tokenOverride);
  if (!ctx) {
    return { fixed: 0, failed: 0, removedRules: [] };
  }

  const prViolations = violations.filter(v => v.type === 'pr-title' || v.type === 'pr-body');
  const titleViolation = prViolations.find(v => v.type === 'pr-title' && v.fixable && v.fixedValue);
  const bodyViolation = prViolations.find(v => v.type === 'pr-body' && v.fixable && v.fixedValue);

  // 只合并"真正有可修值"的字段；都没有则无需调用 API
  const updatePatch: Record<string, unknown> = {};
  if (titleViolation) updatePatch.title = titleViolation.fixedValue;
  if (bodyViolation) updatePatch.body = bodyViolation.fixedValue;

  if (Object.keys(updatePatch).length === 0) {
    return { fixed: 0, failed: 0, removedRules: [] };
  }

  // 本次更新实际清除的 rule（title 对应 pr-title-length；body 对应 pr-body-section / pr-body-template）
  const rulesCleared: string[] = [];
  if (updatePatch.title !== undefined) rulesCleared.push('pr-title-length');
  if (updatePatch.body !== undefined) rulesCleared.push('pr-body-section', 'pr-body-template');

  try {
    await ctx.octokit.pulls.update({
      owner: ctx.owner,
      repo: ctx.repo,
      pull_number: ctx.pullNumber,
      ...updatePatch,
    });
    if (titleViolation) console.log(`[fix] updated PR title to: ${titleViolation.fixedValue}`);
    if (bodyViolation) console.log(`[fix] updated PR body (appended missing sections)`);
    // fixed = 本次修复后从 violations 中移除的条数（与 index.ts 的 filter 语义对齐）
    const removed = violations.filter(v => rulesCleared.includes(v.rule)).length;
    return { fixed: removed, failed: 0, removedRules: rulesCleared };
  } catch (e) {
    console.log(`[fix] PR field fix failed: ${(e as Error).message}`);
    return { fixed: 0, failed: Object.keys(updatePatch).length, removedRules: [] };
  }
}
