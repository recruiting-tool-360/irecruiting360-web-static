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
                  <el-image class="headerIcons" :src="'/index/header/icons/a1.svg'" style="width: 16px;height: 16px"></el-image>
                </el-tooltip>
              </div>
              <div style="height: 100%;display: flex;align-items: center">
                <el-tooltip
                    class="box-item"
                    effect="dark"
                    content="操作指南"
                    placement="bottom"
                >
                  <el-image class="headerIcons" :src="'/index/header/icons/wenhao.svg'" @click="navigateToGuide('guide')" style="width: 18px;height: 18px"></el-image>
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
<!--                <el-avatar class="headerIcons" :src="'/index/header/icons/user.png'" style="width: 25px;height: 25px;">-->
                <el-popover placement="bottom" trigger="hover" popper-style="--el-popover-padding: 0">
                  <template #reference>
<!--                    <el-icon class="headerIcons" size="18px" color="white"><Service /></el-icon>-->
                    <img :src="'/index/header/icons/user.png'" alt="" style="margin-left:16px;width: 25px;height: 25px;">
                  </template>
                  <el-row justify="center" align="top" style="height: 100%;padding: 12px;background-color: rgb(31 124 255)">
                    <el-col :span="24" style="display: flex;align-items: center;justify-content: center;height: 30px">
                      <img :src="'/index/header/icons/user.png'" alt="" style="width: 25px;height: 25px;">
                    </el-col>
                    <el-col :span="24" style="display: flex;align-items: center;justify-content: center;height: 30px">
                      <el-text v-if="userInfo" style="color: white;font-weight: bold">{{userInfo.username}}</el-text>
                    </el-col>
                    <el-col :span="24" style="display: flex;align-items: center;justify-content: center;height: 30px">
                      <el-button :icon="SwitchButton" style="background-color: #FFFFFF;color: rgb(31 35 41 / 67%);font-size: 12px;height: 30px;width: 100px" @click="logout">退出登录</el-button>
                    </el-col>
                  </el-row>
                </el-popover>
<!--                </el-avatar>-->
<!--                <div class="headerIcons" style="display: flex;align-items: center;width: 25px;height: 25px;position: relative">-->
<!--                  <img :src="'/index/header/icons/user.png'" alt="" style="width: 25px;height: 25px;" @click="popoverVisible=!popoverVisible">-->
<!--                  &lt;!&ndash; 悬浮卡片 &ndash;&gt;-->
<!--                  <div class="el-popover-div" v-if="popoverVisible">-->
<!--                    &lt;!&ndash;        小三角形            &ndash;&gt;-->
<!--                    <div class="trigon"></div>-->
<!--                    <div class="el-popover-content">-->
<!--                      <el-row justify="center" align="top" style="height: 100%;">-->
<!--                        <el-col :span="24" style="display: flex;align-items: center;justify-content: center;height: 30px">-->
<!--                          <img :src="'/index/header/icons/user.png'" alt="" style="width: 25px;height: 25px;">-->
<!--                        </el-col>-->
<!--                        <el-col :span="24" style="display: flex;align-items: center;justify-content: center;height: 30px">-->
<!--                          <el-text v-if="userInfo" style="color: white;font-weight: bold">{{userInfo.username}}</el-text>-->
<!--                        </el-col>-->
<!--                        <el-col :span="24" style="display: flex;align-items: center;justify-content: center;height: 30px">-->
<!--                          <el-button :icon="SwitchButton" style="background-color: #FFFFFF;color: rgb(31 35 41 / 67%);font-size: 12px;height: 30px;width: 100px">退出登录</el-button>-->
<!--                        </el-col>-->
<!--                      </el-row>-->
<!--&lt;!&ndash;                      <div style="width: 100%">&ndash;&gt;-->
<!--&lt;!&ndash;                        <img :src="'/index/header/icons/user.png'" alt="" style="width: 25px;height: 25px;">&ndash;&gt;-->
<!--&lt;!&ndash;                      </div>&ndash;&gt;-->
<!--&lt;!&ndash;                      <div style="width: 100%">&ndash;&gt;-->
<!--&lt;!&ndash;                        <el-button type="info">dd</el-button>&ndash;&gt;-->
<!--&lt;!&ndash;                      </div>&ndash;&gt;-->

<!--                    </div>-->
<!--                  </div>-->
<!--                </div>-->

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
import {Service, SwitchButton} from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import {ElButton, ElMessage} from "element-plus";
import {getUserInfo, userlogout} from "@/api/user/UserApi";
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
async function userInfoInit() {
  try {
    let {data, success} = await getUserInfo();
    if (success && success === 'success') {
      store.commit('changeUserInfo', data);
      try {
        const {data:chatData}= await getChatIdByUserId(data.id);
        store.commit('changeLocalUserChatId',chatData);
      }catch (e){
        console.log(e)
        ElMessage.error('后端服务异常，请联系管理员');
      }
    } else {
      store.commit('changeUserInfo', null);
      ElMessage.error('用户信息异常，请联系管理员');
      window.location.href = '/login';
    }
  } catch (ex) {
    store.commit('changeUserInfo', null);
    ElMessage.error('用户信息异常，请联系管理员');
    console.log(ex)
    window.location.href = '/login';
  }
}

onMounted(async () => {
  await userInfoInit();
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
</style>