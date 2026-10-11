import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const out = execSync(
  'npx ts-json-schema-generator -p src/types.ts -t Config -i pr-conventional.config.schema.json -f tsconfig.json',
  { encoding: 'utf8', cwd: process.cwd() }
);
writeFileSync('config.schema.json', out, 'utf8');
console.log('wrote config.schema.json (' + out.length + ' bytes)');
