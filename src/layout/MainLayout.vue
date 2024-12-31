
<template>
  <div class="common-layout">
    <el-container class="el-container">
      <el-header class="el-header">
        <Header></Header>
      </el-header>
      <el-container class="el-container-main">
        <el-aside class="el-aside-main" :style="{ overflow:'hidden',width: isShrunk ? '42px' : leftSize, transition: 'width 0.3s ease' }">
          <LeftHeader2 :isShrunk="isShrunk" :left-size="leftSize" @toggleShrink="toggleShrink"></LeftHeader2>
        </el-aside>
        <el-main class="el-main" style="background-color: #ffffff">
          <AISearch></AISearch>
        </el-main>
      </el-container>
    </el-container>
  </div>
</template>

<script setup>
import {ref} from "vue";
import Header from "@/layout/header/Header.vue";
import LeftHeader2 from "@/layout/header/LeftHeader2.vue";
import AISearch from "@/views/search/AISearch.vue"
import { onMounted } from 'vue';
//收缩按钮开关
const isShrunk = ref(true); // 控制宽度收缩
const leftSize = ref("280px");
// 切换宽度逻辑
const toggleShrink = () => {
  isShrunk.value = !isShrunk.value;
};
// 页面加载完成时触发
onMounted(() => {
  window.addEventListener('load', () => {
    isShrunk.value = false;
  });
});

</script>

<style scoped lang="scss">
.common-layout{
  height: 100%;
  .el-container{
    height: 100%;
    overflow: hidden;
  }
  .el-header{
    height: 44px;
    padding: 0;
    background-color: rgba(31, 124, 255, 1)
  }
  .el-aside-main{
    //padding: 8px 0 0 0;
    height: 100%;
    background-color: white;
    //width: 17rem;
  }

  .el-main{
    padding: 0;
    margin: 8px 0 0 8px;
    height: 100%;
  }
}

</style>