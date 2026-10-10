import { Octokit } from '@octokit/rest';
import { Violation } from '../types';


export async function fixPRField(violation: Violation): Promise<boolean> {
  if (!violation.fixedValue) return false;
  try {
    const token = process.env.GITHUB_TOKEN;
    const [owner, repo] = (process.env.GITHUB_REPOSITORY || '').split('/');
    if (!token || !owner || !repo || !process.env.GITHUB_PR_NUMBER) return false;
    const octokit = new Octokit({ auth: token });
    const pullNumber = Number(process.env.GITHUB_PR_NUMBER);
    if (violation.type === 'pr-title') {
      await octokit.pulls.update({ owner, repo, pull_number: pullNumber, title: violation.fixedValue });
      console.log(`[fix] updated PR title to: ${violation.fixedValue}`);
    } else if (violation.type === 'pr-body' && violation.fixedValue) {
      await octokit.pulls.update({ owner, repo, pull_number: pullNumber, body: violation.fixedValue });
      console.log(`[fix] updated PR body from template`);
    }
    return true;
  } catch (e) {
    console.log(`[fix] PR field fix failed: ${(e as Error).message}`);
    return false;
  }
}
