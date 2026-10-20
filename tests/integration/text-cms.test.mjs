import test from 'node:test';
import assert from 'node:assert/strict';
import foundation from '../../packages/server-modules/dist/index.js';
const {parseCmsPageCode,parseCmsSave,parseCmsHistory,parseCmsRollback,hasAdminPermission,onlineSalesScopeId} = foundation;
test('text CMS uses fixed page codes, plain text and bounded Unicode fields without arbitrary ownership',()=>{
  for(const code of ['STORY','TERMS','PRIVACY']) assert.equal(parseCmsPageCode(code),code);
  for(const code of ['MARKET','story','../STORY','https://invalid']) assert.throws(()=>parseCmsPageCode(code));
  const input={version:0,title:' 测试标题 ',body:' <script>not executed</script>\n\t文本 ',reason:'content_change'};
  assert.equal(parseCmsSave(input).body,'<script>not executed</script>\n\t文本'); assert.equal(parseCmsSave(input).title,'测试标题');
  assert.equal(parseCmsSave({...input,title:'',body:''}).body,'');
  assert.equal([...parseCmsSave({...input,body:'😀'.repeat(12000)}).body].length,12000);
  for(const patch of [{storeId:onlineSalesScopeId},{actorId:'forged'},{blocks:[]},{title:'a\nb'},{body:'x\u0000y'},{body:'x\u000by'},{body:'a'.repeat(12001)},{title:'a'.repeat(81)}]) assert.throws(()=>parseCmsSave({...input,...patch}));
});
test('CMS version/history and independent publication permissions remain scoped',()=>{
  assert.equal(parseCmsHistory({}),undefined); assert.equal(parseCmsHistory({before:'20'}),20);
  for(const input of [{before:'0'},{before:'2147483648'},{before:['1','2']},{draft:true}]) assert.throws(()=>parseCmsHistory(input));
  assert.throws(()=>parseCmsRollback({version:3,targetVersion:0,reason:'content_rollback'}));
  const reader=[{role:'STORE_READER',scopeKey:onlineSalesScopeId}], op=[{role:'STORE_OPERATOR',scopeKey:onlineSalesScopeId}];
  assert(hasAdminPermission(reader,'cms.read',onlineSalesScopeId)); assert(!hasAdminPermission(reader,'cms.publish',onlineSalesScopeId));
  assert(hasAdminPermission(op,'cms.publish',onlineSalesScopeId)); assert(!hasAdminPermission(op,'cms.write','00000000-0000-4000-8000-000000000002'));
  assert(!hasAdminPermission([{role:'IAM_MANAGER',scopeKey:'GLOBAL'}],'cms.publish',onlineSalesScopeId));
});
