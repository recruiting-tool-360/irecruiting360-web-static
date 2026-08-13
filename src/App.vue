<template>
  <router-view />
</template>

<script setup>
import { onMounted } from "vue";

defineOptions({
  name: "App",
});

onMounted(() => {
  // Electron 主页启动健康握手：只有 Vue 根组件及当前路由真正挂载后才通知主进程。
  // 浏览器模式没有该 bridge，保持原行为。
  try {
    window.api?.clientRecovery?.markHomeReady?.();
  } catch {
    // 主进程的启动超时监测会处理握手失败；浏览器模式无需额外动作。
  }
});
</script>
