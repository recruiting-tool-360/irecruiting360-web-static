<template>
  <div class="header-container">
    <el-row class="big-el-row" justify="center">
      <el-col :span="12">
        <el-row class="small-el-row-lf" justify="start" align="middle">
            <el-col :span="2" class="el-avatar-big">
              <el-image class="el-image" :src="'/logo/ikuaizhaologo.jpg'" :fit="'contain'"/>
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
              <el-image class="headerIcons" :src="'/index/header/icons/a1.svg'"></el-image>
              <el-image class="headerIcons" :src="'/index/header/icons/wenhao.svg'"></el-image>
              <el-avatar class="headerIcons" :size="30" :src="'/index/header/icons/user.png'" />


            </el-col>
        </el-row>
      </el-col>
    </el-row>
  </div>

</template>

<script setup>
import { useStore } from 'vuex';
import {ref} from "vue";
const store = useStore();
const testSwitch = ref(store.getters.getTestSwitch);
// 处理 switch 切换事件
const handleSwitchChange = () => {
  store.commit('changeTestSwitch');
};
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
        margin-left: 20px;
        cursor: pointer;
      }
    }
  }
}
</style>