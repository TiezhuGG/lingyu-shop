<script setup lang="ts">
import type { PreviewState } from '../features/use-preview-state';
defineProps<{ state: PreviewState }>();
defineEmits<{ change: [state: PreviewState] }>();
const states: PreviewState[] = ['ready', 'loading', 'empty', 'error'];
const labels = { ready: '内容', loading: '加载', empty: '空白', error: '错误' };
const development = import.meta.env.DEV;
</script>
<template>
  <view v-if="development" class="preview-controls">
    <text>状态预览</text>
    <button v-for="item in states" :key="item" :class="{ selected: state === item }" @click="$emit('change', item)">{{ labels[item] }}</button>
  </view>
</template>
