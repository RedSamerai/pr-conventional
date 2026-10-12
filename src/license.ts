import * as crypto from 'crypto';
import { input, InputKey } from './inputs';
import { Config } from './types';


/**
 * Phase 1 荣誉制：secret 随 dist/index.js（ncc 单文件）公开发布，可被逆向。
 * 接受此风险——Phase 1 只做免费/付费分档门控，不做防破解。
 * Phase 4 会换成服务端验签（secret 不出现在 dist）。
 */
export const PCF_SECRET = '47ba2f13b1acbcfadb1c0f2c72f26dcd111b472c6db4e8113af726bda5f94df0';


export const FREE_TIER_MSG =
  'PR Conventional Fix: FREE tier (no license key). monorepo routing and extends are disabled. A Pro license unlocks them.';

export const INVALID_KEY_MSG =
  'PR Conventional Fix: license key is invalid or expired — running in FREE tier.';


export type LicenseStatus = 'pro' | 'free' | 'invalid';


export function b64url(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf) : buf;
  return b.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}


export function fromB64url(s: string): Buffer {
  let t = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = t.length % 4;
  if (pad === 2) t += '==';
  else if (pad === 3) t += '=';
  else if (pad === 1) throw new Error('bad b64url length');
  return Buffer.from(t, 'base64');
}


export interface LicensePayload {
  v: 1;
  /** 可选。Phase 1 发行的 key 一律终身（无 expires）；此字段仅为兼容旧格式保留。 */
  expires?: string; // 'YYYY-MM-DD'
}


export function signKey(secret: string, payload: LicensePayload): string {
  const raw = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac('sha256', secret).update(raw).digest());
  return `PCF-${raw}.${sig}`;
}


/**
 * 校验 license key，返回三态：
 * - 'free'    : 空 key（未提供）
 * - 'pro'     : 签名合法且未过期
 * - 'invalid' : 签名错 / 过期 / 格式错（调用方按 FREE 降级 + 提示）
 */
export function licenseStatus(key: string, now: Date = new Date()): LicenseStatus {
  const k = (key ?? '').trim();
  if (k === '') return 'free';

  // 格式：PCF-<b64url payload>.<b64url signature>
  const m = k.match(/^PCF-([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/);
  if (!m) return 'invalid';
  const inner = m[1];
  const dot = inner.lastIndexOf('.');
  if (dot <= 0) return 'invalid';
  const rawPayload = inner.slice(0, dot);
  const sig = inner.slice(dot + 1);

  // 签名校验：base64url(HMAC-SHA256(secret, b64url payload 原文))
  const expected = b64url(crypto.createHmac('sha256', PCF_SECRET).update(rawPayload).digest());
  let sigBuf: Buffer;
  let expBuf: Buffer;
  try {
    sigBuf = fromB64url(sig);
    expBuf = fromB64url(expected);
  } catch {
    return 'invalid';
  }
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return 'invalid';
  }

  // payload 解析
  let payload: LicensePayload;
  try {
    payload = JSON.parse(fromB64url(rawPayload).toString('utf8')) as LicensePayload;
  } catch {
    return 'invalid';
  }
  if (payload.v !== 1) return 'invalid';

  // Phase 1 发行 key 一律终身：无 expires 字段 → pro（不做过期判断）。
  // 有 expires 字段的路径仅为兼容旧格式保留（已发出去带 expires 的 key 仍按原语义校验）。
  if (payload.expires !== undefined) {
    if (typeof payload.expires !== 'string') return 'invalid';
    const exp = Date.parse(payload.expires);
    if (Number.isNaN(exp)) return 'invalid';
    if (exp < startOfUtcDay(now)) return 'invalid';
  }

  return 'pro';
}


function startOfUtcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}


/** 读 license-key input（沿用 inputs.ts 的 INPUT_* > 裸 env 模式） */
export function getLicenseKey(): string {
  const key = input('license-key') ?? '';
  return key;
}


export type { InputKey };


/**
 * 按 license 状态降级配置：
 * - 'pro'  → 原样返回（monorepo + extends 全功能）
 * - 'free' / 'invalid' → 忽略 config.monorepo 与 config.extends（按根 config 处理）
 * 校验 / auto-fix / SARIF 不受影响。
 */
export function applyLicenseGate(config: Config, status: LicenseStatus): Config {
  if (status === 'pro') return config;
  const gated: Config = { ...config };
  delete gated.monorepo;
  delete gated.extends;
  return gated;
}
