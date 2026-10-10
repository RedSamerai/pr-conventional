import { readFileSync, existsSync } from "fs";
import { join } from "path";

interface EnvConfig {
  CONFIG_PATH?: string;
  FIX_MODE?: string;
  GITHUB_TOKEN?: string;
  GITHUB_REPOSITORY?: string;
  GITHUB_EVENT_PATH?: string;
  GITHUB_SHA?: string;
  GITHUB_REF?: string;
}

function getEnv(): EnvConfig {
  return {
    CONFIG_PATH: process.env.CONFIG_PATH,
    FIX_MODE: process.env.FIX_MODE,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY,
    GITHUB_EVENT_PATH: process.env.GITHUB_EVENT_PATH,
    GITHUB_SHA: process.env.GITHUB_SHA,
    GITHUB_REF: process.env.GITHUB_REF,
  };
}

function loadConfig(path: string): Record<string, unknown> {
  const file = path.endsWith(".json") ? undefined : path;
  if (file && existsSync(file)) {
    const raw = readFileSync(file, "utf8");
    if (raw.trim().startsWith("{")) {
      return JSON.parse(raw);
    }
  }
  return {};
}

async function main(): Promise<void> {
  const env = getEnv();
  const repo = env.GITHUB_REPOSITORY ?? "unknown-repo";
  const fixMode = env.FIX_MODE === "true";

  console.log(`[pr-conventional] running against ${repo} (sha=${env.GITHUB_SHA ?? "?"})`);
  console.log(`[pr-conventional] fix-mode=${fixMode}`);

  const configPath = env.CONFIG_PATH ?? ".github/pr-conventional.yml";
  const config = loadConfig(configPath);
  console.log(
    `[pr-conventional] loaded config from ${configPath}: ${
      Object.keys(config).length ? "ok" : "empty"
    }`
  );

  // TODO: 实现 Conventional Commits 校验 / PR 标题与描述校验 / 自动修复逻辑
  console.log("[pr-conventional] validation not yet implemented (scaffold)");
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("[pr-conventional] failed:", err);
    process.exit(1);
  });
