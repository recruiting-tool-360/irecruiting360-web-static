<template>
  <div class="left-header-container">
    <!--  收缩按钮  -->
    <el-button class="left-shrink-btm" @click="toggleShrink" :icon="isShrunk?DArrowRight:DArrowLeft" link></el-button>
    <!--  搜索条件列表  -->
    <el-row class="el-row-search hidden-content" justify="center" v-if="!isShrunk" :style={width:leftSize}>
      <el-col class="el-col-search" :span="24">
        <div>保存的搜索条件(0)</div>
      </el-col>
      <el-col class="el-col-search" :span="24">
        <el-input
            v-model="searchInp"
            style="width: 240px"
            placeholder="通过关键字检索已保存搜索条件"
            @input="findSearchConditionListByKey"
            :suffix-icon="Search"
        />
      </el-col>
    </el-row>
    <el-row style="overflow: auto;height: 77vh;align-content: flex-start" v-if="!isShrunk" :style={width:leftSize} v-loading="loadingStatus">
      <div class="condition-div" v-for="(condition) in searchConditionList" :key="condition.id">
        <el-row style="height: 100%">
          <el-col :span="5" @click="clickCondition(condition)">
            <div style="height:100%;display: flex;justify-content: center;align-items: center;margin-left: 8px;margin-right: 4px">
              <el-image :src="'/index/left/condition.svg'"></el-image>
            </div>
          </el-col>
          <el-col :span="16" style="display:flex;justify-content: start;align-items: center;flex-wrap: wrap" @click="clickCondition(condition)">
            <div style="width: 100%"><span>{{condition.collectedName}}</span></div>
            <div style="width: 100%"><el-text type="info">{{condition.collectedTime}}</el-text></div>
          </el-col>
          <el-col class="deleteSearchConditionElCol" :span="3" style="display:flex;justify-content: space-around;align-items: center">
            <el-button link :icon="CircleClose" @click="deleteSearchConditionFlag=true;defaultRow=condition"></el-button>
          </el-col>
        </el-row>
      </div>
    </el-row>
    <!--  删除搜索条件  -->
    <DialogTemplate v-model:dialogVisible="deleteSearchConditionFlag" :change-close-status="()=>deleteSearchConditionFlag=false" :on-confirm="deleteSearchCondition" :context="'确认删除搜索条件!'"></DialogTemplate>
  </div>

</template>

<script setup>
import {ref,computed,onMounted} from "vue";
import Aicon from "@/components/Aicon/index.vue";
import { Search,CircleClose } from '@element-plus/icons-vue'
import router from "@/router";
import { defineEmits } from 'vue';
import { DArrowLeft,DArrowRight } from '@element-plus/icons-vue'
import store from "@/store";
import DialogTemplate from "@/components/dialog/DialogTemplate.vue";
import {
  addSearchConditionCollection,
  cancelSearchConditionCollection,
  querySearchConditionCollection
} from "@/api/search/SearchApi";
import {ElMessage} from "element-plus";
import _ from "lodash";
import {pluginBossResultProcessor} from "@/components/verifyes/PluginProcessor";
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
const loadingStatus = computed(()=>store.getters.getLeftLoadingSwitch);
//删除搜索条件
const deleteSearchConditionFlag = ref(false);
//被选择的数据
const defaultRow=ref(null);

onMounted(async ()=>{
  try {
    setTimeout(async () => {
      // loadingStatus.value = true;
      await store.dispatch("findSearchCondition",1); // 执行任务
      // loadingStatus.value = false;
    }, 2000);
  }catch (e){
    console.log(e)
    // loadingStatus.value = false;
  }
});

//查询搜索条件
const findSearchConditionListByKey = _.debounce(async (value) => {
  store.commit("changeLeftLoadingSwitch", true);
  try {
    let {data} = await querySearchConditionCollection(1,value);
    if (data) {
      store.commit('setSearchConditionList',data);
    }else{
      store.commit('setSearchConditionList',[]);
    }
  } catch (e) {
    console.log(e)
    ElMessage.error('服务异常,请联系管理员');
    store.commit("changeLeftLoadingSwitch", false);
  }
  store.commit("changeLeftLoadingSwitch", false);
}, 500);

//删除搜索条件
const deleteSearchCondition = async () => {
  try {
    let {data} = await cancelSearchConditionCollection(defaultRow.value.id);
    ElMessage.success('操作成功!');
    await store.dispatch("findSearchCondition", 1); // 执行任务
    deleteSearchConditionFlag.value=false;
  } catch (e) {
    ElMessage.error('后台服务异常，请联系管理员！');
  }
}

//点击列表
const clickCondition =(condition) => {
  store.commit('changeSearchConditionRequestData',condition);
}


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

  .el-row-search{
    padding: 0.5rem 1rem 0 1rem;

    .el-col-search{
      margin: 0.5rem 0;
    }
  }


  .condition-div{
    margin: 8px 1rem 0 1rem;
    width: 246px;
    height: 63px;
    opacity: 1;
    border-radius: 6px;
    background: white;
    border: 1px solid rgba(47, 112, 250, 0.3);
    font-size: 13px;
    font-weight: 400;
    color: rgba(31, 35, 41, 1);

    :hover{
      background: rgba(250, 250, 250, 1);
      cursor: pointer;
      color: rgba(31, 124, 255, 1);
    }

    .deleteSearchConditionElCol:hover{
      background-color: rgba(255, 232, 232, 1);
      :hover{
        background-color: rgba(255, 232, 232, 1);
      }
    }

  }

}

</style>