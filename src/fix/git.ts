import simpleGit, { SimpleGit } from 'simple-git';
import { Violation } from '../types';


const PROTECTED = new Set(['main', 'master', 'release', 'develop']);


export type CommitFixResult =
  | { ok: true }
  | { ok: false; skipped?: boolean; reason?: string };


export function isProtectedBranch(branch: string): boolean {
  return PROTECTED.has(branch);
}


export function createGit(workspace?: string): SimpleGit {
  return simpleGit(workspace || process.env.GITHUB_WORKSPACE || '.');
}


export async function fixCommitMessage(violation: Violation): Promise<CommitFixResult> {
  if (!violation.fixedValue) return { ok: false, reason: 'no fixedValue' };
  try {
    const git = createGit();
    const branch = (await git.revparse(['--abbrev-ref', 'HEAD'])).trim();
    if (PROTECTED.has(branch)) {
      console.log(`[fix] skipped: branch '${branch}' is protected; push your fixed commit manually`);
      return { ok: false, skipped: true, reason: `branch '${branch}' is protected` };
    }
    // 用 raw 透传：simple-git 的 commit() 会吞掉自定义参数（amend 场景参数被丢弃），
    // raw 直接拼 git commit <args>，参数完整。--allow-empty 兜住空 commit amend 被拒的边界。
    await git.raw(['commit', '--amend', '-m', violation.fixedValue, '--no-edit', '--allow-empty']);
    await git.push(['--force-with-lease', 'origin', branch]);
    console.log(`[fix] amended commit to: ${violation.fixedValue}`);
    return { ok: true };
  } catch (e) {
    console.log(`[fix] commit fix failed: ${(e as Error).message}`);
    return { ok: false, reason: (e as Error).message };
  }
}
