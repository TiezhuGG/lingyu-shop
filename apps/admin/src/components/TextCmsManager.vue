<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { components } from '@lingyu/contracts';
import { adminApi, AdminRequestError } from '../services/admin';
type S = components['schemas'];
const props = defineProps<{ session: S['AdminSessionData'] }>();
const emit = defineEmits<{ (event: 'unauthenticated'): void }>();
const labels: Record<S['CmsPageCode'], string> = { STORY: '品牌故事', TERMS: '服务条款', PRIVACY: '隐私说明' };
const selected = ref<S['CmsPageCode']>('STORY'), scope = ref(''), configured = ref(false), busy = ref(false), message = ref('');
const page = ref<S['CmsAdminData'] | null>(null), draft = ref({ title: '', body: '' });
const confirmation = ref<'publish' | 'withdraw' | 'rollback' | null>(null), target = ref<S['CmsTextRevision'] | null>(null);
const readable = computed(() => props.session.admin.grants.some(g => g.scopeKey === scope.value && ['STORE_OPERATOR', 'STORE_READER'].includes(g.role)));
const writable = computed(() => props.session.admin.grants.some(g => g.scopeKey === scope.value && g.role === 'STORE_OPERATOR'));
const dirty = computed(() => !!page.value && (draft.value.title !== page.value.title || draft.value.body !== page.value.body));
function setPage(value: S['CmsAdminData']) { page.value = value; draft.value = { title: value.title, body: value.body }; confirmation.value = null; target.value = null; }
async function perform(operation: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true; message.value = '';
  try { await operation(); }
  catch (error) {
    const status = error instanceof AdminRequestError ? error.status : 0;
    if (status === 401) { page.value = null; emit('unauthenticated'); }
    message.value = ({ 400: '页码、文字长度或输入格式无效。', 401: '会话失效，请重新登录。', 403: '没有此商城内容操作权限。', 404: '页面或目标历史版本不存在。',
      409: '版本冲突、商城未配置或发布内容为空。请核对后明确重载，不会自动覆盖输入。' } as Record<number, string>)[status] ?? '内容请求失败，请稍后重试。';
  } finally { busy.value = false; }
}
async function load() {
  await perform(async () => { const info = await adminApi.publicStorefront(); scope.value = info.storeId; configured.value = info.configured;
    if (readable.value) setPage(await adminApi.cms(selected.value)); });
}
async function save() {
  const current = page.value; if (!current) return;
  await perform(async () => { const result = await adminApi.saveCms(current.pageCode, { ...draft.value, version: current.version, reason: 'content_change' });
    setPage(result.page); message.value = '草稿已保存，公开内容未变。审计编号：' + result.auditId; });
}
async function more() {
  const current = page.value; if (!current?.nextCursor) return;
  await perform(async () => { const data = await adminApi.cms(current.pageCode, current.nextCursor!);
    if (data.version !== current.version) throw new AdminRequestError(409);
    current.history.push(...data.history); current.hasMore = data.hasMore; current.nextCursor = data.nextCursor;
  });
}
function review(action: 'publish' | 'withdraw' | 'rollback', revision: S['CmsTextRevision'] | null = null) { target.value = revision; confirmation.value = action; }
async function change() {
  const current = page.value, action = confirmation.value, revision = target.value;
  if (!current || !action || dirty.value || (action === 'rollback' && !revision)) return;
  await perform(async () => { const input = action === 'rollback' ? { version: current.version, targetVersion: revision!.version, reason: 'content_rollback' as const } :
    { version: current.version, reason: 'content_publication' as const };
    const result = await adminApi.changeCms(current.pageCode, action, input); setPage(result.page);
    message.value = (action === 'withdraw' ? '已撤下公开内容，历史保留。' : '已生成新的公开版本。') + '审计编号：' + result.auditId;
  });
}
onMounted(load);
</script>
<template>
  <section class="cms-panel">
    <h2>故事与协议内容</h2><p>仅纯文本，不解析 HTML、脚本或外链。正式品牌文案、条款及隐私说明由经营方核定；发布页面不代表用户已同意。</p>
    <div class="row"><label>内容页面<select v-model="selected" :disabled="busy"><option v-for="(label, code) in labels" :key="code" :value="code">{{ label }}</option></select></label>
      <button :disabled="busy" @click="load">读取所选页面（丢弃未保存修改）</button></div>
    <p v-if="message" role="alert">{{ message }}</p><p v-if="busy">正在处理内容…</p><p v-if="scope && !readable">当前账号没有商城内容权限。</p>
    <template v-if="page && readable">
      <p>正在编辑：{{ labels[page.pageCode] }} · 聚合版本 {{ page.version }} · 公开版本 {{ page.published?.version ?? '未发布 / 已撤下' }}</p>
      <p v-if="!configured">请先在上方保存商城名称，再重载此面板；不需要真实门店。</p>
      <form @submit.prevent="save"><fieldset :disabled="busy || !writable || !configured">
        <label>内容标题<input v-model="draft.title" maxlength="80"></label><label>内容正文<textarea v-model="draft.body" maxlength="12000" rows="7"></textarea></label>
        <button v-if="writable">保存内容草稿</button>
      </fieldset></form>
      <details><summary>预览当前编辑内容（尚未发布）</summary><h3>{{ draft.title || '空标题' }}</h3><p class="plain">{{ draft.body || '空正文' }}</p></details>
      <details><summary>查看当前公开内容</summary><template v-if="page.published"><h3>{{ page.published.title }}</h3><p class="plain">{{ page.published.body }}</p></template><p v-else>尚无公开内容。</p></details>
      <p v-if="dirty">有未保存修改，请先保存或明确重载后再发布、回退或撤下。</p>
      <div v-if="writable" class="row"><button :disabled="busy || dirty || page.version === 0" @click="review('publish')">核对并发布内容</button><button :disabled="busy || dirty || !page.published" @click="review('withdraw')">核对并撤下内容</button></div>
      <h3>发布历史（每页 10 条）</h3><p v-if="!page.history.length">暂无发布历史。</p>
      <details v-for="item in page.history" :key="item.version"><summary>版本 {{ item.version }} · {{ item.title }}{{ item.sourceVersion === null ? '' : ' · 来源版本 ' + item.sourceVersion }}</summary>
        <p>{{ new Date(item.publishedAt).toLocaleString('zh-CN') }}</p><p class="plain">{{ item.body }}</p>
        <button v-if="writable" :disabled="busy || dirty" @click="review('rollback', item)">预览回退到版本 {{ item.version }}</button>
      </details><button v-if="page.nextCursor" :disabled="busy" @click="more">加载更早发布版本</button>
      <section v-if="confirmation && !dirty && writable" class="confirm">
        <h3>确认{{ confirmation === 'publish' ? '发布已保存草稿' : confirmation === 'rollback' ? '回退为新发布版本' : '撤下公开内容' }}</h3>
        <p>{{ labels[page.pageCode] }} · 当前聚合版本 {{ page.version }} · 范围 {{ scope }}</p>
        <p>当前公开标题：{{ page.published?.title ?? '无' }} · 当前公开版本 {{ page.published?.version ?? '无' }}</p>
        <template v-if="confirmation !== 'withdraw'"><h4>目标：{{ confirmation === 'rollback' ? target?.title : page.title }}</h4>
          <p v-if="confirmation === 'rollback'">来源版本 {{ target?.version }}；仅复制为新公开版本，草稿不变，历史不覆盖。</p>
          <p class="plain">{{ confirmation === 'rollback' ? target?.body : page.body }}</p></template>
        <p v-else>公开页面将显示暂无内容，草稿和全部历史保留。</p>
        <button :disabled="busy" @click="change">确认执行内容变更</button><button :disabled="busy" @click="confirmation = null">取消</button>
      </section>
    </template>
  </section>
</template>
<style scoped>
.cms-panel { border: 1px solid #dce5df; border-radius: 14px; padding: 24px; margin: 20px 0; background: white; }
h2 { font-size: 20px; } h3 { font-size: 16px; } p { color: #68766e; font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
.row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; justify-content: space-between; margin: 12px 0; }
label { display: block; font-size: 14px; margin: 12px 0; } input, select, textarea { box-sizing: border-box; display: block; width: 100%; padding: 10px; margin-top: 7px; font: inherit; border: 1px solid #b7c8bd; border-radius: 6px; }
fieldset { padding: 0; border: 0; min-width: 0; } button { background: #285c47; color: white; padding: 10px 16px; border: 0; border-radius: 6px; cursor: pointer; } button:disabled { opacity: .5; cursor: default; }
details { margin: 16px 0; padding: 12px; border: 1px solid #e2e9e4; border-radius: 6px; } summary { cursor: pointer; font-size: 14px; overflow-wrap: anywhere; }
.plain { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 360px; overflow-y: auto; } .confirm { padding: 16px; background: #f4f8f5; border: 1px solid #b8cdbf; }
@media(max-width:650px) { .cms-panel { padding: 16px; } }
</style>
