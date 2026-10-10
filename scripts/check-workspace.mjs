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
const expected = ['admin','api','miniapp','worker','backend-shared','config','contracts','ui-tokens','server-modules'];
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
for (const path of ['AGENTS.md','docs/tasks.md','docs/progress.md','docs/development.md','database/schema','database/migrations','database/seeds','openspec/specs','openspec/changes','tests/integration','tests/contract','tests/e2e','tests/load','infra/containers','infra/deploy','infra/monitoring','packages/contracts/src/openapi.json','packages/contracts/src/generated/openapi.ts']) {
  assert(existsSync(resolve(root, path)), `Missing ${path}`);
}

// Clients and client-facing contracts cannot reach backend implementation transitively.
for (const entry of ['admin', 'miniapp', 'contracts', 'ui-tokens']) {
 const queue = ['@lingyu/' + entry], visited = new Set();
 while (queue.length) {
  const name = queue.pop();
  if (visited.has(name)) continue;
  visited.add(name);
  assert(!['@lingyu/server-modules','@lingyu/backend-shared'].includes(name), 'Client dependency crosses backend boundary');
  const area = ['admin','api','miniapp','worker'].includes(name.slice(8)) ? 'apps' : 'packages';
  const manifest = readJson(area + '/' + name.slice(8) + '/package.json');
  queue.push(...Object.keys({...manifest.dependencies,...manifest.devDependencies}).filter(dep => dep.startsWith('@lingyu/')));
 }
}
const server = readJson('packages/server-modules/package.json');
assert.equal(server.exports['.'].require, './dist/index.js');
for (const app of ['api','worker']) assert.equal(readJson('apps/' + app + '/package.json').dependencies[server.name], 'workspace:*');
const contracts = readJson('packages/contracts/package.json');
assert.equal(contracts.devDependencies['openapi-typescript'], '7.13.0');
assert.equal(contracts.scripts.generate, 'openapi-typescript src/openapi.json -o src/generated/openapi.ts');
assert.equal(contracts.exports['.'].require, './dist/index.js');

console.log('PASS: runtime, 9 workspace manifests, required directories and backend dependency boundaries.');
