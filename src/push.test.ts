import { describe, it, expect } from 'vitest';
import { resolvePushCommits } from './index';


describe('resolvePushCommits (e2e on this repo)', () => {
  it('fallback path returns last N commits (default 1)', async () => {
    delete process.env.GITHUB_EVENT_NAME;
    delete process.env.GITHUB_EVENT_PATH;
    delete process.env.CHECK_LAST_N_COMMITS;
    process.env.GITHUB_WORKSPACE = process.cwd();
    const commits = await resolvePushCommits();
    expect(commits.length).toBe(1);
    expect(commits[0].sha).toMatch(/^[0-9a-f]{40}$/);
    expect(commits[0].message.length).toBeGreaterThan(0);
  });

  it('CHECK_LAST_N_COMMITS=3 returns up to 3 commits', async () => {
    delete process.env.GITHUB_EVENT_NAME;
    delete process.env.GITHUB_EVENT_PATH;
    process.env.GITHUB_WORKSPACE = process.cwd();
    process.env.CHECK_LAST_N_COMMITS = '3';
    try {
      const commits = await resolvePushCommits();
      expect(commits.length).toBeLessThanOrEqual(3);
      expect(commits.length).toBeGreaterThan(0);
    } finally {
      delete process.env.CHECK_LAST_N_COMMITS;
    }
  });
});
