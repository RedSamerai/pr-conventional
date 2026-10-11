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


/**
 * monorepo 按包路由（v0.2.0）。
 * 每个 commit 按它改动的文件归属到 path 前缀，命中包用「根 config.rules['commit-message']
 * + package.rules」deepMerge 后的规则集校验；触及多个包时各校验一次（最严语义）。
 * 无归属 / merge commit / 浅克隆读不到改动文件 → 回退根配置。
 * PR 标题/正文不路由（整 PR 级别），走根配置（v0.3 再做）。
 *
 * 注意：packages[].rules 是 Partial<RuleConfig>（直接挂 types/scopeRegex 等字段），
 * 不要再套一层 'commit-message'。
 */
export interface MonorepoPackage {
  /** 目录前缀，如 "packages/frontend"；匹配时按「改动文件落在该前缀下」判断 */
  path: string;
  /** 该包的 commit-message 规则覆盖（与根 commit-message 规则 deepMerge） */
  rules?: Partial<RuleConfig>;
}


export interface MonorepoConfig {
  enabled?: boolean;
  packages?: MonorepoPackage[];
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
  monorepo?: MonorepoConfig;
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
