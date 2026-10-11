import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadExtends, resolveExtendsConfig } from './extends';
import type { Config } from '../types';


let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-test-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});


class FakeRes {
  ok: boolean;
  status: number;
  private body: string;
  constructor(ok: boolean, status: number, body: string) {
    this.ok = ok; this.status = status; this.body = body;
  }
  text() { return Promise.resolve(this.body); }
}


function makeFetch(responses: Map<string, { ok: boolean; status: number; body: string }>, calls: string[]) {
  return (async (url: string | URL) => {
    const key = String(url);
    calls.push(key);
    const r = responses.get(key);
    if (!r) {
      // 未 mock 的 URL → 模拟网络失败
      throw new Error(`network down for ${key}`);
    }
    return new FakeRes(r.ok, r.status, r.body);
  }) as unknown as typeof fetch;
}


describe('loadExtends', () => {
  it('empty/undefined -> {}', async () => {
    expect(await loadExtends(undefined, { cacheDir: tmpDir })).toEqual({});
    expect(await loadExtends('' as unknown as string, { cacheDir: tmpDir })).toEqual({});
  });

  it('ignores non-http URLs (no fetch call, no crash)', async () => {
    const calls: string[] = [];
    const r = await loadExtends(['file:///etc/passwd', './local.yml'], {
      cacheDir: tmpDir,
      fetchImpl: makeFetch(new Map(), calls) as typeof fetch,
    });
    expect(r).toEqual({});
    expect(calls).toEqual([]);
  });

  it('fetches a valid URL and caches it; second call uses cache (no 2nd fetch)', async () => {
    const payload: Config = {
      rules: {
        'commit-message': { enabled: true, types: ['feat'], subjectMaxLength: 50 },
        'pr-title': { enabled: true, maxLength: 60, pattern: '^feat: .+' },
      },
    };
    const url = 'https://example.test/rules.json';
    const responses = new Map([
      [url, { ok: true, status: 200, body: JSON.stringify(payload) }],
    ]);
    const calls: string[] = [];
    const fetchImpl = makeFetch(responses, calls) as typeof fetch;

    const r1 = await loadExtends(url, { cacheDir: tmpDir, fetchImpl });
    expect(r1.rules?.['commit-message']?.types).toEqual(['feat']);
    expect(calls.length).toBe(1);

    // 第二次：命中缓存，不再 fetch
    const r2 = await loadExtends(url, { cacheDir: tmpDir, fetchImpl });
    expect(r2.rules?.['pr-title']?.pattern).toBe('^feat: .+');
    expect(calls.length).toBe(1); // 没有第二次 fetch
  });

  it('fetch failure -> returns {} (fallback to built-in) and logs', async () => {
    const calls: string[] = [];
    const r = await loadExtends('https://down.test/x.json', {
      cacheDir: tmpDir,
      fetchImpl: makeFetch(new Map(), calls) as typeof fetch,
    });
    expect(r).toEqual({});
    expect(calls.length).toBe(1);
  });

  it('HTTP non-200 -> fallback to {}', async () => {
    const responses = new Map([
      ['https://err.test/x.json', { ok: false, status: 404, body: 'not found' }],
    ]);
    const r = await loadExtends('https://err.test/x.json', {
      cacheDir: tmpDir,
      fetchImpl: makeFetch(responses, []) as typeof fetch,
    });
    expect(r).toEqual({});
  });

  it('array of extends merges in order (later wins on conflict)', async () => {
    const a: Config = { rules: { 'commit-message': { enabled: true, types: ['feat'], subjectMaxLength: 72 }, 'pr-title': { enabled: true, maxLength: 100 } } };
    const b: Config = { rules: { 'commit-message': { enabled: true, types: ['fix'], subjectMaxLength: 72 }, 'pr-title': { enabled: true, maxLength: 100 } } };
    const urlA = 'https://m.test/a.json';
    const urlB = 'https://m.test/b.json';
    const responses = new Map([
      [urlA, { ok: true, status: 200, body: JSON.stringify(a) }],
      [urlB, { ok: true, status: 200, body: JSON.stringify(b) }],
    ]);
    const r = await loadExtends([urlA, urlB], {
      cacheDir: tmpDir,
      fetchImpl: makeFetch(responses, []) as typeof fetch,
    });
    // b 覆盖 a：types 应为 ['fix']
    expect(r.rules?.['commit-message']?.types).toEqual(['fix']);
  });

  it('resolveExtendsConfig merges extends over base, base wins on non-overlap', async () => {
    const base: Partial<Config> = {
      rules: { 'commit-message': { enabled: true, types: ['feat', 'fix'], subjectMaxLength: 72 }, 'pr-title': { enabled: true, maxLength: 100 } },
    };
    const ext: Partial<Config> = {
      rules: { 'commit-message': { enabled: true }, 'pr-title': { enabled: true, maxLength: 120, pattern: '^feat: .+' } },
    };
    const url = 'https://r.test/base.json';
    const responses = new Map([[url, { ok: true, status: 200, body: JSON.stringify(ext) }]]);
    const r = await resolveExtendsConfig(base, url, {
      cacheDir: tmpDir,
      fetchImpl: makeFetch(responses, []) as typeof fetch,
    });
    // extends 覆盖 pr-title.maxLength=120，且 pattern 被追加
    expect(r.rules?.['pr-title']?.maxLength).toBe(120);
    expect(r.rules?.['pr-title']?.pattern).toBe('^feat: .+');
    // commit-message 未被 extends 触碰 → 保持 base
    expect(r.rules?.['commit-message']?.types).toEqual(['feat', 'fix']);
  });
});
