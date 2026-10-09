import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

for (const service of ['api', 'worker']) {
  test('compiled ' + service + ' fails fast without business configuration', async () => {
    const env = { ...process.env, NODE_ENV: 'test' };
    delete env.DATABASE_URL;
    const child = spawn(process.execPath, ['apps/' + service + '/dist/main.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    const timeout = setTimeout(() => child.kill(), 10000);
    try {
      const [code] = await once(child, 'exit');
      assert.equal(code, 1, output);
      assert.match(output, /Invalid configuration: DATABASE_URL/);
      assert(!output.includes('password'));
    } finally { clearTimeout(timeout); }
  });
}
