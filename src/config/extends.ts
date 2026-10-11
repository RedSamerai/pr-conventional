import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parse } from 'yaml';
import type { Config } from '../types';


const EXTENDS_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_EXTENDS_LEN = 100_000;


function defaultCacheDir(): string {
  const home = process.env.HOME || os.homedir();
  return path.join(home, '.cache', 'pr-conventional', 'extends');
}


export interface ExtendsFetchOptions {
  /** 覆盖默认缓存目录（测试用） */
  cacheDir?: string;
  /** 注入自定义 fetch（测试 mock 用）；默认用 Node 全局 fetch */
  fetchImpl?: typeof fetch;
}


function cacheKeyFor(url: string): string {
  // 简化哈希：取 URL 的稳定摘要（不做完整 sha256，避免引入依赖）
  let h = 5381;
  for (let i = 0; i < url.length; i++) h = ((h << 5) + h + url.charCodeAt(i)) >>> 0;
  return h.toString(16);
}


function readCache(url: string, cacheDir: string): Partial<Config> | null {
  const file = path.join(cacheDir, `${cacheKeyFor(url)}.json`);
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const { fetchedAt, body } = JSON.parse(raw) as { fetchedAt: number; body: Partial<Config> };
    if (Date.now() - fetchedAt > EXTENDS_TTL_MS) return null;
    if (typeof body !== 'object' || body === null) return null;
    return body;
  } catch {
    return null;
  }
}


function writeCache(url: string, body: Partial<Config>, cacheDir: string): void {
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    const file = path.join(cacheDir, `${cacheKeyFor(url)}.json`);
    fs.writeFileSync(file, JSON.stringify({ fetchedAt: Date.now(), body }), 'utf8');
  } catch {
    // 缓存写失败不阻塞主流程
  }
}


function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}


export async function loadExtends(
  extendsVal: string | string[] | undefined,
  options: ExtendsFetchOptions = {}
): Promise<Partial<Config>> {
  if (!extendsVal) return {};

  const list: string[] = Array.isArray(extendsVal) ? extendsVal : [extendsVal];
  const cacheDir = options.cacheDir || process.env.CONFIG_CACHE_DIR || defaultCacheDir();
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  let merged: Record<string, unknown> = {};
  for (const url of list) {
    if (!isHttpUrl(url)) {
      console.log(`[pr-conventional] extends: ignoring non-URL "${url}" (only http(s) allowed)`);
      continue;
    }

    // 1) 命中缓存
    const cached = readCache(url, cacheDir);
    if (cached) {
      console.log(`[pr-conventional] extends: using cached "${url}"`);
      merged = { ...merged, ...cached };
      continue;
    }

    // 2) 远程拉取
    let ok = false;
    try {
      if (typeof fetchImpl !== 'function') {
        throw new Error('fetch unavailable in this runtime');
      }
      const res = await fetchImpl(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const text = await res.text();
      if (text.length > MAX_EXTENDS_LEN) {
        throw new Error('response too large');
      }
      const body = JSON.parse(text) as Partial<Config>;
      if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        throw new Error('not a JSON object');
      }
      writeCache(url, body, cacheDir);
      merged = { ...merged, ...body };
      ok = true;
      console.log(`[pr-conventional] extends: fetched "${url}"`);
    } catch (e) {
      console.log(`[pr-conventional] extends: failed to fetch "${url}" (${(e as Error).message}); falling back to built-in defaults`);
    }
    if (!ok) {
      // 单条失败：继续尝试其余 extends；全部失败时 merged 保持 {} → 上层回退默认
    }
  }

  return merged as Partial<Config>;
}


export async function resolveExtendsConfig(
  base: Partial<Config>,
  extendsVal: string | string[] | undefined,
  options: ExtendsFetchOptions = {}
): Promise<Partial<Config>> {
  const ext = await loadExtends(extendsVal, options);
  return deepMergeConfigs(base, ext);
}


export function deepMergeConfigs(
  target: Partial<Config>,
  source: Partial<Config>
): Partial<Config> {
  const out: Record<string, unknown> = { ...(target as unknown as Record<string, unknown>) };
  for (const [key, value] of Object.entries(source)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)
      && out[key] && typeof out[key] === 'object' && !Array.isArray(out[key])) {
      out[key] = deepMergeConfigs(out[key] as Partial<Config>, value as Partial<Config>);
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out as Partial<Config>;
}


export { parse as parseYamlConfig };
