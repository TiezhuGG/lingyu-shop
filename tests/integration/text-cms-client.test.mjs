import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const original=readFileSync('apps/miniapp/src/services/text-cms.ts','utf8');
const data=()=>({pageCode:'STORY',published:{version:2,title:'隔离测试',body:'<script>plain text</script>',sourceVersion:null,publishedAt:'2026-10-20T00:00:00.000Z'}});
function client({h5=true,base='',production=false,result=data(),status=200,fail=false}={}){
  const source=(h5?original.replace(/\/\/ #ifndef H5[\s\S]*?\/\/ #endif/,''):original).replaceAll('import.meta.env','environment');
  const exports={},calls=[];
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,environment:{VITE_API_BASE_URL:base,PROD:production},uni:{request(options){calls.push(options.url); if(fail) options.fail(); else options.success({statusCode:status,data:{code:'OK',data:result}});}}});
  return {api:exports,calls};
}
test('text adapter preserves literal content and null, refuses malformed revisions without fixtures',async()=>{
  const normal=client(); assert.equal((await normal.api.getPublishedText('STORY')).published.body,'<script>plain text</script>');
  assert.equal((await client({result:{pageCode:'STORY',published:null}}).api.getPublishedText('STORY')).published,null);
  const invalid=[{},null,{...data(),pageCode:'TERMS'}];
  for(const patch of [{version:0},{publishedAt:'invalid'},{sourceVersion:2},{body:null},{title:'a'.repeat(81)}]) invalid.push({...data(),published:{...data().published,...patch}});
  for(const result of invalid) await assert.rejects(client({result}).api.getPublishedText('STORY'));
  await assert.rejects(client({fail:true}).api.getPublishedText('STORY')); await assert.rejects(client({status:503}).api.getPublishedText('STORY'));
});
test('text adapter rejects unknown routes, unconfigured native origin and unsafe API bases before requests',async()=>{
  const invalid=client(); await assert.rejects(invalid.api.getPublishedText('../TERMS')); assert.equal(invalid.calls.length,0);
  for(const options of [{h5:false},{base:'https://user:secret@invalid'},{base:'http://api.invalid',production:true}]){const fixture=client(options);await assert.rejects(fixture.api.getPublishedText('STORY'));assert.equal(fixture.calls.length,0);}
  const fixture=client({h5:false,base:'https://api.invalid',production:true});await fixture.api.getPublishedText('STORY');assert.deepEqual(fixture.calls,['https://api.invalid/api/v1/app/cms/STORY']);
});
