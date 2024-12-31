<template>
  <div class="left-header-container">
    <!--  收缩按钮  -->
    <el-button class="left-shrink-btm" @click="toggleShrink" :icon="isShrunk?DArrowRight:DArrowLeft" link></el-button>
    <!--  搜索条件列表  -->
    <el-row class="el-row hidden-content" justify="center" v-if="!isShrunk" :style={width:leftSize}>
      <el-col class="el-col" :span="24">
        <div>保存的搜索条件(0)</div>
      </el-col>
      <el-col class="el-col" :span="24">
        <el-input
            v-model="searchInp"
            style="width: 240px"
            placeholder="通过关键字检索已保存搜索条件"
            :suffix-icon="Search"
        />
      </el-col>
    </el-row>
    <el-row style="overflow: auto;height: 77vh;" v-loading="lodingStatis">
      <div class="condition-div" v-for="condition in searchConditionList" :key="condition.id">
        {{condition.id}}
      </div>
    </el-row>
  </div>

</template>

<script setup>
import {ref,computed,onMounted} from "vue";
import Aicon from "@/components/Aicon/index.vue";
import { Search } from '@element-plus/icons-vue'
import router from "@/router";
import { defineEmits } from 'vue';
import { DArrowLeft,DArrowRight } from '@element-plus/icons-vue'
import store from "@/store";
//参数
const props = defineProps({
  isShrunk: Boolean, // 接收父组件传递的收缩状态
  leftSize:String //父容器宽度
});
// 定义事件
const emit = defineEmits(['toggleShrink']);
//搜索
const searchInp = ref("");
//数据
const searchConditionList = computed(()=>store.getters.getSearchConditionList);
const lodingStatis = ref(false);

onMounted(async ()=>{
  lodingStatis.value = true;
  try {
    await store.dispatch("findSearchCondition",1); // 执行任务
  }catch (e){
    console.log(e)
  }
  lodingStatis.value = false;
});


// 向父组件发射收缩事件
const toggleShrink = () => {
  emit('toggleShrink');
};


const myHerf = (menuConfig) => {
  router.push(menuConfig.path?menuConfig.path:"/")
}

</script>

<style scoped lang="scss">

.left-header-container{

  position: relative;

  .left-shrink-btm{
    position: absolute;
    right: 5px;
    top:5px;
    z-index: 1;
    width: 34px;
    height: 22px;
    background-color: white;
    color: #1F7CFF;
  }

  .el-row{
    padding: 0.5rem 1rem 0 1rem;

    .el-col{
      margin: 0.5rem 0;
    }
  }


  .condition-div{
    width: 246px;
    height: 63px;
    opacity: 1;
    border-radius: 6px;
    background: white;
    border: 1px solid rgba(47, 112, 250, 0.3);
    margin-top: 8px;

    :hover{
      background: black;
      cursor: pointer;
    }
  }

}

</style>