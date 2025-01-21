<template>
  <div class="MainApi">
<!--    <MainLayout></MainLayout>-->
    <router-view></router-view>
  </div>
</template>

<script setup>
import { useRoute } from 'vue-router'
import { onMounted, onBeforeUnmount } from "vue";
import MainLayout from "@/layout/MainLayout.vue";
import {boosQueueManager, zhiLianQueueManager} from "@/components/QueueManager/queueManager";
import {generateOneUniqueRandomNumber} from "@/util/RandomNum";
import {exeJobInfo} from "@/components/QueueManager/BoosJobInfoManager";
import {exeZhiLianJobInfo} from "@/components/QueueManager/ZhiLianJobInfoManager";
// 获取当前路由信息
const route = useRoute()
const isMainLayoutRoute = ['home'].includes(route.name)
// 异步处理器
function bossFn(val){
  exeJobInfo(val);
}
function zhiLianFn(val){
  exeZhiLianJobInfo(val);
}

// 定义标签页可见性变化的处理函数
function handleVisibilityChange() {
  if (document.visibilityState === "hidden") {
    console.log("hidden");
  } else {
    console.log("visible");
  }
}

// 在组件挂载时执行
onMounted(() => {
  const runTime = generateOneUniqueRandomNumber(2000,3000);
  console.log(runTime)
  // 开始定时器
  boosQueueManager.start(runTime,bossFn);
  // 监听标签页可见性变化
  //document.addEventListener("visibilitychange", handleVisibilityChange);
});
// 在组件挂载时执行
onMounted(() => {
  const runTime = generateOneUniqueRandomNumber(2000,3000);
  console.log(runTime)
  // 开始定时器
  zhiLianQueueManager.start(runTime,zhiLianFn);
});

// 在组件卸载时执行
onBeforeUnmount(() => {
  // 停止定时器
  boosQueueManager.stop();
  // document.removeEventListener("visibilitychange", handleVisibilityChange);
});

</script>

<style lang="scss">
.html .body {
  height: 100%;
  background-color: #f5f5f6;
  margin: 0;
  padding: 0;
}
.MainApi{
  height: 100%;
  background-color: #f5f5f6;
}
</style>
