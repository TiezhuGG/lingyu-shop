import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import { promisify } from 'node:util';

// Only this repository's loopback Compose Redis. Never FLUSHDB or touch other keys.
const exec = promisify(execFile);
const compose = ['compose', '--env-file', '.env', '-f', 'infra/containers/compose.yaml'];
const key = `lingyu:engineering:poc:${randomUUID()}`;
const value = randomUUID();
let ownsKey = false;
let stopped = false;
async function docker(args) {
  const { stdout } = await exec('docker', [...compose, ...args], { timeout: 45000, windowsHide: true });
  return stdout.trim();
}
const redis = (...args) => docker(['exec', '-T', 'redis', 'redis-cli', '--raw', ...args]);

function connectLoopback() {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: 16379 });
    socket.setTimeout(1500);
    socket.once('connect', () => { socket.destroy(); resolve(); });
    socket.once('error', reject);
    socket.once('timeout', () => { socket.destroy(); reject(Error('Redis connection timeout')); });
  });
}

try {
  await connectLoopback();
  assert.equal(await redis('PING'), 'PONG');
  const config = (await redis('CONFIG', 'GET', 'appendonly', 'maxmemory-policy')).split(/\r?\n/);
  const settings = Object.fromEntries(Array.from({ length: config.length / 2 }, (_, i) => [config[i * 2], config[i * 2 + 1]]));
  assert.equal(settings.appendonly, 'yes');
  assert.equal(settings['maxmemory-policy'], 'noeviction');
  console.log('PASS Redis loopback connection, PING, AOF and noeviction configuration');
  assert.equal(await redis('SET', key, value, 'NX'), 'OK');
  ownsKey = true;
  assert.deepEqual((await redis('WAITAOF', '1', '0', '5000')).split(/\r?\n/), ['1', '0']);
  console.log('PASS own probe key fsynced to local AOF');

  // Set the flag before stopping, so a failed stop also triggers recovery.
  stopped = true;
  await docker(['stop', 'redis']);
  await assert.rejects(connectLoopback(), 'Redis port must reject a connection while stopped');
  console.log('PASS Redis unavailable while stopped');
  await docker(['start', '--wait', '--wait-timeout', '30', 'redis']);
  stopped = false;
  await connectLoopback();
  assert.equal(await redis('PING'), 'PONG');
  assert.equal(await redis('GET', key), value);
  console.log('PASS Redis restart, AOF persistence and connection recovery');
} finally {
  if (stopped) await docker(['start', '--wait', '--wait-timeout', '30', 'redis']);
  if (ownsKey) {
    assert.equal(await redis('DEL', key), '1');
    console.log('PASS own Redis probe key cleaned up');
  }
}
