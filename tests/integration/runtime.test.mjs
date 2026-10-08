import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

test('compiled API serves engineering health and rejects missing routes', async () => {
  const port = 19371;
  const child = spawn(process.execPath, ['apps/api/dist/main.js'], { env: {...process.env, PORT:String(port)}, stdio:['ignore','pipe','pipe'] });
  let output='';
  child.stdout.on('data', data => {output+=data;});
  child.stderr.on('data', data => {output+=data;});
  try {
    let response;
    for(let attempt=0;attempt<60;attempt++) {
      assert.equal(child.exitCode,null,output);
      try {response=await fetch(`http://127.0.0.1:${port}/health`);break;} catch {await delay(100);}
    }
    assert(response,`API did not become ready: ${output}`);
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{status:'ok',service:'api',scope:'engineering'});
    assert.equal((await fetch(`http://127.0.0.1:${port}/missing`)).status,404);
  } finally {const exit=once(child,'exit');child.kill();if(child.exitCode===null) await exit;}
});

test('compiled worker initializes and closes its Nest context',async()=>{
  const child=spawn(process.execPath,['apps/worker/dist/main.js'],{env:{...process.env,WORKER_SMOKE:'1'},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',data=>{output+=data;});child.stderr.on('data',data=>{output+=data;});
  const timeout=setTimeout(()=>child.kill(),15000);
  try {const [code]=await once(child,'exit');assert.equal(code,0,output);assert.match(output,/no jobs registered/);} finally {clearTimeout(timeout);}
});
