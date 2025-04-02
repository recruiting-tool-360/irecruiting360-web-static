<template>
    <div class="content" style="padding-bottom: 50px">
      <el-image class="myImg" :src="'/guide/guide.svg'" style="width: 100vw;" @click="downloadZip"></el-image>
      <div style="text-align: center;"><el-text style="color: red">注意：下载插件后，请勿删除插件文件，否则插件功能将无法正常使用。</el-text></div>
    </div>
</template>

<script setup>

// 点击下载按钮的功能
import {ElMessage} from "element-plus";
import {useStore} from "vuex";
import {getDownloadUrl} from "@/api/user/UserApi";
import {onMounted} from "vue";
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

const fetchDownloadUrl = async () => {
  try {
    const {data} = await getDownloadUrl();
    if (data) {
      store.commit('setDownloadUrl', data);
    }
  } catch (error) {
    console.error('获取下载地址失败:', error);
  }
}

onMounted(async () => {
  // 在组件加载时获取下载地址
  await fetchDownloadUrl();
})
</script>

<style scoped lang="scss">

</style>