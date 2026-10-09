<script setup lang="ts">
import { computed, ref } from 'vue';
import PreviewNotice from '../../components/PreviewNotice.vue';
import PageState from '../../components/PageState.vue';
import PreviewStates from '../../components/PreviewStates.vue';
import ProductCard from '../../components/ProductCard.vue';
import { categories, products } from '../../features/preview-fixtures';
import { usePreviewState } from '../../features/use-preview-state';
const category = ref('精选好物');
const mode = ref('自提');
const { state, changeState, retry } = usePreviewState();
const visibleProducts = computed(() => category.value === '精选好物' ? products : products.filter(item => item.category === category.value));
</script>
<template>
  <view class="lingyu-theme page-shell">
    <view class="market-heading">
      <text class="page-title">市集</text>
      <button disabled class="search-placeholder">⌕ 搜索商品 · 未开放</button>
    </view>
    <PreviewNotice />
    <view class="market-banner">
      <view class="eyebrow">把喜欢带回家</view>
      <view class="banner-title">每日好物，认真挑选</view>
      <view>新鲜食材与日常小物 · 示例专题</view>
    </view>
    <view class="store-row">
      <view>
        <view class="section-title">灵域生活馆 · 示例店铺</view>
        <view class="muted">营业与服务范围待接入</view>
      </view>
      <view class="mode-switch">
        <button v-for="item in ['自提', '配送']" :key="item" :class="{ active: mode === item }" @click="mode = item">{{ item }}</button>
      </view>
    </view>
    <view class="mode-hint">{{ mode }}模式预览 · 地址、时段与费用尚未开放</view>
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
