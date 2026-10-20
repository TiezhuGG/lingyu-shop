<script setup lang="ts">
import { ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import type { components } from '@lingyu/contracts';
import { getPublishedText, isTextPageCode, textPageLabels } from '../../services/text-cms';
type S = components['schemas'];
const code = ref<S['CmsPageCode'] | null>(null), content = ref<S['CmsTextRevision'] | null>(null);
const state = ref<'loading' | 'ready' | 'error' | 'invalid'>('loading'), busy = ref(false);
async function load() {
  if (!code.value) { state.value = 'invalid'; return; }
  if (busy.value) return;
  busy.value = true; state.value = 'loading'; content.value = null;
  try { content.value = (await getPublishedText(code.value)).published; state.value = 'ready'; }
  catch { state.value = 'error'; } finally { busy.value = false; }
}
onLoad(query => { code.value = isTextPageCode(query?.pageCode) ? query.pageCode : null; });
onShow(load);
</script>
<template>
  <view class="lingyu-theme page-shell">
    <view class="page-heading"><text class="page-title">{{ code ? textPageLabels[code] : '内容页面' }}</text><button v-if="code" class="soft-button" :disabled="busy" @click="load">刷新内容</button></view>
    <scroll-view scroll-y class="page-scroll"><view class="content-copy">
      <view v-if="state === 'invalid'" class="page-state">不支持的内容页面</view><view v-else-if="state === 'loading'" class="page-state">正在读取公开内容…</view>
      <view v-else-if="state === 'error'" class="page-state"><text>内容暂未连接，不使用样例替代</text><button class="soft-button" @click="load">重试内容</button></view>
      <view v-else-if="!content" class="page-state"><text>暂无已发布内容</text><text class="muted">由经营方核定并发布后可阅读</text></view>
      <template v-else><view class="section-title">{{ content.title }}</view><view class="muted">发布版本 {{ content.version }} · {{ content.publishedAt.slice(0, 10) }}（UTC）</view><view class="plain">{{ content.body }}</view></template>
      <view class="bottom-hint">本页仅供阅读，不记录或代表你已同意相关条款。</view>
    </view></scroll-view>
  </view>
</template>
<style scoped>
.content-copy { padding: 20px 16px; } .section-title { font-size: 20px; line-height: 1.6; overflow-wrap: anywhere; }
.plain { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.9; margin: 24px 0; font-size: 14px; }
</style>
