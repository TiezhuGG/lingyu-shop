<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import type { components } from '@lingyu/contracts';
import { getStorefront } from '../../services/storefront';
import PreviewNotice from '../../components/PreviewNotice.vue';
import PageState from '../../components/PageState.vue';
import PreviewStates from '../../components/PreviewStates.vue';
import ProductCard from '../../components/ProductCard.vue';
import { categories, products } from '../../features/preview-fixtures';
import { usePreviewState } from '../../features/use-preview-state';
const category = ref('精选好物');
const storefront = ref<components['schemas']['StorefrontData'] | null>(null);
const storefrontState = ref<'loading' | 'ready' | 'error'>('loading');
async function loadStorefront() {
  storefrontState.value = 'loading';
  try { storefront.value = await getStorefront(); storefrontState.value = 'ready'; }
  catch { storefront.value = null; storefrontState.value = 'error'; }
}
onShow(loadStorefront);
const { state, changeState, retry } = usePreviewState();
const visibleProducts = computed(() => category.value === '精选好物' ? products : products.filter(item => item.category === category.value));
</script>
<template>
  <view class="lingyu-theme page-shell">
    <view class="market-heading">
      <text class="page-title">市集</text>
      <button disabled class="search-placeholder">⌕ 搜索商品 · 未开放</button>
    </view>
    <PreviewNotice message="商品为示例，暂不可购买；商城资料独立读取" />
    <view class="market-banner">
      <view class="eyebrow">把喜欢带回家</view>
      <view class="banner-title">每日好物，认真挑选</view>
      <view>新鲜食材与日常小物 · 示例专题</view>
    </view>
    <view class="store-row">
      <view>
        <view class="section-title">{{ storefront?.displayName ?? '线上商城' }}</view>
        <view v-if="storefrontState === 'loading'" class="muted">正在读取商城资料…</view>
        <view v-else-if="storefrontState === 'error'" class="muted">商城资料暂未连接，以下仍为示例商品</view>
        <view v-else class="muted">{{ storefront?.configured ? '线上销售范围，不代表实体门店' : '商城名称尚未设置' }}</view>
      </view>
      <button v-if="storefrontState === 'error'" class="soft-button" @click="loadStorefront">重试资料</button>
    </view>
    <view class="mode-hint">快递 / 同城配送 / 自提规则保留，尚未开通 · 暂不支持下单</view>
    <PreviewStates :state="state" @change="changeState" />
    <view class="catalog-layout">
      <scroll-view scroll-y class="category-scroll">
        <button v-for="item in categories" :key="item" :class="['category-button', { active: category === item }]" @click="category = item">{{ item }}</button>
      </scroll-view>
      <scroll-view scroll-y class="catalog-scroll">
        <view class="catalog-title">{{ category }}<text class="muted"> / 示例</text>
        </view>
        <PageState :state="state" @retry="retry" />
        <view v-if="state === 'ready'">
          <ProductCard v-for="product in visibleProducts" :key="product.id" :product="product" />
        </view>
      </scroll-view>
    </view>
    <view class="cart-preview">
      <view>
        <view>购物车尚未开放</view>
        <view class="cart-note">示例商品暂不可购买</view>
      </view>
      <button disabled>去结算</button>
    </view>
  </view>
</template>
