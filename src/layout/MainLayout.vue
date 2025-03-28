<template>
  <div class="common-layout">
    <el-container class="el-container">
      <el-header class="el-header">
        <Header></Header>
      </el-header>
      <el-container class="el-container-main">
        <el-aside class="el-aside-main" :style="{ overflow:'hidden',width: isShrunk ? '42px' : leftSize, transition: 'width 0.3s ease' }">
          <LeftHeader ref="leftHeaderRef"
            :isShrunk="isShrunk" 
            :left-size="leftSize" 
            :ai-search-ref="aiSearchRef"
            @toggleShrink="toggleShrink"
            @openChat="handleOpenChat"
            @onChatEdit="handleOnChatEdit"
            @chatOnSearch="chatOnSearch"
            @onSearchClearData="handleOnSearchClearData"
          ></LeftHeader>
        </el-aside>
        <el-main class="el-main" style="background-color: #ffffff">
          <AISearch ref="aiSearchRef"></AISearch>
        </el-main>
      </el-container>
    </el-container>
    
    <!-- 无UI的SSE管理组件 -->
    <SseManager ref="sseManagerRef"></SseManager>
  </div>
</template>

<script setup>
import { ref, nextTick, onMounted } from "vue";
import Header from "@/layout/header/Header.vue";
import LeftHeader from "@/layout/header/LeftHeader3.vue";
import AISearch from "@/views/search/AISearch.vue"
import SseManager from "@/components/sse/SseManager.vue";
import {useStore} from "vuex";

const store = useStore();
// SSE管理器引用
const sseManagerRef = ref(null);

// 创建 AISearch 组件的 ref
const aiSearchRef = ref(null);

const leftHeaderRef = ref(null);

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

//聊天框内点击编辑
const handleOnChatEdit = (data) => {
  aiSearchRef.value.replaceSearchConditionRequest(data);
}

//
const handleOnSearchClearData = () => {
  aiSearchRef.value.clearALlChannelDataAndCondition();
}

//聊天框内点击搜索
const chatOnSearch = (data,searchSwitch) => {
  aiSearchRef.value.replaceSearchConditionRequest(data,searchSwitch);
}

// 页面加载完成时触发
onMounted(() => {
  //初始化ref
  store.commit('changeAiSearchRef', aiSearchRef.value);

  // 移除对window.load事件的依赖，直接在onMounted中展开侧边栏
  isShrunk.value = false;
  
  // 使用nextTick确保DOM更新后再调用handleNewChat
  nextTick(() => {
    if (leftHeaderRef.value) {
      leftHeaderRef.value.handleNewChat();
    }
  });
  
  // 保留window.load事件作为备份方案
  window.addEventListener('load', () => {
    isShrunk.value = false;
    if (leftHeaderRef.value) {
      leftHeaderRef.value.handleNewChat();
    }
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