import simpleGit from 'simple-git';
import { Violation } from '../types';


const PROTECTED = new Set(['main', 'master', 'release', 'develop']);


export async function fixCommitMessage(violation: Violation): Promise<boolean> {
  if (!violation.fixedValue) return false;
  try {
    const git = simpleGit(process.env.GITHUB_WORKSPACE || '.');
    const branch = (await git.revparse(['--abbrev-ref', 'HEAD'])).trim();
    if (PROTECTED.has(branch)) {
      console.log(`[fix] skipping commit fix: ${branch} is protected`);
      return false;
    }
    await git.commit(['--amend', '-m', violation.fixedValue, '--no-edit']);
    await git.push(['--force-with-lease', 'origin', branch]);
    console.log(`[fix] amended commit to: ${violation.fixedValue}`);
    return true;
  } catch (e) {
    console.log(`[fix] commit fix failed: ${(e as Error).message}`);
    return false;
  }
}
