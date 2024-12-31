<template>
  <el-dialog v-model="visibleSwitch"
             :show-close="false" width="500" :close-on-click-modal="false"
             style="background-color: transparent;box-shadow: none">
    <template #header="{ close, titleId, titleClass }">
      <div class="my-header" style="width: 500px;height: 280px">
        <h4 :id="titleId" :class="titleClass"></h4>
        <div style="width: 100%;height: 32px;display: flex;justify-content: end">
          <img :src="'/index/header/searchPage/pluginClose.svg'" style="cursor: pointer" @click="close">
        </div>
        <div style="width: 100%;height: 100%;position: relative">
          <img :src="'/index/header/searchPage/chajian.svg'" alt="">
          <el-button class="plugin-btm" type="primary">安装插件</el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import {useStore} from 'vuex';
import {computed, ref} from "vue";
//store
const store = useStore();
//const visibleSwitch = ref(store.getters.getPluginSwitch);
// 使用 computed 绑定 getter
const visibleSwitch = computed(() => !store.getters.getPluginSwitch);


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