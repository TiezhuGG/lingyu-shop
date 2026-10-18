import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const directory = mkdtempSync(join(tmpdir(), 'lingyu-contracts-'));
const output = join(directory, 'openapi.ts');
const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve('openapi-typescript/package.json')), 'bin', 'cli.js');
try {
  execFileSync(process.execPath, [cli, 'src/openapi.json', '-o', output], { stdio: 'inherit' });
  const committed = readFileSync('src/generated/openapi.ts', 'utf8').replace(/\r\n/g, '\n');
  const regenerated = readFileSync(output, 'utf8').replace(/\r\n/g, '\n');
  if (committed !== regenerated) throw new Error('Generated OpenAPI types are stale; run pnpm generate and commit the result.');
} finally {
  rmSync(directory, { recursive: true, force: true });
}
