export interface CliArgs {
  config?: string;
  dryRun?: boolean;
  help?: boolean;
}


export const CLI_HELP = `Usage: node dist/index.js [options]

Options:
  --config <path>   Path to config file (overrides INPUT_CONFIG_PATH / CONFIG_PATH / default)
  --dry-run         Report-only mode: never apply fixes, even if fixMode is enabled
  --help            Show this help

Precedence: CLI flags > GitHub INPUT_* > bare env > config file > defaults.
`;


/**
 * 极简 CLI 解析（无第三方依赖，可被 ncc 打包）。
 * 仅识别 --config <path> / --dry-run / --help / -h；未知参数忽略（保持向后兼容）。
 */
export function parseCliArgs(argv: string[]): CliArgs {
  // argv[0]=node, argv[1]=script；从 index 2 开始
  const args: CliArgs = {};
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--config') {
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        args.config = next;
        i++;
      } else {
        args.config = '';
      }
    } else if (a === '--dry-run') {
      args.dryRun = true;
    } else if (a === '--help' || a === '-h') {
      args.help = true;
    }
    // 其余（含 --fix-mode 等未来参数 / GITHUB_* 透传）忽略
  }
  return args;
}
