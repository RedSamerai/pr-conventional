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
    // 关键词推断：subject 含 "fix" → 类型 fix，不强制小写
    expect(v[0].fixedValue).toBe('fix: fix bug');
  });
  it('keyword inference: "add feature" → feat', () => {
    const v = validateCommitMessage('add new feature', cfg);
    expect(v[0].fixedValue).toBe('feat: add new feature');
  });
  it('keyword inference: "Update README" → docs，且不强制小写', () => {
    const v = validateCommitMessage('Update README', cfg);
    expect(v[0].fixedValue).toBe('docs: Update README');
  });
  it('keyword inference: "重构用户模块" → refactor', () => {
    const v = validateCommitMessage('重构用户模块', cfg);
    expect(v[0].fixedValue).toBe('refactor: 重构用户模块');
  });
  it('keyword precedence: fix beats feat when both present', () => {
    const v = validateCommitMessage('fix bug and add guard', cfg);
    expect(v[0].fixedValue).toBe('fix: fix bug and add guard');
  });
  it('no keyword → chore fallback', () => {
    const v = validateCommitMessage('bump deps', cfg);
    expect(v[0].fixedValue).toBe('chore: bump deps');
  });
  it('type violation uses word-boundary replacement, not first-occurrence replace', () => {
    // "feature: add docs" → type "feature" 无效；关键词优先级 feat(add) 先于 docs → feat
    const v = validateCommitMessage('feature: add docs', cfg);
    const t = v.find(x => x.rule === 'type');
    expect(t).toBeDefined();
    expect(t!.fixedValue).toBe('feat: add docs');
    // 且不误伤 subject 里的同名词
  });
  it('type violation does not damage subject containing same word', () => {
    // "ref: docs"：type "ref" 无效；subject "docs" 不应被替换
    const v = validateCommitMessage('ref: docs', cfg);
    const t = v.find(x => x.rule === 'type');
    expect(t).toBeDefined();
    // 关键词 docs → docs，边界替换 "ref"
    expect(t!.fixedValue).toBe('docs: docs');
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
