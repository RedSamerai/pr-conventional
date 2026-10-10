import { RuleConfig, Violation } from '../types';
export const CONVENTIONAL_TYPES = [
  'feat', 'fix', 'docs', 'style', 'refactor', 'perf',
  'test', 'chore', 'build', 'ci', 'revert'
];
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
    violations.push({
      type: 'commit-message',
      message: `Invalid type "${type}". Allowed: ${cfg.types.join(', ')}`,
      rule: 'type',
      severity: 'error',
      fixable: true,
      fixedValue: header.replace(type, cfg.types[0])
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
  const type = cfg.types?.[0] || 'chore';
  const subject = firstLine.replace(/^[\w-]+(\([^)]+\))?:\s*/, '').trim() || firstLine;
  return `${type}: ${subject.charAt(0).toLowerCase()}${subject.slice(1)}`;
}
