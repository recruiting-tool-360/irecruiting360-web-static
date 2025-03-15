<template>
  <el-dialog v-model="localPluginVisible"
             :show-close="false" width="500" :close-on-click-modal="handlePluginClose"
             style="background-color: transparent;box-shadow: none">
    <template #header="{ close, titleId, titleClass }">
      <div class="my-header" style="width: 500px;height: 280px">
        <h4 :id="titleId" :class="titleClass"></h4>
        <div style="width: 100%;height: 32px;display: flex;justify-content: end">
          <img :src="'/index/header/searchPage/pluginClose.svg'" style="cursor: pointer" @click="close">
        </div>
        <div style="width: 100%;height: 100%;position: relative">
          <img :src="'/index/header/searchPage/chajian.svg'" alt="">
          <el-button class="plugin-btm" type="primary" @click="navigateToGuide('guide')">安装插件</el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import {useStore} from 'vuex';
import {computed, defineExpose, ref, watch} from "vue";
import {ElMessage} from "element-plus";
import {useRouter} from "vue-router";
const router = useRouter()
//store
const store = useStore();
//const visibleSwitch = ref(store.getters.getPluginSwitch);
// 使用 computed 绑定 getter
const visibleSwitch = computed(() => store.getters.getPluginSwitch);
// AISearch.vue 的 setups
const localPluginVisible = ref(false);

const openPlugin = () => {
  localPluginVisible.value = true;
};

const handlePluginClose = () => {
  localPluginVisible.value = false;
};

// 跳转函数
const navigateToGuide = (route) => {
  router.push({ name: route }) // 跳转到路由名为 guide 的路由
}

// 监听 visibleSwitch 的变化
watch(visibleSwitch, (newVal, oldVal) => {
  // console.log('visibleSwitch changed:', newVal);
  if(!newVal){
    openPlugin();
  }else{
    handlePluginClose();
  }
}, { immediate: true });

defineExpose({
  openPlugin
})
</script>

<style scoped lang="scss">

.plugin-btm{
  width: 88px;
  height: 36px;
  background: linear-gradient(90deg, #6FA2F9 0%, #2F70FA 100%);
  color: white;
  position: absolute;
  left:45px;
  bottom: 60px;
}

</style>