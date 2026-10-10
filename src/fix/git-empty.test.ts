import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fixCommitMessage } from './git';
import { Violation } from '../types';


function git(dir: string, args: string): string {
  return execSync(`git -C "${dir}" ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}


// 构造：基础 commit（有内容）+ 一个 --allow-empty 的坏 commit，分支非 protected、无 origin
function makeEmptyCommitRepo(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'fix-empty-'));
  git(dir, 'init -q');
  git(dir, 'config user.name t');
  git(dir, 'config user.email t@t.com');
  git(dir, 'checkout -q -b work');
  writeFileSync(join(dir, 'f.txt'), 'x');
  git(dir, 'add .');
  git(dir, 'commit -q -m base');
  git(dir, 'commit -q --allow-empty -m "Bad empty msg"');
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}


describe('fixCommitMessage on empty commit (--allow-empty regression)', () => {
  it('amends an --allow-empty commit: message + sha change even when push fails', async () => {
    const { dir, cleanup } = makeEmptyCommitRepo();
    const shaBefore = git(dir, 'rev-parse HEAD').trim();
    const msgBefore = git(dir, 'log -1 --format=%s').trim();
    expect(msgBefore).toBe('Bad empty msg');
    process.env.GITHUB_WORKSPACE = dir;
    try {
      const v: Violation = {
        type: 'commit-message',
        message: 'bad',
        rule: 'format',
        severity: 'error',
        fixable: true,
        fixedValue: 'feat: proper',
      };
      // 无 origin remote → push 必然失败，fixCommitMessage 返回 ok:false；
      // 但 --allow-empty 的 amend 本身已生效（本地 HEAD 已变）
      await fixCommitMessage(v);
      const shaAfter = git(dir, 'rev-parse HEAD').trim();
      const msgAfter = git(dir, 'log -1 --format=%s').trim();
      expect(msgAfter).toBe('feat: proper');
      expect(shaAfter).not.toBe(shaBefore);
    } finally {
      delete process.env.GITHUB_WORKSPACE;
      cleanup();
    }
  });
});
