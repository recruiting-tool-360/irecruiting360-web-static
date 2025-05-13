<template>
  <q-layout view="lHh Lpr lFf" class="login-layout">
    <div class="login-background"></div>
    <div class="login-logo-area q-pl-md">
      <div class="text-primary text-bold text-h2">
        <img class="cursor-pointer" :src="'/logo/logo2.svg'" alt="i快招logo" />
      </div>
    </div>
    <q-page-container>
      <router-view />
    </q-page-container>
    <div class="login-footer">
      <div class="text-center text-grey-7">
        Copyright © 2025 上海智寻才信息科技有限公司
      </div>
      <div class="text-center text-grey-7">
        沪ICP备2025117219号-1
      </div>
    </div>
  </q-layout>
</template>

<script setup>
// 登录页面不需要额外的逻辑
</script>

<style scoped>
.login-layout {
  min-height: 100vh;
  position: relative;
  background-color: #f0f7ff;
  overflow: hidden;
}

.login-background {
  position: absolute;
  width: 100%;
  height: 100%;
  background-image:
  linear-gradient(120deg, rgba(240, 249, 255, 0.7) 0%, rgba(225, 240, 255, 0.4) 100%), radial-gradient(circle at 20% 20%, rgba(185, 215, 250, 0.2) 15%, transparent 16%), radial-gradient(circle at 80% 80%, rgb(15 126 255 / 20%) 15%, transparent 16%), radial-gradient(circle at 70% 30%, rgba(185, 215, 250, 0.2) 12%, transparent 13%), radial-gradient(circle at 30% 70%, rgb(131 184 247 / 20%) 12%, transparent 13%), radial-gradient(circle at 50% 50%, rgba(185, 215, 250, 0.2) 25%, transparent 26%);
  background-size: 100% 100%, 60% 60%, 60% 60%, 40% 40%, 40% 40%, 80% 80%;
  z-index: 0;
  opacity: 0.8;
}

.login-logo-area {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
}

.login-footer {
  position: absolute;
  bottom: 24px;
  width: 100%;
  z-index: 1;
  font-size: 12px;
}

@media (max-width: 599px) {
  .login-logo-area {
    padding: 20px;
  }

  .login-footer {
    font-size: 10px;
  }
}
</style>
