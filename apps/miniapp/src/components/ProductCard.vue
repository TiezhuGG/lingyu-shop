<script setup lang="ts">
import { previewPrice, type PreviewProduct } from '../features/preview-fixtures';
defineProps<{ product: PreviewProduct }>();
</script>
<template>
  <view class="product-card">
    <view :class="['product-art', product.tone]">{{ product.art }}</view>
    <view class="product-copy">
      <view class="story-title">{{ product.name }}</view>
      <view class="muted product-detail">{{ product.detail }}</view>
      <text class="preview-tag">示例商品</text>
      <view class="price-row">
        <text class="price">¥{{ previewPrice(product.priceMinor) }}</text>
        <button disabled class="outline-button">选规格 · 未开放</button>
      </view>
    </view>
  </view>
</template>
