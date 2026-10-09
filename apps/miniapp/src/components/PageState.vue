<script setup lang="ts">
defineProps<{ state: 'ready' | 'loading' | 'empty' | 'error' }>();
defineEmits<{ retry: [] }>();
</script>
<template>
  <view v-if="state !== 'ready'" class="page-state" role="status">
    <view class="state-symbol">{{ state === 'loading' ? '○' : state === 'empty' ? '◇' : '!' }}</view>
    <view class="section-title">{{ state === 'loading' ? '正在加载' : state === 'empty' ? '这里还没有内容' : '暂时无法加载' }}</view>
    <view class="muted">{{ state === 'loading' ? '请稍候' : state === 'empty' ? '换个分类看看吧' : '请稍后再试' }}</view>
    <button v-if="state === 'error'" class="soft-button" @click="$emit('retry')">重试预览</button>
  </view>
</template>
