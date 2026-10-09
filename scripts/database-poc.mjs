import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { retryTransaction } from './lib/prisma-transaction-retry.mjs';
import { assertPocDatabaseUrl } from './lib/poc-database-url.mjs';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

// Fail before connecting or printing credentials. Only a dedicated loopback PoC DB.
const connectionString=assertPocDatabaseUrl(process.env.POC_DATABASE_URL);

const require=createRequire(import.meta.url);
const {PrismaClient}=require('../database/generated/index.js');
const pool=new pg.Pool({connectionString,max:2,connectionTimeoutMillis:5000});
const prisma=new PrismaClient({adapter:new PrismaPg(pool)});
const ids=[91001,91002];
let ownsRows=false;

function twoPartyBarrier() {
  const {promise,resolve,reject}=Promise.withResolvers();
  let arrived=0;let timer;
  return async()=>{
    if(++arrived===1) timer=setTimeout(()=>reject(Error('PoC concurrency barrier timed out')),5000);
    if(arrived===2) {clearTimeout(timer);resolve();}
    await promise;
  };
}

async function concurrent(operations) {
  // Wait for both success and failure before cleanup can delete the probe rows.
  const outcomes=await Promise.allSettled(operations);
  const failed=outcomes.find(result=>result.status==='rejected');
  if(failed) throw failed.reason;
  return outcomes.map(result=>result.value);
}

try {
  const cli=require.resolve('prisma/build/index.js');
  const child=spawn(process.execPath,[cli,'migrate','deploy'],{env:{...process.env,POC_DATABASE_URL:connectionString},stdio:['ignore','pipe','pipe'],timeout:60000});
  // Prisma CLI output may contain host information; deliberately keep it out of logs.
  child.stdout.resume();child.stderr.resume();
  const [code]=await once(child,'exit');assert.equal(code,0,'Prisma migrate deploy failed');
  console.log('PASS migration deploy');
  // Atomic insert refuses a concurrent run or leftovers instead of overwriting them.
  await prisma.engineeringProbe.createMany({data:ids.map(id=>({id,available:1}))});
  ownsRows=true;

  const reserve=()=>prisma.$transaction(async tx=>{
    const [row]=await tx.$queryRaw`SELECT available FROM engineering_probe WHERE id=${ids[0]} FOR UPDATE`;
    if(row.available===0) return false;
    await tx.engineeringProbe.update({where:{id:ids[0]},data:{available:{decrement:1}}});
    return true;
  },{maxWait:10000,timeout:10000});
  const results=await concurrent(Array.from({length:20},reserve));
  assert.equal(results.filter(Boolean).length,1);
  assert.equal((await prisma.engineeringProbe.findUniqueOrThrow({where:{id:ids[0]}})).available,0);
  console.log('PASS parameterized lock + concurrent reservation (20 requests / 1 available)');
  await assert.rejects(prisma.$transaction(async tx=>{
    await tx.engineeringProbe.update({where:{id:ids[1]},data:{available:0}});
    throw Error('forced rollback');
  }),/forced rollback/);
  assert.equal((await prisma.engineeringProbe.findUniqueOrThrow({where:{id:ids[1]}})).available,1);
  console.log('PASS transaction rollback');

  await assert.rejects(pool.query('UPDATE engineering_probe SET available=-1 WHERE id=$1',[ids[1]]),{code:'23514'});
  assert.equal((await prisma.engineeringProbe.findUniqueOrThrow({where:{id:ids[1]}})).available,1);
  console.log('PASS real nonnegative database constraint');

  // Force the deadlock through Prisma itself, after a write that must roll back.
  await prisma.engineeringProbe.updateMany({where:{id:{in:ids}},data:{available:0}});
  const deadlockBarrier=twoPartyBarrier();
  let deadlocks=0;
  const lockPair=order=>retryTransaction(attempt=>prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM engineering_probe WHERE id=${order[0]} FOR UPDATE`;
    await tx.engineeringProbe.update({where:{id:order[0]},data:{available:{increment:1}}});
    if(attempt===1) await deadlockBarrier();
    await tx.$queryRaw`SELECT id FROM engineering_probe WHERE id=${order[1]} FOR UPDATE`;
    await tx.engineeringProbe.update({where:{id:order[1]},data:{available:{increment:1}}});
  },{maxWait:10000,timeout:15000}),{onRetry:({code})=>{
    deadlocks++;
    console.log(`INFO Prisma deadlock mapped to ${code}; retrying entire transaction`);
  }});
  await concurrent([lockPair(ids),lockPair([...ids].reverse())]);
  assert.equal(deadlocks,1);
  for(const id of ids) assert.equal((await prisma.engineeringProbe.findUniqueOrThrow({where:{id}})).available,2);
  console.log('PASS Prisma real deadlock + full transaction retry + failed write rollback');

  await prisma.engineeringProbe.update({where:{id:ids[0]},data:{available:0}});
  const serialBarrier=twoPartyBarrier();
  let conflicts=0;
  const increment=()=>retryTransaction(attempt=>prisma.$transaction(async tx=>{
    const row=await tx.engineeringProbe.findUniqueOrThrow({where:{id:ids[0]}});
    if(attempt===1) await serialBarrier();
    await tx.engineeringProbe.update({where:{id:ids[0]},data:{available:row.available+1}});
  },{isolationLevel:'Serializable',maxWait:10000,timeout:15000}),{onRetry:({code})=>{
    conflicts++;
    console.log(`INFO Prisma serialization conflict mapped to ${code}; retrying entire transaction`);
  }});
  await concurrent([increment(),increment()]);
  assert.equal(conflicts,1);
  assert.equal((await prisma.engineeringProbe.findUniqueOrThrow({where:{id:ids[0]}})).available,2);
  console.log('PASS Prisma Serializable conflict + reread on full transaction retry');

  assert.equal(pool.totalCount,2,'probe must exercise the configured two-connection pool');
  assert.equal(pool.waitingCount,0,'connection pool has pending requests after transactions');
  console.log('PASS connection pool maximum 2');
} finally {
  try {
    if(ownsRows) {
      await prisma.engineeringProbe.deleteMany({where:{id:{in:ids}}});
      console.log('PASS own probe rows cleaned up');
    }
  } finally {
    await prisma.$disconnect();await pool.end();
  }
}
