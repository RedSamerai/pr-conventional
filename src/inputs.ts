/**
 * 读取 action inputs。
 *
 * GitHub 运行时把 `with:` 的值注入为 `INPUT_<KEY大写，且连字符变下划线>`，
 * 例如 config-path → INPUT_CONFIG_PATH、fix-mode → INPUT_FIX_MODE。
 * 本地/e2e/直接跑 dist 没有 INPUT_ 前缀，用显式映射表的裸 env 兜底。
 *
 * 优先级：INPUT_*（GitHub 生产） > 裸 env（本地/测试）。
 * token 特殊：裸 env 名用 GITHUB_TOKEN_OVERRIDE，避免与平台注入的
 * GITHUB_TOKEN 冲突；buildPRContext 回退到 GITHUB_TOKEN。
 */

export const INPUT_MAP = {
  'config-path': 'CONFIG_PATH',
  'fix-mode': 'FIX_MODE',
  token: 'GITHUB_TOKEN_OVERRIDE',
  'license-key': 'LICENSE_KEY',
} as const;


export type InputKey = keyof typeof INPUT_MAP;


export function input(key: InputKey): string | undefined {
  // GitHub 的 env 名：INPUT_ + 裸 env 名（裸 env 名本身即大写、无连字符）
  const bare = INPUT_MAP[key];
  const gh = process.env[`INPUT_${bare}`];
  if (gh !== undefined && gh !== '') return gh;
  return process.env[bare];
}
