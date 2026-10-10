import { RuleConfig, Violation } from '../types';
export const CONVENTIONAL_TYPES = [
  'feat', 'fix', 'docs', 'style', 'refactor', 'perf',
  'test', 'chore', 'build', 'ci', 'revert'
];

const TYPE_KEYWORDS: Array<{ type: string; keywords: string[] }> = [
  { type: 'fix', keywords: ['fix', 'bug', '修复'] },
  { type: 'feat', keywords: ['add', 'new', 'feat', 'feature', '实现'] },
  { type: 'docs', keywords: ['docs', 'readme', '文档'] },
  { type: 'test', keywords: ['test', '测试'] },
  { type: 'refactor', keywords: ['refactor', '重构'] },
  { type: 'perf', keywords: ['perf', '优化'] },
];

function guessTypeFromText(text: string, allowed?: string[]): string {
  const lower = text.toLowerCase();
  let guess = 'chore';
  for (const { type, keywords } of TYPE_KEYWORDS) {
    if (allowed && !allowed.includes(type)) continue;
    if (keywords.some(k => lower.includes(k))) {
      guess = type;
      break;
    }
  }
  return guess;
}
export function validateCommitMessage(msg: string, cfg: RuleConfig): Violation[] {
  const violations: Violation[] = [];
  if (!cfg.enabled) return violations;
  const lines = msg.trim().split('\n');
  const header = lines[0] || '';
  const match = header.match(/^(\w+)(\(([^)]+)\))?: (.+)$/);
  if (!match) {
    violations.push({
      type: 'commit-message',
      message: 'Commit message must follow Conventional Commits format: type(scope): subject',
      rule: 'format',
      severity: 'error',
      fixable: true,
      fixedValue: guessFixedCommit(msg, cfg)
    });
    return violations;
  }
  const [, type, , scope, subject] = match;
  if (cfg.types && !cfg.types.includes(type)) {
    const guessType = guessTypeFromText(header, cfg.types);
    const correctedType = cfg.types?.includes(guessType) ? guessType : cfg.types[0];
    const boundary = new RegExp(`^${type}(?=[\\s(:])`);
    violations.push({
      type: 'commit-message',
      message: `Invalid type "${type}". Allowed: ${cfg.types.join(', ')}`,
      rule: 'type',
      severity: 'error',
      fixable: true,
      fixedValue: boundary.test(header)
        ? header.replace(boundary, correctedType)
        : header
    });
  }
  if (cfg.scopeRegex && scope && !new RegExp(cfg.scopeRegex).test(scope)) {
    violations.push({
      type: 'commit-message',
      message: `Scope "${scope}" does not match pattern ${cfg.scopeRegex}`,
      rule: 'scope',
      severity: 'error',
      fixable: false
    });
  }
  if (cfg.subjectMaxLength && subject.length > cfg.subjectMaxLength) {
    violations.push({
      type: 'commit-message',
      message: `Subject exceeds ${cfg.subjectMaxLength} chars (got ${subject.length})`,
      rule: 'subject-length',
      severity: 'error',
      fixable: true,
      fixedValue: lines.map((l, i) => i === 0
        ? `${type}${scope ? `(${scope})` : ''}: ${subject.slice(0, cfg.subjectMaxLength!)}`
        : l).join('\n')
    });
  }
  return violations;
}
function guessFixedCommit(msg: string, cfg: RuleConfig): string {
  const firstLine = msg.trim().split('\n')[0];
  const guessType = guessTypeFromText(firstLine, cfg.types);
  const type = cfg.types?.includes(guessType) ? guessType : (cfg.types?.[0] || 'chore');
  const subject = firstLine.replace(/^[\w-]+(\([^)]+\))?:\s*/, '').trim() || firstLine;
  return `${type}: ${subject}`;
}
