<template>
  <div class="fullscreen bg-primary text-white text-center q-pa-md flex flex-center">
    <div>
      <div style="font-size: 30vh">
        404
      </div>

      <div class="text-h2" style="opacity:.4">
        页面不存在...
      </div>

      <q-btn
        class="q-mt-xl"
        color="white"
        text-color="blue"
        unelevated
        to="/"
        label="Go Home"
        no-caps
      />
    </div>
  </div>
</template>

<script setup>
import {useStore} from "vuex";
import {onMounted, ref} from "vue";
const store = useStore();

//获取主题色
const userBaseColor = ref(store.getters.getUserColor); 
// 更新主题色
const updateThemeColor = (color) => {
  store.commit('setUserColor', color)
  document.documentElement.style.setProperty('--q-primary', color)
}

//页面设置主题颜色
onMounted(() => {
  updateThemeColor(userBaseColor.value)
})


defineOptions({
  name: 'ErrorNotFound'
});
</script>
