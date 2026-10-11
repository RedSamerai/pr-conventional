/**
 * 通用 deepMerge（纯函数，供 index.ts / rules/monorepo.ts 共用，避免循环依赖）。
 * 语义：普通对象递归合并；数组整体覆盖；null/undefined 不覆盖已有值。
 */
export function deepMerge<T>(target: T, source: Partial<T>): T {
  const out: Record<string, unknown> = { ...(target as unknown as Record<string, unknown>) };
  for (const [key, value] of Object.entries(source)) {
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      out[key] &&
      typeof out[key] === 'object' &&
      !Array.isArray(out[key])
    ) {
      out[key] = deepMerge(out[key] as object, value as object);
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out as T;
}
