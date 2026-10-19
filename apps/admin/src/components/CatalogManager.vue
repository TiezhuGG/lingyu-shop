<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { components } from '@lingyu/contracts';
import { adminApi, AdminRequestError } from '../services/admin';
type S = components['schemas'];
const props = defineProps<{ session: S['AdminSessionData'] }>();
const emit = defineEmits<{ (event: 'unauthenticated'): void }>();
const scope = ref(''), busy = ref(false), message = ref(''), configured = ref(false);
const readable = computed(() => props.session.admin.grants.some(g => g.scopeKey === scope.value && ['STORE_OPERATOR', 'STORE_READER'].includes(g.role)));
const writable = computed(() => props.session.admin.grants.some(g => g.scopeKey === scope.value && g.role === 'STORE_OPERATOR'));
const categories = ref<S['CatalogCategory'][]>([]), products = ref<S['CatalogProductSummary'][]>([]), nextCursor = ref<string | null>(null);
const category = ref<S['CatalogCategory'] | null>(null), product = ref<S['CatalogProductDraft'] | null>(null);
const original = ref<S['CatalogProductDraft'] | null>(null), confirming = ref<'publish' | 'withdraw' | null>(null);
const units: Record<S['CatalogUnit'], string> = { PIECE: '件', PACK: '包', BOX: '盒', BOTTLE: '瓶', BAG: '袋' };
const dirty = computed(() => JSON.stringify(product.value) !== JSON.stringify(original.value));
const fixed = (id: string) => original.value?.skus.some(sku => sku.id === id) ?? false;
function failure(error: unknown) {
  const status = error instanceof AdminRequestError ? error.status : 0;
  if (status === 401) { product.value = null; original.value = null; emit('unauthenticated'); }
  message.value = ({ 400: '请检查名称、规格组合、编码、单位和整数分价格。', 401: '会话失效，请重新登录。', 403: '没有当前商城范围的操作权限。',
    404: '商品已不存在，请重载目录。', 409: '版本、编码或规格冲突，或发布条件未满足。请保留输入并重载核对；未静默覆盖。' } as Record<number, string>)[status] ?? '操作失败，请稍后重试。';
}
async function perform(action: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true; message.value = ''; confirming.value = null;
  try { await action(); } catch (error) { failure(error); } finally { busy.value = false; }
}
async function list(append = false) {
  const data = await adminApi.catalog(append ? nextCursor.value ?? undefined : undefined);
  categories.value = data.categories;
  products.value = append ? [...products.value, ...data.items] : data.items;
  nextCursor.value = data.nextCursor;
}
async function load() {
  await perform(async () => { const data = await adminApi.publicStorefront(); scope.value = data.storeId; configured.value = data.configured; if (readable.value) await list(); });
}
function newCategory() { category.value = { id: crypto.randomUUID(), name: '', sort: 0, active: true, version: 0 }; }
async function saveCategory() {
  if (!category.value) return;
  const value = category.value;
  await perform(async () => { const result = await adminApi.saveCategory(value.id, { version: value.version, name: value.name, sort: value.sort, active: value.active, reason: 'catalog_change' });
    category.value = result.category; await list(); message.value = '分类已保存。已发布商品仍保留原分类快照。审计编号：' + result.auditId; });
}
function setProduct(value: S['CatalogProductDraft']) { product.value = structuredClone(value); original.value = structuredClone(value); confirming.value = null; }
function newProduct() {
  setProduct({ id: crypto.randomUUID(), version: 0, publishedVersion: null, publishedName: null, publishedPrices: [], name: '', description: '', categoryId: '', skus: [] });
  addSku(); original.value = null;
}
function addSku() {
  if (!product.value || product.value.skus.length >= 30) return;
  product.value.skus.push({ id: crypto.randomUUID(), code: '', unit: 'PACK', options: [], active: true, priceMinor: null });
  confirming.value = null;
}
async function selectProduct(id: string) { await perform(async () => setProduct(await adminApi.catalogProduct(id))); }
async function saveProduct() {
  const value = product.value;
  if (!value) return;
  await perform(async () => { const result = await adminApi.saveProduct(value.id, { version: value.version, categoryId: value.categoryId, name: value.name, description: value.description,
    skus: value.skus.map(sku => ({ ...sku, priceMinor: sku.priceMinor?.trim() || null })), reason: 'catalog_change' });
    setProduct(result.product); await list(); message.value = '商品和价格草稿已保存，尚未影响公开版本。审计编号：' + result.auditId; });
}
async function publish() {
  const value = product.value, action = confirming.value;
  if (!value || !action || dirty.value) return;
  await perform(async () => { const result = await adminApi.publishProduct(value.id, { version: value.version, reason: 'publication_change' }, action);
    setProduct(result.product); await list(); message.value = (action === 'publish' ? '已发布新商品及价目版本，仍不可购买。' : '已下架，公开列表不再返回此商品。') + '审计编号：' + result.auditId; });
}
onMounted(load);
</script>
<template>
  <section class="catalog-panel">
    <div class="row"><h2>商品目录与发布</h2><button :disabled="busy" @click="load">刷新商品目录</button></div>
    <p>固定包装、整数分价格。草稿与公开版本分离；发布仅供浏览，库存和交易尚未接入。图片与专题后续接入，不使用虚构素材。</p>
    <p v-if="message" role="alert">{{ message }}</p><p v-if="busy">正在处理商品…</p>
    <p v-if="scope && !readable">当前账号没有此商城的商品权限。</p>
    <template v-if="readable">
      <p v-if="!configured">请先在上方保存商城名称，再刷新商品目录；不需要真实门店。</p>
      <div class="row"><h3>一级分类（最多 100 个）</h3><button v-if="writable" :disabled="busy || !configured" @click="newCategory">新增分类</button></div>
      <div class="chips"><button v-for="item in categories" :key="item.id" :disabled="busy" @click="category = { ...item }">{{ item.name }} · {{ item.active ? '启用' : '归档' }}</button></div>
      <p v-if="!categories.length">尚无分类。</p>
      <form v-if="category" @submit.prevent="saveCategory"><fieldset :disabled="busy || !writable">
        <div class="fields"><label>分类名称<input v-model="category.name" required maxlength="80"></label><label>分类排序<input v-model.number="category.sort" type="number" required min="0" max="9999"></label></div>
        <label class="check"><input v-model="category.active" type="checkbox">允许用于新发布（归档不会自动下架旧商品）</label>
        <button v-if="writable">保存分类</button>
      </fieldset></form>
      <div class="row"><h3>商品草稿</h3><button v-if="writable" :disabled="busy || !configured" @click="newProduct">新增商品</button></div>
      <p v-if="!products.length">尚无商品。不会自动填充示例价格。</p>
      <div class="table-wrap"><table v-if="products.length"><thead><tr><th>名称（草稿）</th><th>草稿版本</th><th>公开版本</th><th>操作</th></tr></thead><tbody>
        <tr v-for="item in products" :key="item.id"><td>{{ item.name }}</td><td>{{ item.version }}</td><td>{{ item.publishedVersion ?? '未发布 / 已下架' }}</td><td><button :disabled="busy" @click="selectProduct(item.id)">编辑 / 查看</button></td></tr>
      </tbody></table></div><button v-if="nextCursor" :disabled="busy" @click="perform(() => list(true))">加载下一页商品</button>
      <form v-if="product" @submit.prevent="saveProduct">
        <div class="row"><h3>商品编辑 · 版本 {{ product.version }}</h3><button type="button" :disabled="busy || product.version === 0" @click="selectProduct(product.id)">重载此商品（丢弃未保存输入）</button></div>
        <p>已公开名称：{{ product.publishedName ?? '无' }} · 公开版本 {{ product.publishedVersion ?? '无' }}。编码、单位、规格保存后不可更改；换包装需新增 SKU，停用旧 SKU 后重新发布。</p>
        <fieldset :disabled="busy || !writable">
          <div class="fields"><label>商品名称<input v-model="product.name" required maxlength="80"></label><label>所属分类<select v-model="product.categoryId" required><option value="" disabled>请选择分类</option><option v-for="item in categories" :key="item.id" :value="item.id" :disabled="!item.active">{{ item.name }}{{ item.active ? '' : '（已归档）' }}</option></select></label></div>
          <label>商品说明（纯文本）<textarea v-model="product.description" maxlength="1000" rows="2"></textarea></label>
          <section v-for="(sku, index) in product.skus" :key="sku.id" class="sku">
            <h4>SKU {{ index + 1 }} · {{ fixed(sku.id) ? '身份已固定' : '待首次保存' }}</h4>
            <div class="fields"><label>SKU 编码<input v-model="sku.code" :disabled="fixed(sku.id)" required pattern="[A-Z0-9][A-Z0-9_\-]{2,47}" maxlength="48" placeholder="唯一大写编码"></label>
              <label>销售单位<select v-model="sku.unit" :disabled="fixed(sku.id)"><option v-for="(label, key) in units" :key="key" :value="key">{{ label }}（固定包装）</option></select></label></div>
            <div v-for="(option, at) in sku.options" :key="at" class="fields"><label>选项名<input v-model="option.name" :disabled="fixed(sku.id)" required maxlength="24" placeholder="如：包装"></label><label>选项值<input v-model="option.value" :disabled="fixed(sku.id)" required maxlength="40" placeholder="由实际商品确定"></label></div>
            <div v-if="!fixed(sku.id)" class="row"><button type="button" :disabled="sku.options.length >= 3" @click="sku.options.push({ name: '', value: '' })">添加规格轴</button><button v-if="sku.options.length" type="button" @click="sku.options.pop()">移除最后规格轴</button></div>
            <p>同一商品全部 SKU 的选项名须一致，组合不可重复；单一默认规格可以留空。</p>
            <label>草稿售价（整数分，可留空）<input v-model="sku.priceMinor" inputmode="numeric" pattern="(0|[1-9][0-9]{0,11})" maxlength="12" placeholder="未定，不默认免费"></label>
            <p>当前公开售价：{{ product.publishedPrices.find(price => price.id === sku.id)?.priceMinor ?? '未公开' }} 分 → 草稿：{{ sku.priceMinor ?? '未定' }} 分</p>
            <label class="check"><input v-model="sku.active" type="checkbox">下次发布包含此 SKU</label>
            <button v-if="!fixed(sku.id)" type="button" :disabled="product.skus.length <= 1" @click="product.skus.splice(index, 1)">移除此未保存 SKU</button>
          </section>
          <div class="row"><button type="button" :disabled="product.skus.length >= 30" @click="addSku">新增固定 SKU</button><button>保存商品与价格草稿</button></div>
        </fieldset>
      </form>
      <template v-if="product && writable && product.version > 0">
        <p v-if="dirty">有未保存修改：请先保存草稿或明确重载后再发布/下架。</p>
        <div class="row"><button :disabled="busy || dirty" @click="confirming = 'publish'">检查并发布</button><button :disabled="busy || dirty || product.publishedVersion === null" @click="confirming = 'withdraw'">检查并下架</button></div>
        <section v-if="confirming && !dirty" class="confirmation">
          <h3>{{ confirming === 'publish' ? '确认发布新版本' : '确认下架' }}</h3>
          <p>范围：{{ scope }} · 商品：{{ product.name }} · 当前版本 {{ product.version }}。原因：商品发布调整。</p>
          <p v-for="sku in product.skus" :key="sku.id">{{ sku.code }}：{{ product.publishedPrices.find(price => price.id === sku.id)?.priceMinor ?? '未公开' }} 分 → {{ sku.active ? (sku.priceMinor ?? '价格未定，不能发布') + ' 分 / ' + units[sku.unit] : '下次不公开' }}</p>
          <p>{{ confirming === 'publish' ? '将以已保存内容生成公开快照；所有启用 SKU 必须有价格，不会启用库存、交易或履约。' : '将从公开列表移除此商品，保留草稿及发布历史；不会删除已有身份。' }}</p>
          <button :disabled="busy" @click="publish">{{ confirming === 'publish' ? '确认发布已保存版本' : '确认从商城下架' }}</button>
        </section>
      </template>
    </template>
  </section>
