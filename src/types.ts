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
  /**
   * 继承远程或本地规则包。
   * - 接受单个 URL 字符串或字符串数组
   * - 仅支持 http(s) URL（避免供应链风险，不支持本地相对路径）
   * - 加载失败时静默回退到内置默认规则
   */
  extends?: string | string[];
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
