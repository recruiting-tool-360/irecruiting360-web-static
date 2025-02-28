<template>
  <div class="common-layout">
    <el-container class="el-container">
      <el-header class="el-header">
        <Header></Header>
      </el-header>
      <el-container class="el-container-main">
        <el-aside class="el-aside-main" :style="{ overflow:'hidden',width: isShrunk ? '42px' : leftSize, transition: 'width 0.3s ease' }">
          <LeftHeader 
            :isShrunk="isShrunk" 
            :left-size="leftSize" 
            :ai-search-ref="aiSearchRef"
            @toggleShrink="toggleShrink"
            @openChat="handleOpenChat"
          ></LeftHeader>
        </el-aside>
        <el-main class="el-main" style="background-color: #ffffff">
          <AISearch ref="aiSearchRef"></AISearch>
        </el-main>
      </el-container>
    </el-container>
  </div>
</template>

<script setup>
import { ref } from "vue";
import Header from "@/layout/header/Header.vue";
import LeftHeader from "@/layout/header/LeftHeader3.vue";
import AISearch from "@/views/search/AISearch.vue"
import { onMounted } from 'vue';

// 创建 AISearch 组件的 ref
const aiSearchRef = ref(null);

//收缩按钮开关
const isShrunk = ref(true);
const leftSize = ref("280px");

// 切换宽度逻辑
const toggleShrink = () => {
  isShrunk.value = !isShrunk.value;
};

// 处理打开聊天
const handleOpenChat = (chatInfo) => {
  if (aiSearchRef.value) {
    aiSearchRef.value.openChat(chatInfo?.chatId || '')
  }
}

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