<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { components } from '@lingyu/contracts';
import { adminApi, AdminRequestError } from '../services/admin';
import StorefrontSettings from '../components/StorefrontSettings.vue';
type Schema = components['schemas'];
const session = ref<Schema['AdminSessionData'] | null>(null);
const accounts = ref<Schema['AdminAccountData'][]>([]);
const audits = ref<Schema['AdminAuditItem'][]>([]);
const username = ref(''), password = ref(''), message = ref('');
const busy = ref(false), loading = ref(true);
const editing = ref<Schema['AdminAccountData'] | null>(null);
const form = ref({ username: '', password: '', status: 'ACTIVE' as Schema['AdminStatus'], reason: 'onboarding' as Schema['AdminReason'] });
const grants = ref<Schema['AdminGrantInput'][]>([{ role: 'STORE_READER', scopeKey: '' }]);
const manager = computed(() => session.value?.admin.grants.some(grant => grant.role === 'IAM_MANAGER' && grant.scopeKey === 'GLOBAL'));
const roles: Record<Schema['AdminRoleName'], string> = { IAM_MANAGER: '账号与权限管理', STORE_OPERATOR: '商城/仓店运营', STORE_READER: '商城/仓店只读' };
function report(error: unknown) {
  const status = error instanceof AdminRequestError ? error.status : 0;
  message.value = ({ 401: '登录未成功或会话已失效，请重新登录。', 403: '当前操作未获授权，请核对账号、范围或重新登录。', 409: '信息已更新或操作受保护，请刷新后重试。', 400: '请检查输入和授权范围编号。', 429: '请求较多，请稍后再试。' } as Record<number, string>)[status] ?? '暂时无法连接服务，请稍后重试。';
  if (status === 401) { session.value = null; accounts.value = []; audits.value = []; password.value = ''; edit(); }
}
async function perform(action: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true; message.value = '';
  try { await action(); } catch (error) { report(error); } finally { busy.value = false; }
}
async function refreshAccounts() { if (manager.value) accounts.value = await adminApi.list(); }
async function login() {
  const supplied = password.value; password.value = '';
  await perform(async () => { session.value = await adminApi.login({ username: username.value, password: supplied }); await refreshAccounts(); });
}
async function logout() { await perform(async () => { await adminApi.logout(); session.value = null; accounts.value = []; audits.value = []; password.value = ''; edit(); }); }
function edit(account?: Schema['AdminAccountData']) {
  editing.value = account ?? null;
  grants.value = account ? account.grants.map(grant => ({ ...grant })) : [{ role: 'STORE_READER', scopeKey: '' }];
  form.value = { username: account?.username ?? '', password: '', status: account?.status ?? 'ACTIVE', reason: account ? 'access_change' : 'onboarding' };
}
async function save() {
  const bindings = grants.value.map(grant => ({ role: grant.role, scopeKey: grant.role === 'IAM_MANAGER' ? 'GLOBAL' : grant.scopeKey.trim() }));
  if (bindings.some(grant => !grant.scopeKey)) { message.value = '请填写每一项的仓范围编号。'; return; }
  const secret = form.value.password; form.value.password = '';
  await perform(async () => {
    if (editing.value) await adminApi.update(editing.value.id, { version: editing.value.version, status: form.value.status, grants: bindings, reason: form.value.reason });
    else await adminApi.create({ username: form.value.username, password: secret, grants: bindings, reason: form.value.reason });
    await refreshAccounts(); edit(); message.value = '已保存。被修改账号的旧会话已撤销。';
  });
}
async function loadAudit() { await perform(async () => { audits.value = await adminApi.audit(); }); }
onMounted(async () => {
  try { session.value = await adminApi.me(); await refreshAccounts(); } catch (error) { if (!(error instanceof AdminRequestError && error.status === 401)) report(error); }
  finally { loading.value = false; }
});
</script>