</template>
<style scoped>
.catalog-panel { background: white; border: 1px solid #dce5df; border-radius: 14px; padding: 24px; margin: 20px 0; }
h2 { font-size: 20px; } h3 { font-size: 16px; margin-top: 24px; } h4 { font-size: 14px; }
p { color: #68766e; font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
.row, .chips { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin: 12px 0; }
.chips { justify-content: flex-start; } .chips button { background: #edf4ef; color: #285c47; }
fieldset { border: 0; min-width: 0; padding: 0; } label { display: block; font-size: 14px; margin: 12px 0; }
input, select, textarea { box-sizing: border-box; width: 100%; display: block; padding: 10px; border: 1px solid #b7c8bd; border-radius: 6px; font: inherit; margin-top: 7px; }
.check { display: flex; align-items: center; gap: 8px; } .check input { width: auto; margin: 0; }
button { background: #285c47; color: white; padding: 10px 16px; border: 0; border-radius: 6px; cursor: pointer; } button:disabled { opacity: .5; cursor: default; }
.fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; } .sku { border-top: 1px solid #dce5df; margin-top: 16px; }
.table-wrap { overflow-x: auto; } table { border-collapse: collapse; width: 100%; min-width: 480px; } th, td { padding: 12px; text-align: left; border-bottom: 1px solid #dce5df; overflow-wrap: anywhere; }
.confirmation { border: 1px solid #b8cdbf; padding: 16px; background: #f4f8f5; margin-top: 16px; }
@media(max-width: 650px) { .catalog-panel { padding: 16px; } .fields { grid-template-columns: 1fr; } }
</style>
