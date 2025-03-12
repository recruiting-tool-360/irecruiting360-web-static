<template>
  <div class="MainApi">
<!--    <MainLayout></MainLayout>-->
    <router-view></router-view>
  </div>
</template>

<script setup>
import { useRoute,useRouter } from 'vue-router'
import {onMounted, onBeforeUnmount, nextTick} from "vue";
import {boosQueueManager, liePinQueueManager, zhiLianQueueManager,job51QueueManager} from "@/components/QueueManager/queueManager";
import {generateOneUniqueRandomNumber, generateOneUniqueRandomNumber2} from "@/util/RandomNum";
import {exeJobInfo} from "@/components/QueueManager/BoosJobInfoManager";
import {exeZhiLianJobInfo} from "@/components/QueueManager/ZhiLianJobInfoManager";
import {exeLIEPINJobInfo} from "@/components/QueueManager/LIEPINJobInfoManager";
import {useStore} from "vuex";
import {exeJob51Info} from "@/components/QueueManager/Job51InfoManager";

const store = useStore();
// 获取当前路由信息
const route = useRoute();
const router = useRouter();
const isMainLayoutRoute = ['home'].includes(route.name)



// 异步处理器
function bossFn(val){
  return new Promise((resolve) => {
    const runTime = generateOneUniqueRandomNumber2(3000, 5000);
    setTimeout(() => {
      exeJobInfo(val);
      resolve(); // **通知任务完成**
    }, runTime);
  });
}
function zhiLianFn(val){
  return new Promise((resolve) => {
    const runTime = generateOneUniqueRandomNumber2(3000, 5000);
    setTimeout(() => {
      exeZhiLianJobInfo(val);
      resolve(); // **通知任务完成**
    }, runTime);
  });
}
function liePinFn(val){
  return new Promise((resolve) => {
    const runTime = generateOneUniqueRandomNumber2(3000, 5000);
    setTimeout(() => {
      exeLIEPINJobInfo(val);
      resolve(); // **通知任务完成**
    }, runTime);
  });
}
function job51Fn(val){
  return new Promise((resolve) => {
    const runTime = generateOneUniqueRandomNumber2(3000, 5000);
    setTimeout(() => {
      exeJob51Info(val);
      resolve(); // **通知任务完成**
    }, runTime);
  });
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
  const runTime = generateOneUniqueRandomNumber(0,10);
  // 开始定时器
  boosQueueManager.start(runTime,bossFn);
  // 监听标签页可见性变化
  //document.addEventListener("visibilitychange", handleVisibilityChange);
});
// 在组件挂载时执行
onMounted(() => {
  const runTime = generateOneUniqueRandomNumber(0,10);
  // 开始定时器
  zhiLianQueueManager.start(runTime,zhiLianFn);
});
// 在组件挂载时执行
// onMounted(() => {
//   const runTime = generateOneUniqueRandomNumber(2000,3000);
//   // 开始定时器
//   liePinQueueManager.start(runTime,liePinFn);
// });
// 在组件挂载时执行
onMounted(() => {
  const runTime = generateOneUniqueRandomNumber(0,10);
  // 开始定时器
  job51QueueManager.start(runTime,job51Fn);
});

// 在组件卸载时执行
onBeforeUnmount(() => {
  // 停止定时器
  boosQueueManager.stop();
  zhiLianQueueManager.stop();
  liePinQueueManager.stop();
  job51QueueManager.stop();
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
