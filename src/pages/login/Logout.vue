<template>
  <div></div>
</template>

<script setup>
import { onMounted, ref, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import {generateSsoToken, ssoLogin, userlogout} from 'src/api/user/UserApi';
import { useStore } from 'vuex';
import notify from 'src/util/notify';
import Cookies from 'js-cookie'

const router = useRouter();
const store = useStore();
const loading = ref(true);

const logout = async () => {
  try {
    await userlogout();
    Cookies.remove('satoken', {path: '/'});
    store.commit('changeUserInfo', null);
    // store.commit('clearSearchConditionId');
    notify.success('退出登录成功');
    window.location.href = '/login';
  } catch (e) {
    console.log(e);
    notify.error('退出登录失败，请重试');
  }
}

//页面设置主题颜色
onMounted(() => {
  logout();
})
</script>

