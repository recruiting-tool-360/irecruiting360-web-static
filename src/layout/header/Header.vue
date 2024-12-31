<template>
  <div class="header-container">
    <el-row class="big-el-row" justify="center">
      <el-col :span="12">
        <el-row class="small-el-row-lf" justify="start" align="middle">
            <el-col :span="2" class="el-avatar-big">
              <el-image class="el-image" :src="'/logo/logo.svg'" :fit="'contain'"/>
            </el-col>
            <el-col :span="4">
              <el-text class="title" size="default">i 快招</el-text>
            </el-col>
        </el-row>
      </el-col>
      <el-col :span="12">
        <el-row class="small-el-row-rg" justify="end" align="middle">
            <el-col class="col-operation-guide" :span="8">
              <el-tooltip
                  class="box-item"
                  effect="dark"
                  content="测试数据开关"
                  placement="bottom"
              >
                <el-switch
                    v-model="testSwitch"
                    class="ml-2"
                    style="--el-switch-on-color: #13ce66;"
                    @click="handleSwitchChange"
                />
              </el-tooltip>
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
              <div style="height: 100%;display: flex;align-items: center;">
<!--                <el-avatar class="headerIcons" :src="'/index/header/icons/user.png'" style="width: 25px;height: 25px;">-->

<!--                </el-avatar>-->
                <div class="headerIcons" style="display: flex;align-items: center;width: 25px;height: 25px;position: relative">
                  <img :src="'/index/header/icons/user.png'" alt="" style="width: 25px;height: 25px;" @click="popoverVisible=!popoverVisible">
                  <!-- 悬浮卡片 -->
                  <div class="el-popover-div" v-if="popoverVisible">
                    <!--        小三角形            -->
                    <div class="trigon"></div>
                    <div class="el-popover-content">
                      <el-row justify="center" align="top" style="height: 100%;">
                        <el-col :span="24" style="display: flex;align-items: center;justify-content: center;height: 30px">
                          <img :src="'/index/header/icons/user.png'" alt="" style="width: 25px;height: 25px;">
                        </el-col>
                        <el-col :span="24" style="display: flex;align-items: center;justify-content: center;height: 30px">
                          <el-button :icon="SwitchButton" style="background-color: #FFFFFF;color: rgb(31 35 41 / 67%);font-size: 12px;height: 30px;width: 100px">退出登录</el-button>
                        </el-col>
                      </el-row>
<!--                      <div style="width: 100%">-->
<!--                        <img :src="'/index/header/icons/user.png'" alt="" style="width: 25px;height: 25px;">-->
<!--                      </div>-->
<!--                      <div style="width: 100%">-->
<!--                        <el-button type="info">dd</el-button>-->
<!--                      </div>-->

                    </div>
                  </div>
                </div>

              </div>


            </el-col>
        </el-row>
      </el-col>
    </el-row>
  </div>

</template>

<script setup>
import {useStore} from 'vuex';
import {ref} from "vue";
import { SwitchButton } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
// 获取路由实例
const router = useRouter()
const store = useStore();
const testSwitch = ref(store.getters.getTestSwitch);
// 处理 switch 切换事件
const handleSwitchChange = () => {
  store.commit('changeTestSwitch');
};
// 控制弹窗显示状态
const popoverVisible = ref(false);

// 跳转函数
const navigateToGuide = (route) => {
  router.push({ name: route }) // 跳转到路由名为 guide 的路由
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