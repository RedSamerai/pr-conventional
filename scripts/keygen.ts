#!/usr/bin/env node
import * as crypto from 'crypto';
import { PCF_SECRET, signKey, type LicensePayload } from '../src/license.js';

// 本地发 key 工具（只发，不验）。复用 src/license.ts 的 PCF_SECRET + signKey，
// 不复制常量。买家端校验仍走 action 内的 licenseStatus()。
// Phase 1 荣誉制边界：本地 keygen 与买家自签在密码学上等价（secret 公开）。

interface Args {
  expires: string; // 空串 = 不传 --expires（默认，终身）
  note: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { expires: '', note: '' };
  for (const raw of argv) {
    if (raw.startsWith('--expires=')) args.expires = raw.slice('--expires='.length);
    else if (raw.startsWith('--note=')) args.note = raw.slice('--note='.length);
    else if (raw === '--help' || raw === '-h') {
      printHelp();
      process.exit(0);
    } else {
      console.error(`unknown argument: ${raw}`);
      printHelp();
      process.exit(1);
    }
  }
  return args;
}

function printHelp(): void {
  console.log(
    [
      'Usage: keygen [--expires=Nd|Nm|Ny|YYYY-MM-DD] [--note="..."]',
      '',
      '  (no --expires)  lifetime key (default; one-time purchase, no expiry)',
      '  --expires        optional; supports Nd / Nm / Ny or an ISO date (YYYY-MM-DD)',
      '                   only for trial / back-compat; not the default',
      '  --note           optional free-text, printed only (not written into the key)',
    ].join('\n'),
  );
}

// 解析 Nd / Nm / Ny 或 ISO 日期，返回 ISO 日期串（YYYY-MM-DD，UTC）
function resolveExpiry(spec: string, now: Date = new Date()): string {
  const s = spec.trim();
  const m = s.match(/^(\d+)([dmyn])$/);
  if (m) {
    const n = Number(m[1]);
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    switch (m[2]) {
      case 'd':
        d.setUTCDate(d.getUTCDate() + n);
        break;
      case 'm':
        d.setUTCMonth(d.getUTCMonth() + n);
        break;
      case 'y':
        d.setUTCFullYear(d.getUTCFullYear() + n);
        break;
      case 'n':
        // 'n' 未定义，明确报错（避免静默当成某单位）
        console.error(`unsupported period unit '${m[2]}' (use d/m/y or an ISO date)`);
        process.exit(1);
    }
    return toIsoDate(d);
  }
  // 当作 ISO 日期
  const iso = s.match(/^\d{4}-\d{2}-\d{2}$/);
  if (!iso) {
    console.error(`invalid --expires '${s}' (use Nd/Nm/Ny or YYYY-MM-DD)`);
    process.exit(1);
  }
  return s;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const lifetime = args.expires === '';
  const expires = lifetime ? undefined : resolveExpiry(args.expires);
  const payload: LicensePayload = lifetime ? { v: 1 } : { v: 1, expires };
  const key = signKey(PCF_SECRET, payload);
  const generated = toIsoDate(new Date());

  console.log(`KEY: ${key}`);
  const parts: string[] = [];
  parts.push(lifetime ? 'lifetime' : `expires: ${expires}`);
  if (args.note) parts.push(`note: ${args.note}`);
  parts.push(`generated: ${generated}`);
  console.log(parts.join(' | '));
  process.exit(0);
}

void main();
