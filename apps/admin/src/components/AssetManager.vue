<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import type { components } from '@lingyu/contracts';
import { adminApi, AdminRequestError } from '../services/admin';
type S = components['schemas'];
const props = defineProps<{ session: S['AdminSessionData'] }>();
const emit = defineEmits<{ unauthenticated: [] }>();
const allowed = computed(() => props.session.admin.grants.some(g => g.role === 'STORE_OPERATOR'));
const page = ref<S['AssetPage'] | null>(null), message = ref(''), busy = ref(false), preview = ref('');
const selected = ref<File | null>(null), ticket = ref<S['AssetData'] | null>(null);
let uploadId = '', revokeTarget: S['AssetData'] | null = null;
const confirmation = ref('');
function clearPreview() { if (preview.value) URL.revokeObjectURL(preview.value); preview.value = ''; }
onBeforeUnmount(clearPreview);
async function perform(work: () => Promise<void>) {
  if (busy.value) return; busy.value = true; message.value = '';
  try { await work(); } catch (error) {
    const status = error instanceof AdminRequestError ? error.status : 0;
    if (status === 401) { clearPreview(); page.value = null; ticket.value = null; emit('unauthenticated'); }
    message.value = ({ 400: '图片损坏、格式或尺寸不支持，请选择其他文件。', 401: '会话已失效，请重新登录。', 403: '没有操作权限。',
      404: '资产不存在、归属不符或尚未确认。', 409: '票据已过期、内容不一致或状态已变更，请重新读取。', 429: '资产配额或并发上限已达到，请稍后处理。',
      503: '开发图片存储未配置或当前环境不允许使用。' } as Record<number, string>)[status] ?? '请求失败，可使用原票据重试。';
  } finally { busy.value = false; }
}
function choose(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0] ?? null;
  selected.value = file; ticket.value = null; uploadId = ''; clearPreview(); message.value = '';
}
async function load(more = false) {
  await perform(async () => { const next = await adminApi.assets(more ? page.value?.nextCursor ?? undefined : undefined);
    page.value = more && page.value ? { ...next, items: [...page.value.items, ...next.items] } : next; });
}
async function upload() {
  const file = selected.value; if (!file) return;
  await perform(async () => {
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size < 1 || file.size > 2097152) { message.value = '仅支持不超过 2 MiB 的 PNG/JPEG。'; return; }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
    uploadId ||= crypto.randomUUID();
    ticket.value = await adminApi.issueAsset({ uploadId, purpose: 'CMS_IMAGE', mime: file.type as S['AssetIssueRequest']['mime'], size: bytes.length, sha256: digest });
    let binary = ''; for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    ticket.value = await adminApi.uploadAsset(uploadId, btoa(binary));
    message.value = '已上传至私有暂存，尚未验证。请执行解码确认。'; page.value = await adminApi.assets();
  });
}
async function confirm(item: S['AssetData']) {
  await perform(async () => { ticket.value = await adminApi.confirmAsset(item.id); page.value = await adminApi.assets(); message.value = '开发图片已解码并移除元数据；尚未进行生产内容扫描。'; });
}
async function inspect(item: S['AssetData']) {
  await perform(async () => { const response = await fetch('/api/v1/admin/assets/' + encodeURIComponent(item.id) + '/content', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new AdminRequestError(response.status); clearPreview(); preview.value = URL.createObjectURL(await response.blob()); });
}
function review(item: S['AssetData']) { revokeTarget = item; confirmation.value = item.id; }
async function revoke() {
  const item = revokeTarget; if (!item) return;
  await perform(async () => { await adminApi.revokeAsset(item.id, item.version); clearPreview(); confirmation.value = ''; revokeTarget = null; page.value = await adminApi.assets(); message.value = '已撤销使用资格，私有文件按保留策略另行处理。'; });
}
const labels: Record<S['AssetData']['status'], string> = { ISSUED: '待上传', STORED: '待解码确认', DEVELOPMENT_READY: '仅开发环境验证通过', REVOKED: '已撤销' };
</script>
<template>
  <section class="asset-panel"><h2>开发图片资产</h2>
    <p>仅用于本机 CMS 图片开发，文件私有保存。支持 PNG/JPEG，最大 2 MiB、边长不超过 4096；解码确认不代表生产扫描通过，图片 Banner 尚待后续接入。</p>
    <button :disabled="busy" @click="load()">读取我的图片资产</button><p v-if="message" role="alert">{{ message }}</p>
    <form v-if="allowed" @submit.prevent="upload"><label>选择图片<input type="file" accept="image/png,image/jpeg" :disabled="busy" @change="choose"></label>
      <button :disabled="busy || !selected">申请票据并上传（失败可原票据重试）</button></form>
    <p v-if="ticket">当前票据 {{ ticket.id }} · {{ labels[ticket.status] }} · 有效至 {{ new Date(ticket.expiresAt).toLocaleString('zh-CN') }}</p>
    <p v-if="page && !page.items.length">暂无属于当前账号的资产。</p>
    <article v-for="item in page?.items" :key="item.id"><code>{{ item.id }}</code><p>{{ labels[item.status] }} · {{ item.size }} 字节 · 版本 {{ item.version }}<span v-if="item.width"> · {{ item.width }} × {{ item.height }}</span></p>
      <button v-if="allowed && item.status === 'STORED'" :disabled="busy" @click="confirm(item)">解码确认</button>
      <button v-if="item.status === 'DEVELOPMENT_READY'" :disabled="busy" @click="inspect(item)">查看处理后的私有图片</button>
      <button v-if="allowed && item.status !== 'REVOKED'" :disabled="busy" @click="review(item)">撤销使用资格</button>
    </article><button v-if="page?.nextCursor" :disabled="busy" @click="load(true)">读取下一页</button>
    <section v-if="confirmation"><p>确认撤销资产 {{ confirmation }}？撤销后不能恢复使用；不会删除文件或恢复额度。</p><button :disabled="busy" @click="revoke">确认撤销</button><button :disabled="busy" @click="confirmation = ''">取消</button></section>
    <img v-if="preview" :src="preview" alt="解码后私有图片预览"><p v-if="busy">正在处理，请稍候…</p>
  </section>
</template>
<style scoped>
.asset-panel { margin: 20px 0; padding: 24px; border: 1px solid #dce5df; border-radius: 14px; background: white; }
p { font-size: 13px; color: #68766e; line-height: 1.7; overflow-wrap: anywhere; } article { border-top: 1px solid #dce5df; padding: 14px 0; } code { overflow-wrap: anywhere; }
label { display: block; margin: 14px 0; } input { display: block; margin-top: 8px; max-width: 100%; } button { padding: 9px 14px; margin: 4px; border: 0; border-radius: 6px; color: white; background: #285c47; cursor: pointer; } button:disabled { opacity: .5; cursor: default; } img { display: block; max-width: 100%; max-height: 300px; object-fit: contain; margin-top: 16px; }
</style>
