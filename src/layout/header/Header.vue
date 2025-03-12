<template>
  <div class="header-container">
    <el-row class="big-el-row" justify="center">
      <el-col :span="12">
        <el-row class="small-el-row-lf" justify="start" align="middle">
            <el-col :span="2" class="el-avatar-big" style="min-width: 60px;">
              <el-image class="el-image" :src="'/logo/logo.svg'" :fit="'contain'"/>
            </el-col>
            <el-col :span="4" style="min-width: 60px;">
              <el-text class="title" size="default">i 快招</el-text>
            </el-col>
        </el-row>
      </el-col>
      <el-col :span="12">
        <el-row class="small-el-row-rg" justify="end" align="middle">
            <el-col class="col-operation-guide" :span="8">
<!--              <el-tooltip-->
<!--                  class="box-item"-->
<!--                  effect="dark"-->
<!--                  content="测试数据开关"-->
<!--                  placement="bottom"-->
<!--              >-->
<!--                <el-switch-->
<!--                    v-model="testSwitch"-->
<!--                    class="ml-2"-->
<!--                    style="&#45;&#45;el-switch-on-color: #13ce66;"-->
<!--                    @click="handleSwitchChange"-->
<!--                />-->
<!--              </el-tooltip>-->
              <div style="height: 100%;display: flex;align-items: center">
                <el-tooltip
                    class="box-item"
                    effect="dark"
                    content="下载插件"
                    placement="bottom"
                >
                  <el-image class="headerIcons" :src="'/index/header/icons/a1.svg'" style="width: 16px;height: 16px" @click="navigateToGuide('guide')"></el-image>
                </el-tooltip>
              </div>
              <div style="height: 100%;display: flex;align-items: center">
                <el-tooltip
                    class="box-item"
                    effect="dark"
                    content="操作指南"
                    placement="bottom"
                >
                  <el-image class="headerIcons" :src="'/index/header/icons/wenhao.svg'" @click="navigateToYuQue" style="width: 18px;height: 18px"></el-image>
                </el-tooltip>
              </div>
              <!--       联系我们       -->
              <div style="height: 100%;display: flex;align-items: center">
                <el-popover placement="bottom" trigger="hover" popper-style="--el-popover-padding: 0">
                  <template #reference>
                    <el-icon class="headerIcons" size="18px" color="white"><Service /></el-icon>
                  </template>
                  <el-row style="padding: 12px;background-color: rgb(31 124 255)">
                    <el-text style="color: white;font-weight: bold;margin-bottom: 5px;width: 100%;text-align: center">联系我们</el-text>
                    <el-image class="headerIcons" :src="'/index/header/top/vChat.png'" ></el-image>
                  </el-row>
                </el-popover>
              </div>
              <!--     用户信息         -->

              <div style="height: 100%;display: flex;align-items: center;">
                <el-popover 
                  placement="bottom" 
                  trigger="hover" 
                  :width="220"
                  popper-class="user-popover"
                  popper-style="--el-popover-padding: 0; border-radius: 8px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);"
                >
                  <template #reference>
                    <div class="avatar-container">
                      <el-avatar 
                        :size="32" 
                        :src="userInfo?.avatar || ''" 
                        class="user-avatar"
                      >
                        <!-- 如果没有头像，显示用户名首字母或默认图标 -->
                        <el-icon v-if="!userInfo?.avatar"><Avatar /></el-icon>
                        <span v-else-if="userInfo?.username">{{ userInfo.username.charAt(0).toUpperCase() }}</span>
                      </el-avatar>
                      <div class="avatar-indicator"></div>
                    </div>
                  </template>
                  
                  <!-- 弹出菜单内容 -->
                  <div class="user-popover-content">
                    <!-- 顶部区域：头像和用户名 -->
                    <div class="popover-header">
                      <el-avatar 
                        :size="50" 
                        :src="userInfo?.avatar || ''"
                        class="popover-avatar"
                      >
                        <el-icon v-if="!userInfo?.avatar"><Avatar /></el-icon>
                        <span v-else-if="userInfo?.username">{{ userInfo.username.charAt(0).toUpperCase() }}</span>
                      </el-avatar>
                      <div class="user-info">
                        <div class="username">{{ userInfo?.username || '未登录' }}</div>
                        <div class="user-role">{{ userInfo?.role || '普通用户' }}</div>
                      </div>
                    </div>
                    
                    <!-- 底部区域：操作按钮 -->
                    <div class="popover-footer">
                      <el-button 
                        @click="logout" 
                        class="logout-button" 
                        type="default"
                      >
                        <el-icon><SwitchButton /></el-icon>
                        <span>退出登录</span>
                      </el-button>
                    </div>
                  </div>
                </el-popover>
              </div>

            </el-col>
        </el-row>
      </el-col>
    </el-row>
  </div>

</template>

