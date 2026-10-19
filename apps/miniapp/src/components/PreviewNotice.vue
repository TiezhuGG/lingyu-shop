<script setup lang="ts">
withDefaults(defineProps<{ message?: string }>(), { message: '界面预览 · 示例内容，暂未连接服务' });
</script>
<template>
  <view class="preview-notice">{{ message }}</view>
</template>
