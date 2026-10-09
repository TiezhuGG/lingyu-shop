<script setup lang="ts">
import { computed, ref } from 'vue';
import PreviewNotice from '../../components/PreviewNotice.vue';
import PageState from '../../components/PageState.vue';
import PreviewStates from '../../components/PreviewStates.vue';
import ContentCard from '../../components/ContentCard.vue';
import { topics, stories } from '../../features/preview-fixtures';
import { usePreviewState } from '../../features/use-preview-state';
const topic = ref('推荐');
const { state, changeState, retry } = usePreviewState();
const visibleStories = computed(() => topic.value === '推荐' ? stories : stories.filter(item => item.topic === topic.value));
const displayedState = computed(() => state.value === 'ready' && !visibleStories.value.length ? 'empty' : state.value);
</script>
<template>
  <view class="lingyu-theme page-shell">
    <view class="page-heading">
      <view>
        <view class="eyebrow">LINGYU / 灵域</view>
        <view class="page-title">发现生活的美好</view>
      </view>
      <button disabled class="publish-button" aria-label="发布尚未开放">＋</button>
    </view>
    <PreviewNotice />
    <view class="topic-row">
      <button v-for="item in topics" :key="item" :class="['topic-button', { active: topic === item }]" @click="topic = item">{{ item }}</button>
    </view>
    <PreviewStates :state="state" @change="changeState" />
    <scroll-view scroll-y class="page-scroll">
      <PageState :state="displayedState" @retry="retry" />
      <view v-if="displayedState === 'ready'" class="story-grid">
        <ContentCard v-for="story in visibleStories" :key="story.id" :story="story" />
      </view>
      <view class="bottom-hint">图文详情、关注与发布尚未开放</view>
    </scroll-view>
  </view>
</template>