<template>
  <main>
    <header><div><small>灵域 · 运营管理</small><h1>管理工作台</h1></div><button v-if="session" :disabled="busy" @click="logout">退出登录</button></header>
    <p v-if="message" role="alert" class="notice">{{ message }}</p>
    <p v-if="loading">正在恢复会话…</p>
    <form v-else-if="!session" class="panel login" @submit.prevent="login">
      <h2>管理员登录</h2>
      <label>用户名<input v-model="username" autocomplete="username" required pattern="[a-z][a-z0-9_.\-]{2,63}" maxlength="64"></label>
      <label>密码<input v-model="password" type="password" autocomplete="current-password" required minlength="12" maxlength="128"></label>
      <button :disabled="busy">{{ busy ? '正在登录…' : '登录' }}</button>
      <p class="hint">尚未开通账号时，请联系项目管理员。首次账号需通过本地初始化流程创建。</p>
    </form>
    <template v-else>
      <section class="panel"><h2>{{ session.admin.username }}</h2><p>会话有效至 {{ new Date(session.expiresAt).toLocaleString('zh-CN') }}</p>
        <h3>你的角色与范围</h3><ul><li v-for="grant in session.admin.grants" :key="grant.role + grant.scopeKey">{{ roles[grant.role] }} · {{ grant.scopeKey === 'GLOBAL' ? '全局账号管理' : grant.scopeKey }}</li></ul>
        <p v-if="!session.admin.grants.length">暂无授权，请联系账号管理员。</p>
        <p class="hint">商城销售范围不代表真实门店。实体门店与履约开通须后续配置和验收。</p>
      </section>
      <StorefrontSettings :session="session" @unauthenticated="report(new AdminRequestError(401))" />
      <template v-if="manager">
        <section class="panel"><div class="row"><h2>管理员（最多 100 条）</h2><button :disabled="busy" @click="perform(refreshAccounts)">刷新列表</button></div>
          <div class="table-wrap"><table><thead><tr><th>账号</th><th>状态</th><th>角色与范围</th><th>操作</th></tr></thead><tbody>
            <tr v-for="account in accounts" :key="account.id"><td>{{ account.username }}</td><td>{{ account.status === 'ACTIVE' ? '启用' : '停用' }}</td><td><div v-for="grant in account.grants" :key="grant.role + grant.scopeKey">{{ roles[grant.role] }} · {{ grant.scopeKey === 'GLOBAL' ? '全局' : grant.scopeKey }}</div></td><td><button :disabled="busy || account.id === session.admin.id" @click="edit(account)">编辑授权</button></td></tr>
          </tbody></table></div>
        </section>
        <form class="panel" @submit.prevent="save"><div class="row"><h2>{{ editing ? '编辑管理员' : '新增管理员' }}</h2><button type="button" :disabled="busy" @click="edit()">新增 / 清空</button></div>
          <p v-if="editing" class="hint">本次保存将替换该账号全部角色与范围，并撤销其已有会话。</p>
          <div class="fields"><label>用户名<input v-model="form.username" :disabled="!!editing" required pattern="[a-z][a-z0-9_.\-]{2,63}" maxlength="64" autocomplete="off"></label>
            <label v-if="!editing">初始密码<input v-model="form.password" type="password" required minlength="12" maxlength="128" autocomplete="new-password"></label>
            <label v-if="editing">状态<select v-model="form.status"><option value="ACTIVE">启用</option><option value="DISABLED">停用</option></select></label>
            <label>操作原因<select v-model="form.reason"><option value="onboarding">新成员入职</option><option value="access_change">职责调整</option><option value="offboarding">离职 / 停用</option><option value="security">安全处置</option></select></label>
          </div>
          <fieldset v-for="(grant, index) in grants" :key="index" :disabled="busy" class="fields">
            <legend>授权 {{ index + 1 }}</legend>
            <label>角色<select v-model="grant.role" @change="grant.scopeKey = grant.role === 'IAM_MANAGER' ? 'GLOBAL' : ''"><option v-for="(label, role) in roles" :key="role" :value="role">{{ label }}</option></select></label>
            <label v-if="grant.role !== 'IAM_MANAGER'">仓范围 UUID<input v-model="grant.scopeKey" required placeholder="一项授权对应一个仓范围"></label>
            <p v-else class="hint">全局账号管理，不包含仓店业务权限。</p>
            <button type="button" @click="grants.splice(index, 1)">移除此项授权</button>
          </fieldset>
          <p class="hint">可按仓添加不同角色，最多 30 项。移除全部授权后，该账号无法访问业务功能。</p>
          <div class="row"><button type="button" :disabled="busy || grants.length >= 30" @click="grants.push({ role: 'STORE_READER', scopeKey: '' })">添加授权</button><button :disabled="busy">{{ busy ? '正在保存…' : '保存' }}</button></div>
        </form>
        <section class="panel"><div class="row"><h2>最近审计（50 条）</h2><button :disabled="busy" @click="loadAudit">加载审计</button></div>
          <p v-if="!audits.length" class="hint">点击加载查看最近的操作记录。</p>
          <div class="table-wrap"><table v-if="audits.length"><thead><tr><th>时间 / 操作者</th><th>动作</th><th>对象 / 变更摘要</th><th>请求编号</th></tr></thead><tbody><tr v-for="record in audits" :key="record.id"><td>{{ new Date(record.createdAt).toLocaleString('zh-CN') }}<br>{{ record.actorId ?? '系统' }}</td><td>{{ record.action }}</td><td>{{ record.objectType }} · {{ record.objectId }}<br>{{ record.changes ? JSON.stringify(record.changes) : '—' }}</td><td>{{ record.requestId ?? '—' }}</td></tr></tbody></table></div>
        </section>
      </template>
    </template>
  </main>
</template>
<style scoped>
* { box-sizing: border-box; }
main { max-width: 1120px; margin: 32px auto; padding: 0 24px 48px; font-family: system-ui; color: #24372f; }
header, .row { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
small, .hint { color: #68766e; }
h1 { margin: 8px 0 24px; }
h2 { font-size: 20px; margin: 0 0 16px; }
h3 { font-size: 15px; }
.panel { border: 1px solid #dce5df; border-radius: 14px; padding: 24px; margin: 20px 0; background: #fff; }
.login { max-width: 460px; }
.fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
fieldset { min-width: 0; border: 1px solid #dce5df; margin: 12px 0; padding: 16px; }
label { display: block; margin-bottom: 16px; font-size: 14px; }
input, select { display: block; width: 100%; padding: 10px; margin-top: 7px; border: 1px solid #b7c8bd; border-radius: 6px; background: #fff; color: inherit; }
button { border: 0; border-radius: 6px; padding: 10px 16px; background: #285c47; color: white; cursor: pointer; white-space: nowrap; }
button:disabled { opacity: .5; cursor: default; }
button:focus-visible, input:focus-visible, select:focus-visible { outline: 3px solid #a6cbb4; outline-offset: 2px; }
.notice { padding: 14px; background: #fff4d8; border-radius: 8px; }
.hint { font-size: 13px; line-height: 1.6; }
.table-wrap { overflow: auto; }
table { width: 100%; min-width: 680px; border-collapse: collapse; font-size: 13px; }
th, td { text-align: left; vertical-align: top; padding: 12px 8px; border-bottom: 1px solid #e5ece8; }
td { overflow-wrap: anywhere; }
@media (max-width: 650px) {
  main { padding: 0 12px; }
  .panel { padding: 16px; }
  .fields { grid-template-columns: 1fr; }
  header, .row { align-items: flex-start; }
}
</style>
