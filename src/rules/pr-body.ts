import { RuleConfig, Violation } from '../types';


export function appendMissingSections(body: string, missingSections: string[]): string {
  if (missingSections.length === 0) return body;
  const base = body.trim() ? body.replace(/\s+$/, '') : '';
  const additions = missingSections.map(s => `\n## ${s}\n`);
  return base ? `${base}\n${additions.join('\n')}` : additions.join('').trimStart();
}


export function validatePRBody(body: string, cfg: RuleConfig): Violation[] {
  const violations: Violation[] = [];
  if (!cfg.enabled) return violations;


  if (cfg.requiredSections) {
    const missing = cfg.requiredSections.filter(s => !body.includes(s));
    if (missing.length > 0) {
      for (const section of missing) {
        violations.push({
          type: 'pr-body',
          message: `PR body is missing required section: "${section}"`,
          rule: 'pr-body-section',
          severity: 'error',
          fixable: true,
          fixedValue: undefined
        });
      }
      // 追加语义：保留原 body，仅补缺失 section（统一可修值挂在第一条 section violation 上）
      violations.find(v => v.rule === 'pr-body-section')!.fixedValue = appendMissingSections(body, missing);
    }
  }


  if (cfg.template && body.trim() === '' && violations.length > 0) {
    violations.push({
      type: 'pr-body',
      message: 'PR body is empty; applying team template',
      rule: 'pr-body-template',
      severity: 'warning',
      fixable: true,
      fixedValue: cfg.template
    });
  }


  return violations;
}
