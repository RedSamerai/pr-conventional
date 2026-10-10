import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';




function runDist(env: Record<string, string>): { out: string; exit: number } {
  try {
    const out = execSync('node dist/index.js', {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, ...env },
    });
    return { out, exit: 0 };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; status?: number };
    return { out: (err.stdout || '') + (err.stderr || ''), exit: err.status ?? 1 };
  }
}


describe('P0 regression: action inputs actually reach the code (GitHub INPUT_* injection)', () => {
  it('INPUT_FIX_MODE=true + INPUT_CONFIG_PATH drive real behavior', () => {
    const dir = mkdtempSync(join(tmpdir(), 'p0-input-'));
    const cfgFile = join(dir, 'custom-cfg.yml');
    writeFileSync(cfgFile, [
      "fixMode: false",
      "rules:",
      "  'pr-body':",
      "    enabled: true",
      "    requiredSections: [部署说明]",
      "",
    ].join('\n'));

    const prEvent = join(dir, 'pr.json');
    writeFileSync(prEvent, JSON.stringify({
      pull_request: { number: 42, title: 'feat(x): t', body: '这是说明文字，但缺少要求的段落' },
    }));

    const { out, exit } = runDist({
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_EVENT_PATH: prEvent,
      GITHUB_REPOSITORY: 't/r',
      GITHUB_TOKEN: 'x',
      INPUT_CONFIG_PATH: cfgFile,
      INPUT_FIX_MODE: 'true',
    });

    expect(out).toContain('missing required section: "部署说明"');
    // fix-mode=true 会真正发起 PR 修复（本地测试 token 无效 → 报 "fix failed"，
    // 而不是静默跳过——证明 INPUT_FIX_MODE 真的接通了修复路径）
    expect(out).toContain('[fix] PR field fix failed');
    // 修不掉 → 违规仍在 → 非 0 退出（即报错）
    expect(exit).not.toBe(0);
    rmSync(dir, { recursive: true, force: true });
  });

  it('INPUT_CONFIG_PATH falls back to bare CONFIG_PATH when INPUT_ absent', () => {
    const dir = mkdtempSync(join(tmpdir(), 'p0-bare-'));
    const cfgFile = join(dir, 'bare-cfg.yml');
    writeFileSync(cfgFile, [
      "rules:",
      "  'pr-title':",
      "    enabled: true",
      "    pattern: '^(feat|fix): .+$'",
      "",
    ].join('\n'));
    const prEvent = join(dir, 'pr.json');
    writeFileSync(prEvent, JSON.stringify({
      pull_request: { number: 1, title: 'bad title', body: '' },
    }));

    const { out } = runDist({
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_EVENT_PATH: prEvent,
      GITHUB_REPOSITORY: 't/r',
      GITHUB_TOKEN: 'x',
      CONFIG_PATH: cfgFile,
    });
    expect(out).toContain('pr-title-pattern');
    rmSync(dir, { recursive: true, force: true });
  });
});
