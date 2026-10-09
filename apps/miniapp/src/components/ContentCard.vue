<script setup lang="ts">
import type { PreviewStory } from '../features/preview-fixtures';
defineProps<{ story: PreviewStory }>();
</script>
<template>
  <view class="content-card">
    <view :class="['story-art', story.tone]">
      <text class="art-word">{{ story.art }}</text>
      <text class="art-caption">生活灵感 / 示例</text>
    </view>
    <view class="card-copy">
      <view class="story-title">{{ story.title }}</view>
      <view class="muted author">{{ story.author }}</view>
      <text class="preview-tag">{{ story.topic }} · 示例图文</text>
    </view>
  </view>
</template>