<script setup>
import {useStore} from 'vuex';
import {ref, onMounted, nextTick, computed} from "vue";
import {Service, SwitchButton, Avatar} from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import {ElButton, ElMessage} from "element-plus";
import {getDownloadUrl, userlogout} from "@/api/user/UserApi";
import Cookies from "js-cookie";
import CryptoJS from 'crypto-js';
import {getChatIdByUserId} from "@/api/chat/ChatApi";

// 获取路由实例
const router = useRouter()
const store = useStore();
const testSwitch = ref(store.getters.getTestSwitch);
const userInfo = computed(() => store.getters.getUserInfo);
// 控制弹窗显示状态
const popoverVisible = ref(false);

// 跳转函数
const navigateToGuide = (route) => {
  router.push({ name: route }) // 跳转到路由名为 guide 的路由
}

const navigateToYuQue = (route) => {
  const url = "https://ihr360.yuque.com/ihr360/tla84c/pb6p7077n9y6bngn";
  window.open(url, '_blank');
}

// 点击下载按钮的功能
// const downloadZip = () => {
//   // 使用已保存在Vuex中的下载地址
//   const url = store.getters.getDownloadUrl;
//   if (url) {
//     window.open(url, '_blank');
//   } else {
//     ElMessage.warning('下载地址无效，请稍后再试');
//   }
// }

// 获取下载URL并保存到Vuex
const fetchDownloadUrl = async () => {
  try {
    const {data} = await getDownloadUrl();
    if (data) {
      store.commit('setDownloadUrl', data);
    }
  } catch (error) {
    console.error('获取下载地址失败:', error);
  }
}

onMounted(async () => {
  // 在组件加载时获取下载地址
  await fetchDownloadUrl();
})

const logout = async () => {
  Cookies.remove('satoken', {path: '/'});
  try {
    await userlogout();
    store.commit('changeUserInfo', null);
    store.commit('clearSearchConditionId');
  } catch (e) {
    console.log(e)
  }
  window.location.href = '/login';
}
</script>

<style scoped lang="scss">
.header-container{
  height: 100%;
  display: flex;
  flex-wrap: wrap;
  align-content: center;

  .el-row{
    height: 100%;
    width: 100%;
    .el-avatar-big{
      margin-left: 1rem;
      cursor: pointer;

      .el-image{
        font-size: 1.1rem;
      }
    }
    .title{
      padding-left: 1rem;
      font-size: 1.1rem;
      color: white;
      cursor: pointer;
    }
    .el-col{
      height: 100%;
      display: flex;
      align-content: center;
      align-items: center;
    }
    .col-operation-guide{
      justify-content: right;
      padding-right: 0.8rem;

      .headerIcons{
        margin-left: 14px;
        cursor: pointer;
      }
      .el-popover-div {
        position: absolute;
        top:25px;
        right: 0;
        width: 140px;
        height: 90px;
        background-color: transparent;
        z-index: 100;

        .trigon{
          position: absolute;
          top:0;
          right: 8px;
          border:5px solid white;
          border-top-color: transparent;
          border-right-color: transparent;
          border-left-color: transparent;
        }
        .el-popover-content{
          position: absolute;
          top:10px;
          width: 100%;
          height: 100%;
          padding: 8px;
          border-radius: 5%;
          background-color: #1F7CFF;
          z-index: 200;
        }
      }
    }
  }
}

/* 头像容器样式 */
.avatar-container {
  position: relative;
  cursor: pointer;
  padding: 4px;
  margin-left: 16px;
  border-radius: 50%;
  transition: all 0.3s;
  
  &:hover {
    background-color: rgba(255, 255, 255, 0.1);
    
    .avatar-indicator {
      opacity: 1;
    }
  }
}

/* 头像样式 */
.user-avatar {
  border: 2px solid rgba(255, 255, 255, 0.7);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  background: linear-gradient(135deg, #8777FF, #54A4FF);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}

/* 头像指示器（小点） */
.avatar-indicator {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 8px;
  height: 8px;
  background-color: #67C23A;
  border-radius: 50%;
  border: 2px solid #1F7CFF;
  opacity: 0.8;
  transition: opacity 0.3s;
}

/* 弹出框样式 */
:deep(.user-popover) {
  padding: 0;
  overflow: hidden;
}

.user-popover-content {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.popover-header {
  padding: 16px;
  background: linear-gradient(135deg, #5280FC, #54A4FF);
  display: flex;
  align-items: center;
  color: white;
}

.popover-avatar {
  border: 2px solid white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  background: white;
  color: #5280FC;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}

.user-info {
  margin-left: 12px;
}

.username {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 4px;
}

.user-role {
  font-size: 12px;
  opacity: 0.8;
}

.popover-footer {
  padding: 12px 16px;
  border-top: 1px solid #eee;
  display: flex;
  justify-content: center;
}

.logout-button {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;
  
  .el-icon {
    margin-right: 4px;
  }
  
  &:hover {
    color: #F56C6C;
    background-color: rgba(245, 108, 108, 0.1);
  }
}
</style>