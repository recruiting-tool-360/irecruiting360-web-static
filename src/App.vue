<template>
  <div class="MainApi">
    <MainLayout></MainLayout>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount } from "vue";
import MainLayout from "@/layout/MainLayout.vue";
import boosQueueManager from "@/components/QueueManager/queueManager";
import {generateOneUniqueRandomNumber} from "@/util/RandomNum";
import {exeJobInfo} from "@/components/QueueManager/BoosJobInfoManager";

// 异步处理器
function fn(val){
  console.log("值：",val)
  exeJobInfo(val);
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
  boosQueueManager.start(runTime,fn);
  // 监听标签页可见性变化
  //document.addEventListener("visibilitychange", handleVisibilityChange);
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
