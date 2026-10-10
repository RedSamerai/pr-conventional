import { describe, it, expect } from 'vitest';
import { fixPRField } from './github';


describe('fixPRField', () => {
  it('skips when no fixedValue', async () => {
    const ok = await fixPRField({ type: 'pr-title', message: '', rule: '', severity: 'error', fixable: true });
    expect(ok).toBe(false);
  });
  it('skips when GITHUB_REPOSITORY missing', async () => {
    delete process.env.GITHUB_REPOSITORY;
    delete process.env.GITHUB_PR_NUMBER;
    const ok = await fixPRField({ type: 'pr-title', message: '', rule: '', severity: 'error', fixable: true, fixedValue: 'x' });
    expect(ok).toBe(false);
  });
});
