import { describe, it, expect } from 'vitest';
import { parseCliArgs } from './cli';


describe('parseCliArgs', () => {
  it('parses --config <path>', () => {
    // argv = [node, script, --config, x.yml]
    expect(parseCliArgs(['node', 'index.js', '--config', 'examples/strict.yml']).config).toBe('examples/strict.yml');
  });

  it('parses --dry-run', () => {
    expect(parseCliArgs(['node', 'index.js', '--dry-run']).dryRun).toBe(true);
  });

  it('parses combined flags', () => {
    const r = parseCliArgs(['node', 'index.js', '--config', 'a.yml', '--dry-run']);
    expect(r.config).toBe('a.yml');
    expect(r.dryRun).toBe(true);
  });

  it('treats --config with missing value as empty', () => {
    const r = parseCliArgs(['node', 'index.js', '--config']);
    expect(r.config).toBe('');
  });

  it('ignores unknown flags (backward compatible)', () => {
    const r = parseCliArgs(['node', 'index.js', '--unknown', '--fix-mode', 'true']);
    expect(r.config).toBeUndefined();
    expect(r.dryRun).toBeUndefined();
    expect(r.help).toBeUndefined();
  });

  it('parses --help and -h', () => {
    expect(parseCliArgs(['node', 'index.js', '--help']).help).toBe(true);
    expect(parseCliArgs(['node', 'index.js', '-h']).help).toBe(true);
  });

  it('empty argv -> all undefined', () => {
    const r = parseCliArgs(['node', 'index.js']);
    expect(r).toEqual({});
  });

  it('does not swallow a -- flag as a --config value; the flag is parsed on its own', () => {
    const r = parseCliArgs(['node', 'index.js', '--config', '--dry-run']);
    // --config 没拿到非 -- 开头的值 → 空串；--dry-run 仍被识别为 flag
    expect(r.config).toBe('');
    expect(r.dryRun).toBe(true);
  });
});
