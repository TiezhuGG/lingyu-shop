import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

// Fail before connecting or printing credentials. Only a dedicated loopback PoC DB.
const connectionString=process.env.POC_DATABASE_URL;
assert(connectionString,'Set POC_DATABASE_URL in local .env to a dedicated loopback database');
const url=new URL(connectionString);
assert(['localhost','127.0.0.1','[::1]'].includes(url.hostname),'PoC refuses non-loopback servers');
assert.equal(url.pathname,'/lingyu_shop_poc','PoC refuses any database except lingyu_shop_poc');
assert(!url.searchParams.has('schema'),'PoC uses the dedicated database public schema only');

const require=createRequire(import.meta.url);
const {PrismaClient}=require('../database/generated/index.js');
const pool=new pg.Pool({connectionString,max:2,connectionTimeoutMillis:5000});
const prisma=new PrismaClient({adapter:new PrismaPg(pool)});
const ids=[91001,91002];
try {
  const cli=require.resolve('prisma/build/index.js');
  const child=spawn(process.execPath,[cli,'migrate','deploy'],{env:{...process.env,POC_DATABASE_URL:connectionString},stdio:['ignore','pipe','pipe']});
  // Prisma CLI output may contain host information; deliberately keep it out of logs.
  child.stdout.resume();child.stderr.resume();
  const [code]=await once(child,'exit');assert.equal(code,0,'Prisma migrate deploy failed');
  console.log('PASS migration deploy');
  for(const id of ids) await prisma.engineeringProbe.upsert({where:{id},create:{id,available:1},update:{available:1}});

  const reserve=()=>prisma.$transaction(async tx=>{
    const [row]=await tx.$queryRaw`SELECT available FROM engineering_probe WHERE id=${ids[0]} FOR UPDATE`;
    if(row.available===0) return false;
    await tx.engineeringProbe.update({where:{id:ids[0]},data:{available:{decrement:1}}});
    return true;
  },{maxWait:10000,timeout:10000});
  const results=await Promise.all(Array.from({length:20},reserve));
  assert.equal(results.filter(Boolean).length,1);
  assert.equal((await prisma.engineeringProbe.findUniqueOrThrow({where:{id:ids[0]}})).available,0);
  console.log('PASS parameterized lock + concurrent reservation (20 requests / 1 available)');
  await assert.rejects(prisma.$transaction(async tx=>{
    await tx.engineeringProbe.update({where:{id:ids[1]},data:{available:0}});
    throw Error('forced rollback');
  }),/forced rollback/);
  assert.equal((await prisma.engineeringProbe.findUniqueOrThrow({where:{id:ids[1]}})).available,1);
  console.log('PASS transaction rollback');

  // Force a real deadlock on first attempts; retry the whole transaction with bounded backoff.
  let arrived=0;let releaseBarrier;
  const barrier=new Promise(resolve=>{releaseBarrier=resolve;});
  let deadlocks=0;
  async function lockPair(order) {
    for(let attempt=0;attempt<3;attempt++) {
      const client=await pool.connect();
      let retry=false;
      try {
        await client.query('BEGIN');
        await client.query("SET LOCAL statement_timeout = '15s'");
        await client.query('SELECT id FROM engineering_probe WHERE id=$1 FOR UPDATE',[order[0]]);
        if(attempt===0) {if(++arrived===2) releaseBarrier();await barrier;}
        await client.query('SELECT id FROM engineering_probe WHERE id=$1 FOR UPDATE',[order[1]]);
        await client.query('COMMIT');return;
      } catch(error) {
        await client.query('ROLLBACK');
        if(error.code!=='40P01' || attempt===2) throw error;
        deadlocks++;retry=true;
      } finally {client.release();}
      if(retry) await delay(25*(attempt+1));
    }
  }
  await Promise.all([lockPair(ids),lockPair([...ids].reverse())]);
  assert.equal(deadlocks,1);
  console.log('PASS real deadlock + full transaction retry');

  assert(pool.totalCount<=2,'connection pool exceeds budget');
  console.log('PASS connection pool maximum 2');
} finally {
  await prisma.engineeringProbe.deleteMany({where:{id:{in:ids}}}).catch(()=>{});
  await prisma.$disconnect();await pool.end();
}
