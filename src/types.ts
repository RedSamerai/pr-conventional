/**
 * @schema pr-conventional config — full field reference.
 */
export interface RuleConfig {
  enabled: boolean;
  types?: string[];
  scopeRegex?: string;
  subjectMaxLength?: number;
  pattern?: string;
  maxLength?: number;
  template?: string;
  requiredSections?: string[];
}


export interface CustomRule {
  name: string;
  pattern: string;
  message: string;
  level: 'error' | 'warning';
  targets: ('commit-message' | 'pr-title' | 'pr-body')[];
}


export interface Config {
  extends?: string[];
  fixMode?: boolean;
  monorepo?: boolean;
  rules: {
    'commit-message': RuleConfig;
    'pr-title': RuleConfig;
    'pr-body'?: RuleConfig;
  };
  customRules?: CustomRule[];
}


export interface Violation {
  type: 'commit-message' | 'pr-title' | 'pr-body';
  file?: string;
  line?: number;
  column?: number;
  message: string;
  rule: string;
  severity: 'error' | 'warning';
  fixable: boolean;
  fixedValue?: string;
}
