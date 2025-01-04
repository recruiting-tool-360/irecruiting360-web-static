<template>
    <div class="login-container">
        <h2>登陆</h2>
    <div class="Current-work group-div default-input-size default-input-left-margin">
            <div>
                    <el-text class="mx-1 gap=4 el-text-margin-rg-style el-text-ellipsis">用户名</el-text>
                    <el-input v-model="username" style="width: 240px" placeholder="用户名" />
            </div>
    </div>
    <div class="Current-work group-div default-input-size default-input-left-margin">
            <div class="text-inp-margin">
                    <el-text class="mx-1 el-text-min-width-style el-text-margin-rg-style el-text-ellipsis">密码</el-text>
                    <el-input v-model="password" style="width: 240px" type="password" placeholder="密码" />
            </div>
    </div>
    <div class="Current-work group-div default-input-size default-input-left-margin">
            <div class="text-inp-margin">
                <el-button type="primary">登陆</el-button>
                <el-button type="secondary">注册</el-button>
            </div>
    </div>
    </div>
</template>

<script setup>
import { ref } from 'vue'
const username = ref('')
const password = ref('')
</script>

<style scoped lang="scss">

.login-container {  
  height: 100vh; /* 容器高度为视窗高度 */  
  display: flex;  
  justify-content: center; /* 水平居中 */  
  align-items: center; /* 垂直居中 */  
  /* 其他样式... */  
  padding: 20px; /* 为内容留出一些空间 */  
  box-sizing: border-box; /* 边框盒模型 */  
}
</style>