import { describe, it, expect } from 'vitest';
import { validatePRTitle } from './pr-title';


const cfg = { enabled: true, maxLength: 100, pattern: '^(feat|fix|docs|chore|refactor)\\(\\w+\\): .+' };


describe('validatePRTitle', () => {
  it('passes compliant title', () => {
    expect(validatePRTitle('feat(auth): add login', cfg)).toHaveLength(0);
  });
  it('flags non-matching pattern', () => {
    const v = validatePRTitle('some random title', cfg);
    expect(v.some(x => x.rule === 'pr-title-pattern')).toBe(true);
  });
  it('flags over-length title', () => {
    const v = validatePRTitle('feat(auth): ' + 'a'.repeat(120), cfg);
    expect(v.some(x => x.rule === 'pr-title-length')).toBe(true);
  });
  it('disabled returns nothing', () => {
    expect(validatePRTitle('whatever', { enabled: false })).toHaveLength(0);
  });
});
