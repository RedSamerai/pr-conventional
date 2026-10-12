import { describe, it, expect } from 'vitest';
import * as crypto from 'crypto';
import {
  licenseStatus, signKey, PCF_SECRET,
  FREE_TIER_MSG, INVALID_KEY_MSG, applyLicenseGate,
} from '../src/license';
import type { Config } from '../src/types';


function futureDate(offsetDays = 30): string {
  const d = new Date(Date.now() + offsetDays * 86400_000);
  return d.toISOString().slice(0, 10);
}


function pastDate(offsetDays = -1): string {
  const d = new Date(Date.now() + offsetDays * 86400_000);
  return d.toISOString().slice(0, 10);
}


describe('licenseStatus', () => {
  it('1. empty key -> free', () => {
    expect(licenseStatus('')).toBe('free');
    expect(licenseStatus('   ')).toBe('free');
  });

  it('2. valid key (signed with same secret, future expiry) -> pro', () => {
    const key = signKey(PCF_SECRET, { v: 1, expires: futureDate(30) });
    expect(key.startsWith('PCF-')).toBe(true);
    expect(licenseStatus(key)).toBe('pro');
  });

  it('3. tampered signature -> invalid', () => {
    const goodKey = signKey(PCF_SECRET, { v: 1, expires: futureDate(30) });
    // 把签名末字符改一下
    const tail = goodKey.endsWith('A') ? 'B' : 'A';
    const tampered = goodKey.slice(0, -1) + tail;
    expect(licenseStatus(tampered)).toBe('invalid');
  });

  it('4. expired key -> invalid', () => {
    const key = signKey(PCF_SECRET, { v: 1, expires: pastDate(-1) });
    expect(licenseStatus(key)).toBe('invalid');
  });

  it('5. garbage string -> invalid', () => {
    expect(licenseStatus('not-a-key')).toBe('invalid');
    expect(licenseStatus('PCF-garbage')).toBe('invalid');
  });

  it('6. non-b64url chars in payload/signature -> invalid', () => {
    // 把合法的 payload 段里塞进 '+'（标准 base64，非 b64url）
    const payloadRaw = Buffer.from(JSON.stringify({ v: 1, expires: futureDate() })).toString('base64');
    const badPayload = payloadRaw.replace(/[A-Za-z0-9]+/, m => m + '+');
    const key = `PCF-${badPayload}.deadbeef`;
    expect(licenseStatus(key)).toBe('invalid');
  });

  it('7. key signed with WRONG secret -> invalid (signature mismatch)', () => {
    const otherSecret = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    const key = signKey(otherSecret, { v: 1, expires: futureDate(30) });
    expect(licenseStatus(key)).toBe('invalid');
  });

  it('lifetime. key WITHOUT expires (legacy not applicable, Phase 1 = lifetime) -> pro', () => {
    const key = signKey(PCF_SECRET, { v: 1 });
    expect(licenseStatus(key)).toBe('pro');
  });

  it('lifetime. key WITH future expires -> pro', () => {
    const key = signKey(PCF_SECRET, { v: 1, expires: futureDate(30) });
    expect(licenseStatus(key)).toBe('pro');
  });

  it('lifetime. key WITH past expires (legacy compat path) -> invalid', () => {
    const key = signKey(PCF_SECRET, { v: 1, expires: pastDate(-1) });
    expect(licenseStatus(key)).toBe('invalid');
  });
});


describe('applyLicenseGate (index-level integration)', () => {
  const fullConfig: Config = {
    rules: {
      'commit-message': { enabled: true, types: ['feat', 'fix'], subjectMaxLength: 72 },
      'pr-title': { enabled: true, maxLength: 100 },
    },
    monorepo: { enabled: true, packages: [{ path: 'packages/a', rules: { types: ['feat'] } }] },
    extends: 'https://example.test/pack.json',
    fixMode: true,
  };

  it('8a. FREE -> monorepo & extends stripped; rules & fixMode kept', () => {
    const gated = applyLicenseGate(fullConfig, 'free');
    expect(gated.monorepo).toBeUndefined();
    expect(gated.extends).toBeUndefined();
    expect(gated.rules?.['commit-message']?.types).toEqual(['feat', 'fix']);
    expect(gated.fixMode).toBe(true);
    // 原对象不被 mutate
    expect(fullConfig.monorepo?.enabled).toBe(true);
  });

  it('8b. INVALID -> same downgrade as free', () => {
    const gated = applyLicenseGate(fullConfig, 'invalid');
    expect(gated.monorepo).toBeUndefined();
    expect(gated.extends).toBeUndefined();
    expect(gated.rules?.['pr-title']?.maxLength).toBe(100);
  });

  it('8c. PRO -> config untouched (monorepo/extends preserved)', () => {
    const gated = applyLicenseGate(fullConfig, 'pro');
    expect(gated).toBe(fullConfig); // pro 直接返回原引用
    expect(gated.monorepo?.enabled).toBe(true);
    expect(gated.extends).toBe('https://example.test/pack.json');
  });

  it('FREE_TIER_MSG / INVALID_KEY_MSG strings are the documented ones', () => {
    expect(FREE_TIER_MSG).toContain('FREE tier');
    expect(FREE_TIER_MSG).toContain('monorepo routing and extends are disabled');
    expect(INVALID_KEY_MSG).toContain('invalid or expired');
  });
});
