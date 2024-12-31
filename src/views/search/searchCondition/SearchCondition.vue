
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
            <el-radio value="Update" size="large">更新已有条件</el-radio>
          </el-radio-group>
        </el-col>
        <el-col class="nameInp" style="display: flex;justify-content: start;align-items: center;margin-top: 20px">
          <el-text style="margin-right: 2px;height: 40%;color: red">*</el-text>
          <el-text style="color: #1f2d3d">搜索条件名称：</el-text>
          <el-input v-model="conditionName" style="width: 276px;height: 30px" placeholder="请输入需要保存的名称" />
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
import {addSearchConditionCollection, saveCondition} from "@/api/search/SearchApi";
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
const conditionId = ref(null);
//搜索条件名称
const conditionName = ref("");


//确认按钮
const onSubmit = async () => {
  if (radio.value === 'Create') {
    await createCondition();
  }
  if(props.onConfirm){
    props.onConfirm();
  }
  if(props.changeCloseStatus){
    props.changeCloseStatus();
  }
  conditionName.value ="";
}


//保存搜索条件
const createCondition = async () => {
  if (radio.value === 'Create') {
    if (conditionId.value) {
      try {
        let {data} = await addSearchConditionCollection(conditionId.value, conditionName.value);
        console.log("结果集",data)
        ElMessage.success('保存成功!');
        await store.dispatch("findSearchCondition",1); // 执行任务
      }catch (e){
        console.log(e);
        ElMessage.error('后台服务异常，请联系管理员！');
      }
    }
  }
}




// centerDialogVisible
watch(() => centerDialogVisible.value, async (newValue) => {
  if (newValue === true) {
    let request = props.onConditionRequest();
    let searchRequestData;
    try {
      const {data} = await saveCondition(request);
      conditionId.value = data.id;
    } catch (e) {
      console.log(e);
      ElMessage.error('后台服务异常，请联系管理员！');
      conditionId.value=null;
    }
  }
});

</script>

<style scoped lang="scss">

</style>