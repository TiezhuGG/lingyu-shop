<script setup lang="ts">
import PreviewNotice from '../../components/PreviewNotice.vue';
import PageState from '../../components/PageState.vue';
import PreviewStates from '../../components/PreviewStates.vue';
import { usePreviewState } from '../../features/use-preview-state';
const { state, changeState, retry } = usePreviewState();
const services = ['收货地址', '意见反馈', '协议与隐私', '品牌故事', '物流查询'];
</script>
<template>
  <view class="lingyu-theme page-shell">
    <PreviewNotice />
    <PreviewStates :state="state" @change="changeState" />
    <scroll-view scroll-y class="page-scroll">
      <PageState :state="state" @retry="retry" />
      <view v-if="state === 'ready'" class="mine-content">
        <view class="profile-card">
          <view class="profile-row">
            <view class="avatar">灵</view>
            <view>
              <view class="page-title">你好，欢迎来到灵域</view>
              <view class="muted">登录后查看你的资料与权益</view>
            </view>
          </view>
          <button disabled class="login-button">登录 · 尚未开放</button>
          <view class="member-placeholder">会员等级与成长记录待接入</view>
        </view>
        <view class="assets card">
          <view>
            <text class="asset-value">—</text>
            <text>优惠券</text>
            <text class="muted">待接入</text>
          </view>
          <view>
            <text class="asset-value">—</text>
            <text>成长值</text>
            <text class="muted">待接入</text>
          </view>
          <view>
            <text class="asset-value asset-label">未开通</text>
            <text>余额</text>
            <text class="muted">暂无钱包服务</text>
          </view>
        </view>
        <view class="card order-card">
          <view class="section-title">我的订单<text class="muted">尚未开放</text>
          </view>
          <view class="order-grid">
            <button v-for="item in ['待付款', '待收货', '已完成', '售后']" :key="item" disabled>
              <text class="order-symbol">◇</text>{{ item }}</button>
          </view>
        </view>
        <view class="card service-card">
          <view class="section-title">生活服务</view>
          <button v-for="item in services" :key="item" disabled class="service-row">
            <text>{{ item }}</text>
            <text class="muted">尚未开放 ›</text>
          </button>
        </view>
        <view class="bottom-hint">期待与你一起，把生活过得更好</view>
      </view>
    </scroll-view>
  </view>
</template>
