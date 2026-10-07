import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const readJson = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const pkg = readJson('package.json');
assert.equal(pkg.private, true);
assert.equal(pkg.packageManager, 'pnpm@12.9.1');
assert.equal(process.versions.node, pkg.engines.node, 'Node version differs from baseline');
assert.match(readFileSync(resolve(root, 'pnpm-workspace.yaml'), 'utf8'), /apps\/\*/);
assert.match(readFileSync(resolve(root, 'pnpm-workspace.yaml'), 'utf8'), /packages\/\*/);
const expected = ['admin','api','miniapp','worker','backend-shared','config','contracts','ui-tokens'];
const actual = [];
const names = new Set();
for (const area of ['apps','packages']) {
  for (const entry of readdirSync(resolve(root, area), {withFileTypes:true})) {
    if (!entry.isDirectory()) continue;
    const manifest = readJson(`${area}/${entry.name}/package.json`);
    assert.equal(manifest.private, true);
    assert.equal(manifest.name, `@lingyu/${entry.name}`);
    assert(!names.has(manifest.name), 'Duplicate workspace name');
    names.add(manifest.name);
    actual.push(entry.name);
  }
}
assert.deepEqual(actual.sort(), expected.sort());
for (const path of ['AGENTS.md','docs/tasks.md','docs/progress.md','docs/development.md','database/schema','database/migrations','database/seeds','openspec/specs','openspec/changes','tests/integration','tests/contract','tests/e2e','tests/load','infra/containers','infra/deploy','infra/monitoring']) {
  assert(existsSync(resolve(root, path)), `Missing ${path}`);
}
console.log('PASS: runtime, private manifests, 8 workspace packages and required directories.');
