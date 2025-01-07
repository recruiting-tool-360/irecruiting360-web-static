
<template>
  <div class="SearchConditionContainer">
    <el-dialog
        v-model="centerDialogVisible"
        width="480"
        title="渠道设置"
        align-center
        :before-close="props.changeCloseStatus"
        :show-close="false"
        :close-on-click-modal="false"
    >
      <el-row style="border-top: 1px solid rgba(232, 232, 232, 1);border-bottom: 1px solid rgba(232, 232, 232, 1);padding: 12px 0 30px;">
        <template v-for="(channel,index) in allChannelStatus" :key="index">
          <el-checkbox v-model="allConfig.unreadCheckBoxValue" style="height: 32px;font-size: 13px" :label="channel.name"/>
        </template>

      </el-row>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="props.changeCloseStatus">取消</el-button>
          <el-button type="primary">确认</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import {useStore} from 'vuex';
import {onMounted,computed,ref,watch} from "vue";
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
//所有channel
const allChannelStatus = computed(() => store.getters.getChannelConf);
//状态
const allConfig = ref({});

</script>

<style scoped lang="scss">

</style>