<template>
  <q-dialog v-model="dialogVisible" persistent no-backdrop-dismiss>
    <q-card class="plugin-install-dialog" style="background: transparent; box-shadow: none; width: 500px; max-width: 90vw;overflow: unset">
      <div class="dialog-header q-mb-none row justify-end q-py-xs">
        <q-btn flat round color="white" icon="close" @click="closeDialog" class="absolute-bottom-right bg-grey-6" />
      </div>

      <div class="dialog-content relative-position">
        <q-img :src="'/index/header/searchPage/chajian.svg'" style="width: 100%" />

        <div class="absolute-bottom-left text-center q-pb-lg">
          <q-btn
            color="primary"
            label="安装插件"
            size="md"
            class="plugin-install-btn q-py-sm q-px-md q-ml-xl q-mb-lg"
            @click="handleInstallClick"
          />
        </div>
      </div>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, computed, watch, defineExpose } from 'vue';
import { useStore } from 'vuex';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';

const $q = useQuasar();
const router = useRouter();
const store = useStore();

// 通过 Vuex 的 pluginInstall 状态控制对话框显示
const pluginInstalled = computed(() => store.getters.getPluginInstall);

// 本地控制对话框显示状态
const dialogVisible = ref(false);

// 打开对话框方法
const openDialog = () => {
  dialogVisible.value = true;
};

// 关闭对话框方法
const closeDialog = () => {
  dialogVisible.value = false;

  // 将插件状态标记为已安装，避免再次显示提示
  // 注意：这里只是暂时关闭提示，不是真的标记插件已安装
  store.commit('changePluginSwitch', true);
};

// 安装插件按钮点击事件
const handleInstallClick = () => {
  // 显示插件下载对话框
  store.commit('setPluginDownloadDialogVisible', true);

  // 关闭当前对话框
  closeDialog();
};

// 监听插件安装状态变化
watch(pluginInstalled, (newVal) => {
  // 如果插件未安装，打开对话框
  if (!newVal) {
    openDialog();
  } else {
    dialogVisible.value = false;
  }
});

// 对外暴露的方法
defineExpose({
  openDialog
});
</script>

<style scoped>
.plugin-install-dialog {
  border-radius: 12px;
  overflow: hidden;
}

.dialog-header {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 10;
}

.plugin-install-btn {
  font-weight: bold;
  font-size: 1.1rem;
  border-radius: 8px;
}
</style>
