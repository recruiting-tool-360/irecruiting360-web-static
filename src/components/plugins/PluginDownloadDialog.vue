<template>
  <q-dialog v-model="dialogVisible" persistent>
    <q-card style="width: 90vw; max-width: 800px; display: flex; flex-direction: column;">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">插件下载安装指南</div>
        <q-space />
        <q-btn icon="close" flat round dense @click="closeDialog" />
      </q-card-section>

      <q-separator class="q-mt-sm" />

      <!-- 内容区域(可滚动) -->
      <q-card-section class="scroll" style="max-height: 65vh; flex: 1;">
        <div class="content">
          <div class="">
            <div class="text-h6 q-mb-md">插件安装步骤</div>
            <ol class="step-list">
              <li class="q-mb-sm">下载插件压缩包到本地</li>
              <li class="q-mb-sm">解压缩文件到一个固定位置，建议放在文档文件夹中</li>
              <li class="q-mb-sm">打开Chrome浏览器，点击右上角的"更多工具" > "扩展程序"</li>
              <li class="q-mb-sm">打开右上角的"开发者模式"</li>
              <li class="q-mb-sm">点击"加载已解压的扩展程序"按钮</li>
              <li class="q-mb-sm">选择步骤2中解压后的文件夹</li>
              <li class="q-mb-sm">安装完成后，刷新本页面即可使用插件功能</li>
            </ol>
          </div>
          <div class="text-center q-mt-sm q-mb-md">
            <q-badge color="negative" outline>
              注意：下载插件后，请勿删除插件文件，否则插件功能将无法正常使用。
            </q-badge>
          </div>
          <q-img :src="'/guide/guide.svg'" style="width: 100%" class="cursor-pointer">
          </q-img>
        </div>
      </q-card-section>

      <!-- 固定在底部的下载按钮区域 -->
      <q-card-section class="q-pa-md bg-grey-2" style="border-top: 1px solid #e0e0e0;">
        <div class="row justify-center">
          <q-btn 
            color="primary" 
            flat
            size="md" 
            label="下载插件" 
            icon="download" 
            @click="downloadZip" 
            :loading="downloading" 
            class="q-px-xl"
          />
        </div>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useStore } from 'vuex';
import { useQuasar } from 'quasar';
import { getDownloadUrl } from "src/api/user/UserApi";

const $q = useQuasar();
const store = useStore();
const downloading = ref(false);

// 使用Vuex中的状态控制对话框显示
const dialogVisible = computed({
  get: () => store.getters.getPluginDownloadDialogVisible,
  set: (value) => store.commit('setPluginDownloadDialogVisible', value)
});

// 关闭对话框
const closeDialog = () => {
  store.commit('setPluginDownloadDialogVisible', false);
};

// 监听对话框显示状态，当显示时获取下载地址
watch(dialogVisible, (newVal) => {
  if (newVal) {
    fetchDownloadUrl();
  }
});

// 点击下载按钮的功能
const downloadZip = () => {
  // 使用已保存在Vuex中的下载地址
  const url = store.getters.getDownloadUrl;
  if (url) {
    downloading.value = true;
    window.open(url, '_blank');
    
    // 延迟恢复按钮状态，给用户更好的反馈
    setTimeout(() => {
      downloading.value = false;
    }, 1000);
  } else {
    $q.notify({
      message: '下载地址无效，请稍后再试',
      color: 'warning',
      icon: 'warning'
    });
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
    $q.notify({
      message: '获取下载地址失败，请稍后再试',
      color: 'negative',
      icon: 'error'
    });
  }
}

onMounted(() => {
  // 只有在对话框显示时才获取下载地址
  if (dialogVisible.value) {
    fetchDownloadUrl();
  }
});
</script>

<style scoped>
.step-list {
  padding-left: 20px;
}

.step-list li {
  padding: 8px 0;
}
</style>
