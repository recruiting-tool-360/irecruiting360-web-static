<template>
    <div class="content">
      <el-image class="myImg" :src="'/guide/guide.svg'" style="width: 100vw;" @click="downloadZip"></el-image>
    </div>
</template>

<script setup>

// 点击下载按钮的功能
import {ElMessage} from "element-plus";
import {useStore} from "vuex";
const store = useStore();
const downloadZip = () => {
  // 使用已保存在Vuex中的下载地址
  const url = store.getters.getDownloadUrl;
  if (url) {
    window.open(url, '_blank');
  } else {
    ElMessage.warning('下载地址无效，请稍后再试');
  }
}
</script>

<style scoped lang="scss">

</style>