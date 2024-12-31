<template>
  <el-dialog
      v-model="centerDialogVisible"
      width="500"
      align-center
      :before-close="props.changeCloseStatus"
  >
    <span>{{props.context}}</span>
    <template #footer>
      <div class="dialog-footer">
        <el-button @click="props.changeCloseStatus">取消</el-button>
        <el-button type="primary" @click="props.onConfirm">
          确认
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import {onMounted,computed,ref,watch} from "vue";


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
  }
});

const centerDialogVisible = computed(()=>props.dialogVisible);

// 如果 visible关闭回调父组件
// watch(() => centerDialogVisible.value, (newValue) => {
//   if(newValue===false){
//     props.changeCloseStatus();
//   }
// });
</script>

<style scoped lang="scss">

</style>