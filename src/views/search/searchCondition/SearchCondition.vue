
<template>
  <div class="SearchConditionContainer">
    <el-dialog
        v-model="centerDialogVisible"
        width="480"
        title="保存搜索条件"
        align-center
        :before-close="props.changeCloseStatus"
        :show-close="false"
        :close-on-click-modal="false"
    >
      <el-row style="border-top: 1px solid rgba(232, 232, 232, 1);border-bottom: 1px solid rgba(232, 232, 232, 1);padding: 12px 0 30px;">
        <el-col class="createOrUpdate">
          <el-radio-group v-model="radio">
            <el-radio value="Create" size="large">创建新条件</el-radio>
            <el-radio value="Update" size="large" @click="searchAllCondition">更新已有条件</el-radio>
          </el-radio-group>
        </el-col>
        <el-col class="nameInp" style="display: flex;justify-content: start;align-items: center;margin-top: 20px">
          <el-text style="margin-right: 2px;height: 40%;color: red">*</el-text>
          <el-text style="color: #1f2d3d">搜索条件名称：</el-text>
          <el-input v-if="radio==='Create'" v-model="conditionName" style="width: 276px;height: 30px;" :class="[validateFlag?'normalInput':'redInput']"  placeholder="请输入需要保存的名称" @input="changeInpVal"/>
          <el-select v-if="radio==='Update'"
              v-model="conditionSelectValue"
              placeholder="请选择搜索条件"
              style="width: 276px;height: 30px;"
          >
            <el-option
                v-for="item in conditionOptions"
                :key="item.id"
                :label="item.id"
                :value="item"
            />
          </el-select>
        </el-col>
      </el-row>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="props.changeCloseStatus">取消</el-button>
          <el-button type="primary" @click="onSubmit">确认</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import {useStore} from 'vuex';
import {onMounted,computed,ref,watch} from "vue";
import {
  addSearchConditionCollection,
  collectedConditionNameExists,
  querySearchConditionCollection,
  saveCondition, updateSearchConditionCollection
} from "@/api/search/SearchApi";
import { ElMessage } from 'element-plus'
import store from "@/store";

const props = defineProps({
  onConfirm: Function,
  changeCloseStatus: Function,
  context: {
    type:String,
    default: () => "请确认操作"
  },
  dialogVisible: {
    type:Boolean,
    default: () => false
  },
  confirmBtmName:{
    type:String,
    default: () => "确认"
  },
  closeBtmName:{
    type:String,
    default: () => "取消"
  },
  onConditionRequest:Function
});
//单选值
const radio = ref('Create');

//显示开关
const centerDialogVisible = computed(()=>props.dialogVisible);
//搜索条件id
// const conditionId = ref(null);
const searchConditionId = computed(() => store.getters.getSearchConditionId);
//搜索条件名称
const conditionName = ref("");
//校验框
const validateFlag=ref(true);
//下拉框值
const conditionSelectValue = ref(null);
//搜索结果
const conditionOptions = ref([]);

//加载所有搜索条件
const searchAllCondition = async () => {
  try {
    let {data} = await querySearchConditionCollection(1);
    conditionOptions.value =data;
  } catch (e) {
    console.log(e)
    ElMessage.error('后台服务异常，请联系管理员！');
    conditionOptions.value = [];
  }
}
//确认按钮
const onSubmit = async () => {
  let flag = false;
  if (radio.value === 'Create') {
    flag = await createCondition();
  }
  if (radio.value === 'Update') {
    flag = await updateCondition();
  }
  if(props.onConfirm&&flag){
    props.onConfirm();
  }
  if(props.changeCloseStatus&&flag){
    props.changeCloseStatus();
  }
  if(flag){
    conditionName.value ="";
    conditionSelectValue.value = null;
  }
}
//搜索条件名称校验
const changeInpVal = async (val) => {
  try {
    let {data} = await collectedConditionNameExists(searchConditionId.value, val);
    validateFlag.value = !data;
  } catch (e) {
    validateFlag.value = false;
    ElMessage.error('后台服务异常，请联系管理员！');
  }
}

//保存搜索条件
const createCondition = async () => {
  if (radio.value === 'Create') {
    if (searchConditionId.value) {
      if(!validateFlag.value||(!conditionName.value)){
        ElMessage.warning('存储名称校验没有通过，请再试试');
        return false;
      }
      try {
        let {data} = await addSearchConditionCollection(searchConditionId.value, conditionName.value);
        ElMessage.success('保存成功!');
        await store.dispatch("findSearchCondition",1); // 执行任务
        return true;
      }catch (e){
        ElMessage.error('后台服务异常，请联系管理员！');
        return false;
      }
    }else{
      ElMessage.warning('系统没有监测到搜索条件，请确定搜索条件！');
      return false;
    }
  }
}

//保存搜索条件
const updateCondition = async () => {
  if (searchConditionId.value) {
    console.log(conditionSelectValue.value)
    if(!conditionSelectValue.value){
      ElMessage.warning('请选择需要修改的目标搜索条件！');
      return false;
    }
    try {
      let {data} = await updateSearchConditionCollection(1, "nunu",conditionSelectValue.value.id);
      ElMessage.success('修改成功!');
      await store.dispatch("findSearchCondition",1); // 执行任务
      return true;
    }catch (e){
      ElMessage.error('后台服务异常，请联系管理员！');
      return false;
    }
  }else{
    ElMessage.warning('系统没有监测到原搜索条件，请确定搜索条件！');
    return false;
  }
}




// centerDialogVisible
// watch(() => centerDialogVisible.value, async (newValue) => {
//   if (newValue === true) {
//     let request = props.onConditionRequest();
//     let searchRequestData;
//     try {
//       const {data} = await saveCondition(request);
//       conditionId.value = data.id;
//     } catch (e) {
//       console.log(e);
//       ElMessage.error('后台服务异常，请联系管理员！');
//       conditionId.value=null;
//     }
//   }
// });

</script>

<style scoped lang="scss">

.normalInput{
  --el-input-focus-border:#c0c4cc;
  --el-input-focus-border-color:#c0c4cc
}
.redInput{
  --el-input-focus-border: #ff244a;
  --el-input-focus-border-color:#ff244a;
  --el-input-border-color:#ff244a;
  --el-input-hover-border-color:#ff244a;
}

</style>