import { Octokit } from '@octokit/rest';
import { Violation } from '../types';


export interface PRContext {
  octokit: Octokit;
  owner: string;
  repo: string;
  pullNumber: number;
}


export function buildPRContext(): PRContext | null {
  const token = process.env.GITHUB_TOKEN;
  const [owner, repo] = (process.env.GITHUB_REPOSITORY || '').split('/');
  const prNumberStr = process.env.GITHUB_PR_NUMBER;
  if (!token || !owner || !repo || !prNumberStr) return null;
  return {
    octokit: new Octokit({ auth: token }),
    owner,
    repo,
    pullNumber: Number(prNumberStr),
  };
}


export async function applyPRFixes(
  violations: Violation[],
  prNumber: number
): Promise<{ fixed: number; failed: number }> {
  const ctx = buildPRContext();
  if (!ctx || !Number.isFinite(prNumber)) {
    return { fixed: 0, failed: 0 };
  }

  const prViolations = violations.filter(v => v.type === 'pr-title' || v.type === 'pr-body');
  const titleViolation = prViolations.find(v => v.type === 'pr-title' && v.fixable && v.fixedValue);
  const bodyViolation = prViolations.find(v => v.type === 'pr-body' && v.fixable && v.fixedValue);

  // 只合并"真正有可修值"的字段；都没有则无需调用 API
  const updatePatch: Record<string, unknown> = {};
  if (titleViolation) updatePatch.title = titleViolation.fixedValue;
  if (bodyViolation) updatePatch.body = bodyViolation.fixedValue;

  if (Object.keys(updatePatch).length === 0) {
    return { fixed: 0, failed: 0 };
  }

  try {
    await ctx.octokit.pulls.update({
      owner: ctx.owner,
      repo: ctx.repo,
      pull_number: prNumber,
      ...updatePatch,
    });
    if (titleViolation) console.log(`[fix] updated PR title to: ${titleViolation.fixedValue}`);
    if (bodyViolation) console.log(`[fix] updated PR body (appended missing sections)`);
    return { fixed: Object.keys(updatePatch).length, failed: 0 };
  } catch (e) {
    console.log(`[fix] PR field fix failed: ${(e as Error).message}`);
    return { fixed: 0, failed: Object.keys(updatePatch).length };
  }
}
