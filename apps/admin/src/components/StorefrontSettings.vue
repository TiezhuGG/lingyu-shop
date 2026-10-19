<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { components } from '@lingyu/contracts';
import { adminApi, AdminRequestError } from '../services/admin';
type Schema = components['schemas'];
const props = defineProps<{ session: Schema['AdminSessionData'] }>();
const emit = defineEmits<{ (event: 'unauthenticated'): void }>();
const metadata = ref<Schema['StorefrontData'] | null>(null);
const settings = ref<Schema['StorefrontAdminData'] | null>(null);
const busy = ref(false), message = ref('');
const labels: Record<Schema['FulfillmentMethod'], string> = { EXPRESS: '快递', LOCAL_DELIVERY: '同城配送', PICKUP: '自提' };
const readable = computed(() => props.session.admin.grants.some(grant => grant.scopeKey === metadata.value?.storeId && ['STORE_OPERATOR', 'STORE_READER'].includes(grant.role)));
const writable = computed(() => props.session.admin.grants.some(grant => grant.scopeKey === metadata.value?.storeId && grant.role === 'STORE_OPERATOR'));
function failure(error: unknown) {
  const status = error instanceof AdminRequestError ? error.status : 0;
  if (status === 401) { settings.value = null; emit('unauthenticated'); }
  message.value = ({ 400: '请检查名称、整数分费用和规则内容。', 401: '会话失效，请重新登录。', 403: '没有当前商城范围的权限。', 409: '版本已变更，请重新加载设置后编辑。' } as Record<number, string>)[status] ?? '设置加载或保存失败，请稍后重试。';
}
async function load() {
  if (busy.value) return;
  busy.value = true; message.value = '';
  try {
    metadata.value = await adminApi.publicStorefront();
    settings.value = readable.value ? await adminApi.storefront() : null;
  } catch (error) { failure(error); } finally { busy.value = false; }
}
async function save() {
  if (busy.value || !settings.value || !writable.value) return;
  busy.value = true; message.value = '';
  try {
    const result = await adminApi.saveStorefront({ version: settings.value.storefront.version, displayName: settings.value.storefront.displayName ?? '',
      fulfillmentRules: settings.value.fulfillmentRules.map(rule => ({ ...rule, feeMinor: rule.feeMinor?.trim() || null, freeAboveMinor: rule.freeAboveMinor?.trim() || null,
        serviceDescription: rule.serviceDescription?.trim() || null, pickupAddress: rule.pickupAddress?.trim() || null })), reason: 'configuration_change' });
    settings.value = result.settings; metadata.value = result.settings.storefront;
    message.value = '已保存草稿，履约尚未开通。审计编号：' + result.auditId;
  } catch (error) { failure(error); } finally { busy.value = false; }
}
onMounted(load);
</script>
<template>
  <section class="store-panel">
    <div class="heading"><h2>商城与履约规则草稿</h2><button type="button" :disabled="busy" @click="load">重新加载设置</button></div>
    <p>当前先做线上商城，无需真实门店；快递、同城配送、自提都保留。草稿不用于报价、收费或可配送承诺。</p>
    <p v-if="metadata">商城授权范围：<code>{{ metadata.storeId }}</code></p>
    <p v-if="message" role="alert">{{ message }}</p>
    <p v-if="busy">正在处理设置…</p>
    <p v-if="metadata && !readable">当前账号未获此范围的商城权限。账号管理员可将此编号绑定给商城运营或只读账号；全局账号管理权限不代替业务权限。</p>
    <form v-if="settings" @submit.prevent="save">
      <p>{{ settings.storefront.configured ? '已配置商城' : '尚未配置商城' }} · 版本 {{ settings.storefront.version }} · 三种履约方式均未开通</p>
      <fieldset :disabled="busy || !writable">
        <label>商城显示名称<input v-model="settings.storefront.displayName" required maxlength="64" placeholder="填写商城名称，不必填写门店名称"></label>
        <section v-for="rule in settings.fulfillmentRules" :key="rule.method" class="rule">
          <h3>{{ labels[rule.method] }}规则草稿</h3>
          <div class="fields"><label>运费（整数分，可留空）<input v-model="rule.feeMinor" inputmode="numeric" pattern="[0-9]*" maxlength="12" placeholder="未定，不等于免费"></label>
            <label>免运门槛（整数分，可留空）<input v-model="rule.freeAboveMinor" inputmode="numeric" pattern="[0-9]*" maxlength="12" placeholder="未定，不默认包邮"></label></div>
          <label>服务范围与时段说明（草稿）<textarea v-model="rule.serviceDescription" maxlength="500" rows="2" placeholder="可暂不填写；文字说明不代替地址范围校验"></textarea></label>
          <label v-if="rule.method === 'PICKUP'">自提地址（可暂不填写）<input v-model="rule.pickupAddress" maxlength="200" placeholder="未填写也可保存草稿，不代表可自提"></label>
        </section>
        <button v-if="writable" :disabled="busy">保存商城与规则草稿</button>
      </fieldset>
      <p v-if="!writable">当前为只读权限，不能修改规则。</p>
    </form>
  </section>
</template>
<style scoped>
.store-panel { border: 1px solid #dce5df; border-radius: 14px; padding: 24px; margin: 20px 0; background: white; }
.heading { display: flex; justify-content: space-between; gap: 16px; align-items: center; }
h2 { font-size: 20px; } h3 { font-size: 16px; }
p { color: #68766e; font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
fieldset { border: 0; padding: 0; min-width: 0; }
label { display: block; font-size: 14px; margin: 12px 0; }
input, textarea { box-sizing: border-box; display: block; width: 100%; margin-top: 7px; padding: 10px; border: 1px solid #b7c8bd; border-radius: 6px; font: inherit; }
button { background: #285c47; color: white; padding: 10px 16px; border: 0; border-radius: 6px; cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }
.fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.rule { border-top: 1px solid #dce5df; margin-top: 20px; }
@media(max-width: 650px) { .store-panel { padding: 16px; } .fields { grid-template-columns: 1fr; } .heading { align-items: flex-start; } }
</style>
