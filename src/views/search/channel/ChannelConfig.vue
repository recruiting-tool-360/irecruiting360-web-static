
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
        <template v-for="(channel, key) in allChannelStatus" :key="key">
          <el-checkbox v-model="channel.disable" :disabled="key==='ALL'||key==='Collect'" style="height: 32px;font-size: 13px" :label="channel.name"/>
        </template>

      </el-row>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="myClose">取消</el-button>
          <el-button type="primary" @click="mySubmit">确认</el-button>
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
import _ from 'lodash';

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
//所有channelconst
const allChannelStatus = ref(_.cloneDeep(store.getters.getChannelConf));
// 所有有效第三方渠道
const noEnabledChannels = computed(() => {
  // 使用 Object.entries 遍历对象并过滤出 disable 为 false 的项
  return Object.entries(allChannelStatus.value)
      .filter(([key, channel]) => !(key==='ALL'||key==='Collect')) // 过滤出 disable 为 false 的项
      .map(([key, channel]) => ({...channel })); // 返回过滤后的对象
});
//已开启的channel
const enabledChannels = computed(() => {
  // 使用 Object.entries 遍历对象并过滤出 disable 为 false 的项
  return Object.entries(noEnabledChannels.value)
      .filter(([key, channel]) => !channel.disable) // 过滤出 disable 为 false 的项
      .map(([key, channel]) => ({...channel })); // 返回过滤后的对象
})
//状态
const allConfig = ref({});

//确认按钮
const mySubmit = () => {
  if((noEnabledChannels.value.length - enabledChannels.value.length)<=0){
    ElMessage.warning("至少有一个渠道保留开启状态");
    return;
  }
  noEnabledChannels.value.forEach((item)=>{
    store.commit('changeChannelConfDisable',{key:item.key,value:item.disable});
  });
  props.onConfirm(enabledChannels.value.map(obj=>obj.key));
}

const myClose = () => {
  allChannelStatus.value=_.cloneDeep(store.getters.getChannelConf);
  props.changeCloseStatus();
}

</script>

<style scoped lang="scss">

</style>