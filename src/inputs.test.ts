import { describe, it, expect, afterEach } from 'vitest';
import { input, INPUT_MAP } from './inputs';


const KEYS = ['INPUT_CONFIG_PATH', 'INPUT_FIX_MODE', 'INPUT_GITHUB_TOKEN_OVERRIDE', 'CONFIG_PATH', 'FIX_MODE', 'GITHUB_TOKEN_OVERRIDE'] as const;


function clearInputs() {
  for (const k of KEYS) delete process.env[k];
}


afterEach(clearInputs);


describe('input() priority (INPUT_* > bare env)', () => {
  it('reads INPUT_CONFIG_PATH when set', () => {
    process.env['INPUT_CONFIG_PATH'] = '.github/from-gh.yml';
    process.env.CONFIG_PATH = './local.yml';
    expect(input('config-path')).toBe('.github/from-gh.yml');
  });

  it('falls back to bare env when INPUT_ missing', () => {
    clearInputs();
    process.env.CONFIG_PATH = './local.yml';
    expect(input('config-path')).toBe('./local.yml');
  });

  it('returns undefined when neither set', () => {
    clearInputs();
    expect(input('config-path')).toBeUndefined();
  });

  it('INPUT_FIX_MODE preferred over FIX_MODE', () => {
    process.env['INPUT_FIX_MODE'] = 'true';
    process.env.FIX_MODE = 'false';
    expect(input('fix-mode')).toBe('true');
  });

  it('token bare env name is GITHUB_TOKEN_OVERRIDE (not GITHUB_TOKEN)', () => {
    clearInputs();
    process.env.GITHUB_TOKEN_OVERRIDE = 'pat_from_local';
    expect(input('token')).toBe('pat_from_local');
    // token 的 INPUT_ 名是 INPUT_GITHUB_TOKEN_OVERRIDE（= 'INPUT_' + 裸 env 名），不是 INPUT_TOKEN
    delete process.env.GITHUB_TOKEN_OVERRIDE;
    process.env['INPUT_GITHUB_TOKEN_OVERRIDE'] = 'pat_from_gh';
    expect(input('token')).toBe('pat_from_gh');
  });

  it('empty string INPUT_ value falls through to bare env', () => {
    process.env['INPUT_CONFIG_PATH'] = '';
    process.env.CONFIG_PATH = './local.yml';
    expect(input('config-path')).toBe('./local.yml');
  });
});


describe('INPUT_MAP is explicit (no dynamic key mangling)', () => {
  it('maps all three declared inputs to bare env names', () => {
    expect(INPUT_MAP['config-path']).toBe('CONFIG_PATH');
    expect(INPUT_MAP['fix-mode']).toBe('FIX_MODE');
    expect(INPUT_MAP['token']).toBe('GITHUB_TOKEN_OVERRIDE');
  });
});

