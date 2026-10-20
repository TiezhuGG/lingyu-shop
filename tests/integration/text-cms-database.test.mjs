import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {Pool} from 'pg';
import foundation from '../../packages/server-modules/dist/index.js';
const {parseBackendConfig,BackendConfigService,DatabaseService,AuditService,AdminService,StorefrontService,TextCmsService,onlineSalesScopeId}=foundation;
const url=new URL(process.env.DATABASE_URL??'');assert.equal(url.pathname,'/lingyu_shop_test');assert(['127.0.0.1','localhost'].includes(url.hostname));
const env={...process.env,NODE_ENV:'test',PORT:'19376',ADMIN_ORIGIN:'http://127.0.0.1:5173',AUTH_ACCESS_SIGNING_KEY:'A'.repeat(43),AUTH_REFRESH_TOKEN_PEPPER:'B'.repeat(43)};
const config=new BackendConfigService(parseBackendConfig(env),'api'),prefix='cmstest-'+randomUUID().slice(0,12),trace='cms-test-'+randomUUID(),password='Disposable-CMS-test-2026!';
const original={version:0,title:'隔离故事甲',body:'<script>alert(1)</script>\n仅为隔离测试，不是真实条款。',reason:'content_change'};
test('text CMS real persistence, isolation, publication, immutable rollback and scoped audit transactions',{timeout:90000},async t=>{
  const pool=new Pool({connectionString:url.toString(),max:1}),database=new DatabaseService(config),audit=new AuditService();
  const admins=new AdminService(config,database,audit),storefront=new StorefrontService(database,admins,audit),cms=new TextCmsService(database,admins,audit,storefront);
  let child,output='',owned=false;
  async function call(path,{method='GET',cookie,csrf,body}={}){
    const headers={'content-type':'application/json',origin:env.ADMIN_ORIGIN,'x-request-id':trace};if(cookie)headers.cookie=cookie;if(csrf)headers['x-csrf-token']=csrf;
    const response=await fetch('http://127.0.0.1:19376/api/v1/'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,headers:response.headers,body:await response.json()};
  }
  async function issue(username){const result=await admins.login(username,password,trace);return {cookie:'lingyu_admin='+result.cookie,csrf:result.data.csrfToken,principal:await admins.authenticate(result.cookie)};}
  async function start(){child=spawn(process.execPath,['apps/api/dist/main.js'],{env,stdio:['ignore','pipe','pipe','ipc']});child.stdout.on('data',data=>{output+=data;});child.stderr.on('data',data=>{output+=data;});
    for(let i=0;i<100;i++){assert.equal(child.exitCode,null,output);try{if((await fetch('http://127.0.0.1:19376/health/ready')).ok)return;}catch{}await delay(100);}throw Error('CMS API unavailable');}
  async function stop(){if(child?.exitCode===null){const done=once(child,'exit');if(process.platform==='win32')child.send({type:'shutdown'});else child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),10000);try{await done;}finally{clearTimeout(timer);}}}
  try{
    for(const table of ['store','admin_account','cms_text_page','cms_text_revision'])assert.equal((await pool.query('SELECT count(*)::int n FROM '+table)).rows[0].n,0,'Refusing existing data: '+table);
    owned=true;await database.onModuleInit();await admins.bootstrap(prefix,password);const manager=await issue(prefix);
    const account=await admins.create(manager.principal,{username:prefix+'-ops',password,reason:'onboarding',grants:[{role:'STORE_OPERATOR',scopeKey:onlineSalesScopeId}]},trace);
    await admins.create(manager.principal,{username:prefix+'-read',password,reason:'onboarding',grants:[{role:'STORE_READER',scopeKey:onlineSalesScopeId}]},trace);
    await admins.create(manager.principal,{username:prefix+'-wrong',password,reason:'onboarding',grants:[{role:'STORE_OPERATOR',scopeKey:randomUUID()}]},trace);
    const operator=await issue(prefix+'-ops'),reader=await issue(prefix+'-read'),wrong=await issue(prefix+'-wrong');
    const write=(body,session=operator,code='STORY')=>call('admin/cms/'+code,{...session,method:'PUT',body});
    const change=(version,action='publish',targetVersion,session=operator,code='STORY')=>call('admin/cms/'+code+'/'+action,{...session,method:'POST',body:action==='rollback'?{version,targetVersion,reason:'content_rollback'}:{version,reason:'content_publication'}});
    const visible=async(code='STORY')=>{const result=await call('app/cms/'+code);assert.equal(result.status,200);return result.body.data.published;};
    await start();
    await t.test('fixed empty pages do not seed content or a store; save requires configured scope',async()=>{
      for(const code of ['STORY','TERMS','PRIVACY'])assert.equal(await visible(code),null);
      assert.equal((await pool.query('SELECT count(*)::int n FROM cms_text_page')).rows[0].n,0);
      assert.equal((await write(original)).status,409);assert.equal((await call('app/cms/MARKET')).status,400);assert.equal((await call('app/cms/STORY?draft=true')).status,400);
      await storefront.save(operator.principal,{version:0,displayName:'隔离CMS商城',reason:'configuration_change',fulfillmentRules:['EXPRESS','LOCAL_DELIVERY','PICKUP'].map(method=>({method,feeMinor:null,freeAboveMinor:null,serviceDescription:null,pickupAddress:null}))},trace);
    });
    await t.test('anonymous/GLOBAL/other scope/reader writes are denied; CSRF and unknown fields cannot bypass',async()=>{
      assert.equal((await call('admin/cms/STORY')).status,401);
      for(const session of [manager,wrong]){assert.equal((await call('admin/cms/STORY',session)).status,403);assert.equal((await write(original,session)).status,403);assert.equal((await change(0,'publish',undefined,session)).status,403);}
      assert.equal((await call('admin/cms/STORY',reader)).status,200);assert.equal((await write(original,reader)).status,403);assert.equal((await change(0,'rollback',1,reader)).status,403);
      assert.equal((await write(original,{...operator,csrf:undefined})).status,403);
      for(const patch of [{storeId:randomUUID()},{actorId:'forged'},{blocks:[]}])assert.equal((await write({...original,...patch})).status,400);
      assert.equal((await call('admin/cms/STORY?before=2147483648',operator)).status,400);
    });
    await t.test('empty drafts are allowed, empty publishing refused; first creation races yield one success',async()=>{
      const results=await Promise.all([write({...original,title:'',body:''}),write({...original,title:'',body:''})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
      assert.equal((await change(1)).status,409);assert.equal(await visible(),null);
      assert.equal((await write({...original,version:1})).status,200);assert.equal(await visible(),null);
    });
    await t.test('publication creates a consistent immutable text version; parallel/repeated actions conflict',async()=>{
      const results=await Promise.all([change(2),change(2)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
      assert.match(results.find(r=>r.status===200).body.data.auditId,/^[0-9a-f-]{36}$/);
      const published=await visible();assert.equal(published.version,3);assert.equal(published.body,original.body);assert.equal(published.sourceVersion,null);
      assert.equal((await call('app/cms/STORY')).headers.get('cache-control'),'no-store');assert.equal((await call('admin/cms/STORY',reader)).headers.get('cache-control'),'no-store');
    });
    await t.test('editing never leaks drafts, stale updates conflict and rollback cannot use other-page history',async()=>{
      const previous=await visible();assert.equal((await write({...original,version:3,title:'隔离故事乙',body:'后续草稿正文'})).status,200);assert.deepEqual(await visible(),previous);
      assert.equal((await write({...original,version:3})).status,409);assert.equal((await change(3)).status,409);assert.equal((await change(4,'rollback',999)).status,404);
      assert.equal((await write({...original,title:'隔离条款'},operator,'TERMS')).status,200);assert.equal((await change(1,'rollback',3,operator,'TERMS')).status,404);
      assert.equal(await visible('TERMS'),null);assert.equal(await visible('PRIVACY'),null);
    });
    await t.test('audit failure rolls back drafts, publication/rollback history and withdrawal pointers',async()=>{
      class FailingAudit extends AuditService{async append(context,input){await super.append(context,input);throw Error('fixture CMS audit rollback');}}
      const failing=new TextCmsService(database,admins,new FailingAudit(),storefront),before=await cms.read(operator.principal,'STORY'),published=await visible();
      const count=async()=>(await pool.query('SELECT count(*)::int n FROM audit_log WHERE "requestId"=$1',[trace])).rows[0].n,previous=await count();
      await assert.rejects(failing.save(operator.principal,'STORY',{...original,version:4},trace),/fixture CMS audit rollback/);
      for(const action of ['publish','rollback','withdraw'])await assert.rejects(failing.change(operator.principal,'STORY',action==='rollback'?{version:4,targetVersion:3,reason:'content_rollback'}:{version:4,reason:'content_publication'},action,trace),/fixture CMS audit rollback/);
      assert.deepEqual(await cms.read(operator.principal,'STORY'),before);assert.deepEqual(await visible(),published);assert.equal(await count(),previous);
    });
    await t.test('rollback copies history to a higher version, preserves draft and original snapshots, audit excludes text',async()=>{
      assert.equal((await change(4)).status,200);const result=await change(5,'rollback',3);assert.equal(result.status,200);
      const page=result.body.data.page;assert.equal(page.version,6);assert.equal(page.title,'隔离故事乙');assert.equal(page.published.title,original.title);assert.equal(page.published.version,6);assert.equal(page.published.sourceVersion,3);
      assert.equal(page.history.find(r=>r.version===5).title,'隔离故事乙');assert.equal(page.history.find(r=>r.version===3).body,original.body);
      const records=(await pool.query('SELECT changes FROM audit_log WHERE "requestId"=$1',[trace])).rows;
      for(const record of records)for(const [field,value]of Object.entries(record.changes??{})){
        assert(!['title','body','content'].includes(field));assert.notEqual(value,original.body);assert.notEqual(value,original.title);assert.notEqual(value,'后续草稿正文');
      }
      assert(records.some(r=>r.changes?.sourceVersion===3));
    });
    await t.test('history uses bounded descending keyset pages rather than silently truncating',async()=>{
      for(let version=6;version<16;version++)assert.equal((await change(version)).status,200);
      const first=(await call('admin/cms/STORY',reader)).body.data;assert.equal(first.history.length,10);assert.equal(first.hasMore,true);
      const second=(await call('admin/cms/STORY?before='+first.nextCursor,reader)).body.data;assert.equal(second.history.length,3);assert.equal(second.hasMore,false);
      const versions=[...first.history,...second.history].map(r=>r.version);assert.equal(new Set(versions).size,13);assert.deepEqual(versions,[...versions].sort((a,b)=>b-a));
    });
    await t.test('database constraints enforce page codes, text size and same-page publication pointer',async()=>{
      await assert.rejects(pool.query("UPDATE cms_text_page SET body=$1 WHERE page_code='STORY'",['x'.repeat(12001)]),e=>e.code==='23514');
      await assert.rejects(pool.query("UPDATE cms_text_page SET page_code='MARKET' WHERE page_code='TERMS'"),e=>e.code==='23514');
      await assert.rejects(pool.query("UPDATE cms_text_page SET published_version=1 WHERE page_code='STORY'"),e=>e.code==='23503');
    });
    await t.test('withdrawal removes public text, restart restores history and revocation rejects old sessions',async()=>{
      const results=await Promise.all([change(16,'withdraw'),change(16,'withdraw')]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(await visible(),null);
      await stop();await start();const page=(await call('admin/cms/STORY',reader)).body.data;assert.equal(page.version,17);assert.equal(page.history.length,10);assert.equal(page.published,null);
      await admins.update(manager.principal,account.id,{version:account.version,status:'ACTIVE',grants:[],reason:'access_change'},trace);assert.equal((await call('admin/cms/STORY',operator)).status,401);assert.equal((await change(17)).status,401);assert(!output.includes(password));
    });
  }finally{
    await stop();try{
      if(owned){await pool.query('UPDATE cms_text_page SET published_version=NULL WHERE store_id=$1',[onlineSalesScopeId]);
        const revisions=(await pool.query('SELECT page_code,version FROM cms_text_revision WHERE store_id=$1 ORDER BY version DESC',[onlineSalesScopeId])).rows;
        for(const row of revisions)await pool.query('DELETE FROM cms_text_revision WHERE store_id=$1 AND page_code=$2 AND version=$3',[onlineSalesScopeId,row.page_code,row.version]);
        await pool.query('DELETE FROM cms_text_page WHERE store_id=$1',[onlineSalesScopeId]);await pool.query('DELETE FROM store_fulfillment_draft WHERE store_id=$1',[onlineSalesScopeId]);await pool.query('DELETE FROM store WHERE id=$1',[onlineSalesScopeId]);}
      const ids=(await pool.query('SELECT id FROM admin_account WHERE username LIKE $1',[prefix+'%'])).rows.map(row=>row.id);
      await pool.query('DELETE FROM admin_session WHERE admin_id=ANY($1::uuid[])',[ids]);await pool.query('DELETE FROM admin_grant WHERE admin_id=ANY($1::uuid[])',[ids]);await pool.query('DELETE FROM admin_account WHERE id=ANY($1::uuid[])',[ids]);
      await pool.query('DELETE FROM audit_log WHERE "requestId"=$1 OR ("objectType"=$2 AND "objectId"=ANY($3::text[]))',[trace,'admin',ids]);
    }finally{await database.close();await pool.end();}
  }
});
