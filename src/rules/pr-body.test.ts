import { describe, it, expect } from 'vitest';
import { validatePRBody } from './pr-body';


const cfg = {
  enabled: true,
  requiredSections: ['测试方案', '回滚方案'],
  template: '## 测试方案\n\n## 回滚方案\n'
};


describe('validatePRBody', () => {
  it('passes body with all sections', () => {
    expect(validatePRBody('测试方案：x\n回滚方案：y', cfg)).toHaveLength(0);
  });
  it('flags missing section', () => {
    const v = validatePRBody('只有测试方案', cfg);
    expect(v.some(x => x.rule === 'pr-body-section' && x.message.includes('回滚方案'))).toBe(true);
  });
  it('disabled returns nothing', () => {
    expect(validatePRBody('', { enabled: false })).toHaveLength(0);
  });
});
