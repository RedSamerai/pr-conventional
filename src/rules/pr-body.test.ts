import { describe, it, expect } from 'vitest';
import { validatePRBody, appendMissingSections } from './pr-body';


const cfg = {
  enabled: true,
  requiredSections: ['测试方案', '回滚方案'],
  template: '## 测试方案\n\n## 回滚方案\n'
};


describe('validatePRBody', () => {
  it('passes body with all sections', () => {
    expect(validatePRBody('测试方案：x\n回滚方案：y', cfg)).toHaveLength(0);
  });
  it('flags missing section and provides append fixedValue (original content preserved)', () => {
    const v = validatePRBody('只有测试方案', cfg);
    const sectionViol = v.filter(x => x.rule === 'pr-body-section');
    expect(sectionViol.some(x => x.message.includes('回滚方案'))).toBe(true);
    // 追加语义：第一条 section violation 携带 fixedValue，原内容保留 + 缺失项追加
    const withFix = sectionViol.find(x => x.fixedValue);
    expect(withFix).toBeDefined();
    expect(withFix!.fixedValue).toContain('只有测试方案');
    expect(withFix!.fixedValue).toContain('回滚方案');
  });
  it('template fixedValue only when body is empty', () => {
    const v = validatePRBody('', cfg);
    const tpl = v.find(x => x.rule === 'pr-body-template');
    expect(tpl).toBeDefined();
    expect(tpl!.fixedValue).toBe(cfg.template);
  });
  it('non-empty body with missing section does NOT produce full-replace template violation', () => {
    const v = validatePRBody('只有测试方案', cfg);
    expect(v.find(x => x.rule === 'pr-body-template')).toBeUndefined();
  });
  it('disabled returns nothing', () => {
    expect(validatePRBody('', { enabled: false })).toHaveLength(0);
  });
});


describe('appendMissingSections', () => {
  it('appends missing sections to existing body in declaration order', () => {
    const out = appendMissingSections('原内容', ['回滚方案']);
    expect(out).toBe('原内容\n\n## 回滚方案\n');
  });
  it('returns body unchanged when nothing missing', () => {
    expect(appendMissingSections('abc', [])).toBe('abc');
  });
  it('handles empty body', () => {
    const out = appendMissingSections('', ['测试方案']);
    expect(out).toContain('## 测试方案');
  });
});
