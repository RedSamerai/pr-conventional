import { describe, it, expect } from 'vitest';
import { validateCommitMessage, CONVENTIONAL_TYPES } from './conventional';


const cfg = { enabled: true, types: CONVENTIONAL_TYPES, subjectMaxLength: 72 };


describe('validateCommitMessage', () => {
  it('passes valid commit', () => {
    expect(validateCommitMessage('feat(auth): add login', cfg)).toHaveLength(0);
  });
  it('flags malformed header', () => {
    const v = validateCommitMessage('fix bug', cfg);
    expect(v.length).toBe(1);
    expect(v[0].rule).toBe('format');
    expect(v[0].fixable).toBe(true);
  });
  it('flags invalid type', () => {
    const v = validateCommitMessage('foo: bar', cfg);
    expect(v.some(x => x.rule === 'type')).toBe(true);
  });
  it('flags long subject', () => {
    const v = validateCommitMessage(`feat: ${'a'.repeat(80)}`, cfg);
    expect(v.some(x => x.rule === 'subject-length')).toBe(true);
  });
  it('disabled config returns nothing', () => {
    expect(validateCommitMessage('anything', { enabled: false })).toHaveLength(0);
  });
});
