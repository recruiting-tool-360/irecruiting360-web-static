<template>
  <div class="geekInfoContainer">
    <el-dialog
        v-model="centerDialogVisible"
        width="600"
        align-center
        :show-close="true"
        :close-on-click-modal="false"
    >
      <el-row>

      </el-row>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="props.changeCloseStatus">取消</el-button>
          <el-button type="primary" >确认</el-button>
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
  dialogVisible: {
    type:Boolean,
    default: () => false
  }
});

//显示开关
const centerDialogVisible = computed(()=>props.dialogVisible);




</script>

<style scoped lang="scss">

</style>