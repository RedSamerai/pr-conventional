import { RuleConfig, Violation } from '../types';


export function validatePRTitle(title: string, cfg: RuleConfig): Violation[] {
  const violations: Violation[] = [];
  if (!cfg.enabled) return violations;


  if (cfg.maxLength && title.length > cfg.maxLength) {
    violations.push({
      type: 'pr-title',
      message: `PR title exceeds ${cfg.maxLength} chars (got ${title.length})`,
      rule: 'pr-title-length',
      severity: 'error',
      fixable: true,
      fixedValue: title.slice(0, cfg.maxLength - 1) + '…'
    });
  }


  if (cfg.pattern) {
    if (!new RegExp(cfg.pattern).test(title)) {
      violations.push({
        type: 'pr-title',
        message: `PR title "${title}" does not match required pattern: ${cfg.pattern}`,
        rule: 'pr-title-pattern',
        severity: 'error',
        fixable: false
      });
    }
  }


  return violations;
}
