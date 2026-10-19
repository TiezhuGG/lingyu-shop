<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import type { components } from '@lingyu/contracts';
import { getStorefront } from '../../services/storefront';
import { getPublishedProducts, formatCatalogMinor } from '../../services/catalog';
import PreviewNotice from '../../components/PreviewNotice.vue';
type S = components['schemas'];
const storefront = ref<components['schemas']['StorefrontData'] | null>(null);
const storefrontState = ref<'loading' | 'ready' | 'error'>('loading');
const products = ref<S['CatalogPublishedProduct'][]>([]), nextCursor = ref<string | null>(null);
const state = ref<'loading' | 'ready' | 'error'>('loading'), busy = ref(false), moreError = ref(false);
const units: Record<S['CatalogUnit'], string> = { PIECE: '件', PACK: '包', BOX: '盒', BOTTLE: '瓶', BAG: '袋' };
async function loadStorefront() {
  storefrontState.value = 'loading';
  try { storefront.value = await getStorefront(); storefrontState.value = 'ready'; }
  catch { storefront.value = null; storefrontState.value = 'error'; }
}
async function loadProducts(append = false) {
  if (busy.value) return;
  busy.value = true; moreError.value = false;
  if (!append) { state.value = 'loading'; products.value = []; nextCursor.value = null; }
  try {
    const data = await getPublishedProducts(append ? nextCursor.value ?? undefined : undefined);
    const previous = new Set(products.value.map(product => product.id));
    products.value = append ? [...products.value, ...data.items.filter(product => !previous.has(product.id))] : data.items;
    nextCursor.value = data.nextCursor; state.value = 'ready';
  } catch { if (append) moreError.value = true; else state.value = 'error'; }
  finally { busy.value = false; }
}
onShow(() => { void loadStorefront(); void loadProducts(); });
</script>
<template>
  <view class="lingyu-theme page-shell">
    <view class="market-heading">
      <text class="page-title">市集</text>
      <button disabled class="search-placeholder">⌕ 搜索商品 · 未开放</button>
    </view>
    <PreviewNotice message="商品来自已发布目录；库存、购物车与交易尚未开放" />
    <view class="market-banner">
      <view class="eyebrow">线上商城</view>
      <view class="banner-title">认真挑选，明码标价</view>
      <view>仅展示已发布商品与包装规格，不承诺有货或可配送</view>
    </view>
    <view class="store-row">
      <view>
        <view class="section-title">{{ storefront?.displayName ?? '线上商城' }}</view>
        <view v-if="storefrontState === 'loading'" class="muted">正在读取商城资料…</view>
        <view v-else-if="storefrontState === 'error'" class="muted">商城资料暂未连接，不使用示例资料替代</view>
        <view v-else class="muted">{{ storefront?.configured ? '线上销售范围，不代表实体门店' : '商城名称尚未设置' }}</view>
      </view>
      <button v-if="storefrontState === 'error'" class="soft-button" @click="loadStorefront">重试资料</button>
    </view>
    <view class="mode-hint">快递 / 同城配送 / 自提规则保留，尚未开通 · 暂不支持下单</view>
    <view class="catalog-layout">
      <view class="category-scroll"><view class="category-button active">全部商品</view><view class="muted category-note">分类筛选与规格选择后续接入</view></view>
      <scroll-view scroll-y class="catalog-scroll">
        <view class="catalog-toolbar"><text class="catalog-title">已发布商品</text><button class="outline-button" :disabled="busy" @click="loadProducts()">刷新商品</button></view>
        <view v-if="state === 'loading'" class="page-state">正在读取已发布目录…</view>
        <view v-else-if="state === 'error'" class="page-state"><text>商品暂未连接，不展示样例价格</text><button class="soft-button" @click="loadProducts()">重试商品</button></view>
        <view v-else-if="!products.length" class="page-state"><text>暂未发布商品</text><text class="muted">运营发布后将在这里展示</text></view>
        <template v-else>
          <view v-for="product in products" :key="product.id" class="published-card">
            <view class="muted">{{ product.category.name }} · 发布版本 {{ product.version }}</view><view class="section-title">{{ product.name }}</view>
            <view v-if="product.description" class="product-description muted">{{ product.description }}</view>
            <view v-for="sku in product.skus" :key="sku.id" class="published-sku">
              <view>{{ sku.options.map(option => option.name + '：' + option.value).join(' / ') || '默认规格' }}</view>
              <view class="price">¥{{ formatCatalogMinor(sku.priceMinor) }}<text class="muted"> / {{ units[sku.unit] }}</text></view>
              <view class="muted">{{ sku.code }} · 价目版本 {{ sku.priceVersion }}</view>
            </view><view class="muted">库存未接入 · 暂不可购买</view>
          </view>
          <view v-if="moreError" class="page-state">下一页加载失败，已显示商品未丢失</view>
          <button v-if="nextCursor" class="soft-button load-more" :disabled="busy" @click="loadProducts(true)">{{ busy ? '正在读取…' : moreError ? '重试下一页' : '加载更多商品' }}</button>
          <view v-else class="bottom-hint">已显示全部已发布商品</view>
        </template>
      </scroll-view>
    </view>
    <view class="cart-preview">
      <view>
        <view>购物车尚未开放</view>
        <view class="cart-note">价格仅供浏览，暂不可购买</view>
      </view>
      <button disabled>去结算</button>
    </view>
  </view>
</template>
<style scoped>
.category-note { padding: 8px; text-align: center; }
.catalog-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 8px; }
.catalog-title { padding: 0; font-size: 14px; }
.published-card { padding: 14px 12px; border-bottom: 1px solid var(--ly-border); overflow-wrap: anywhere; }
.published-card .section-title { margin: 6px 0; } .product-description { white-space: pre-wrap; }
.published-sku { padding: 10px 0; font-size: 12px; } .published-sku .price { margin: 4px 0; }
.load-more { margin: 16px auto !important; }
</style>
