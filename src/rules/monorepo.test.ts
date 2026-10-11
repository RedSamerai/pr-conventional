import { describe, it, expect } from 'vitest';
import { routeConfigs } from './monorepo';
import { Config, RuleConfig } from '../types';


const root = {
  enabled: true,
  types: ['feat', 'fix', 'docs'],
  subjectMaxLength: 72,
} as RuleConfig;


function mkConfig(mono: Config['monorepo']): Config {
  return {
    rules: {
      'commit-message': root,
      'pr-title': { enabled: true, maxLength: 100 },
    },
    monorepo: mono,
  } as Config;
}


describe('routeConfigs (monorepo per-package routing, commit-message only)', () => {
  it('monorepo disabled -> [] (callers fall back to root)', () => {
    const cfg = mkConfig({ enabled: false, packages: [{ path: 'packages/frontend', rules: { types: ['feat'] } }] });
    expect(routeConfigs(['packages/frontend/a.ts'], cfg)).toEqual([]);
  });

  it('no packages -> []', () => {
    const cfg = mkConfig({ enabled: true });
    expect(routeConfigs(['a.ts'], cfg)).toEqual([]);
  });

  it('single package match -> one effective rule set (root deep-merged with package.rules)', () => {
    const cfg = mkConfig({
      enabled: true,
      packages: [
        { path: 'packages/frontend', rules: { types: ['feat'], subjectMaxLength: 40 } },
        { path: 'packages/backend', rules: { types: ['fix'] } },
      ],
    });
    const out = routeConfigs(['packages/frontend/src/a.ts'], cfg);
    expect(out).toHaveLength(1);
    expect(out[0].types).toEqual(['feat']);
    expect(out[0].subjectMaxLength).toBe(40);
    expect(out[0].enabled).toBe(true);
  });

  it('multiple packages touched -> one rule set per package (strictest: validate each)', () => {
    const cfg = mkConfig({
      enabled: true,
      packages: [
        { path: 'packages/frontend', rules: { types: ['feat'] } },
        { path: 'packages/backend', rules: { types: ['fix'] } },
        { path: 'packages/shared', rules: { types: ['docs'] } },
      ],
    });
    const out = routeConfigs(
      ['packages/frontend/a.ts', 'packages/backend/b.ts', 'packages/shared/c.ts'],
      cfg
    );
    expect(out).toHaveLength(3);
    expect(out.map(r => r.types)).toEqual([['feat'], ['fix'], ['docs']]);
  });

  it('only root-level files changed -> [] (fall back to root config)', () => {
    const cfg = mkConfig({
      enabled: true,
      packages: [{ path: 'packages/frontend', rules: { types: ['feat'] } }],
    });
    expect(routeConfigs(['README.md', '.github/ci.yml'], cfg)).toEqual([]);
  });

  it('null / empty changedFiles -> [] (merge commit / shallow clone fallback)', () => {
    const cfg = mkConfig({
      enabled: true,
      packages: [{ path: 'packages/frontend', rules: { types: ['feat'] } }],
    });
    expect(routeConfigs(null, cfg)).toEqual([]);
    expect(routeConfigs([], cfg)).toEqual([]);
  });

  it('path prefix match ignores trailing slash in package.path', () => {
    const cfg = mkConfig({
      enabled: true,
      packages: [{ path: 'packages/frontend/', rules: { types: ['feat'] } }],
    });
    const out = routeConfigs(['packages/frontend/a.ts'], cfg);
    expect(out).toHaveLength(1);
  });

  it('a file equal to package.path itself counts as inside it', () => {
    const cfg = mkConfig({
      enabled: true,
      packages: [{ path: 'packages/frontend', rules: { types: ['feat'] } }],
    });
    expect(routeConfigs(['packages/frontend'], cfg)).toHaveLength(1);
  });

  // Hermes 验收补充点：package.rules 只写 types、不写 enabled 时，
  // deepMerge 后 enabled 必须继承根 commit-message 的 true，不能被 undefined 冲掉
  it('package.rules omits enabled -> inherits root enabled=true (not undefined)', () => {
    const cfg = mkConfig({
      enabled: true,
      packages: [{ path: 'packages/frontend', rules: { types: ['feat'] } }],
    });
    const out = routeConfigs(['packages/frontend/a.ts'], cfg);
    expect(out).toHaveLength(1);
    expect(out[0].enabled).toBe(true);
    // 显式断言不是 undefined / false
    expect(out[0].enabled).not.toBeUndefined();
    expect(out[0].enabled).not.toBe(false);
  });

  it('package.rules explicitly enables/disables independently of root', () => {
    const cfg = mkConfig({
      enabled: true,
      packages: [{ path: 'packages/frontend', rules: { enabled: false, types: ['feat'] } }],
    });
    const out = routeConfigs(['packages/frontend/a.ts'], cfg);
    expect(out).toHaveLength(1);
    expect(out[0].enabled).toBe(false); // package 显式覆盖根
  });
});
