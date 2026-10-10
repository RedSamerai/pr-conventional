import { describe, it, expect, afterEach } from 'vitest';
import { buildPRContext, applyPRFixes } from './github';


const saved = {
  REPO: process.env.GITHUB_REPOSITORY,
  TOKEN: process.env.GITHUB_TOKEN,
};


afterEach(() => {
  if (saved.REPO === undefined) delete process.env.GITHUB_REPOSITORY; else process.env.GITHUB_REPOSITORY = saved.REPO;
  if (saved.TOKEN === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = saved.TOKEN;
});


describe('buildPRContext', () => {
  it('returns null when GITHUB_REPOSITORY missing', () => {
    delete process.env.GITHUB_REPOSITORY;
    process.env.GITHUB_TOKEN = 'x';
    expect(buildPRContext(7)).toBeNull();
  });
  it('returns null for non-finite prNumber', () => {
    process.env.GITHUB_REPOSITORY = 'a/b';
    process.env.GITHUB_TOKEN = 'x';
    expect(buildPRContext(NaN)).toBeNull();
  });
  it('returns context when all present', () => {
    process.env.GITHUB_REPOSITORY = 'a/b';
    process.env.GITHUB_TOKEN = 'x';
    const ctx = buildPRContext(7);
    expect(ctx).not.toBeNull();
    expect(ctx!.pullNumber).toBe(7);
  });
});


describe('applyPRFixes', () => {
  it('no-op when no fixable PR violations (returns fixed=0, no API call)', async () => {
    process.env.GITHUB_REPOSITORY = 'a/b';
    process.env.GITHUB_TOKEN = 'x';
    const r = await applyPRFixes(
      [{ type: 'pr-title', message: 'x', rule: 'pr-title-pattern', severity: 'error', fixable: false }],
      7
    );
    expect(r.fixed).toBe(0);
    expect(r.failed).toBe(0);
  });
  it('no-op when context unavailable (missing repo)', async () => {
    delete process.env.GITHUB_REPOSITORY;
    process.env.GITHUB_TOKEN = 'x';
    const r = await applyPRFixes(
      [{ type: 'pr-title', message: 'x', rule: 'pr-title-length', severity: 'error', fixable: true, fixedValue: 't' }],
      7
    );
    expect(r.fixed).toBe(0);
  });
});
