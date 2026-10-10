import { RuleConfig, Violation } from '../types';


export function validatePRBody(body: string, cfg: RuleConfig): Violation[] {
  const violations: Violation[] = [];
  if (!cfg.enabled) return violations;


  if (cfg.requiredSections) {
    for (const section of cfg.requiredSections) {
      if (!body.includes(section)) {
        violations.push({
          type: 'pr-body',
          message: `PR body is missing required section: "${section}"`,
          rule: 'pr-body-section',
          severity: 'error',
          fixable: true,
          fixedValue: undefined // 修复逻辑在第 6 步统一处理
        });
      }
    }
  }


  if (cfg.template && violations.length > 0) {
    violations.push({
      type: 'pr-body',
      message: 'PR body does not follow team template (template available in config)',
      rule: 'pr-body-template',
      severity: 'warning',
      fixable: true,
      fixedValue: cfg.template
    });
  }


  return violations;
}
