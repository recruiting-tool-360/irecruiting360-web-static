<template>
    <div>单点登录</div>
</template>

<script setup>
  import {onMounted, getCurrentInstance} from "vue";
  import api from "@/utils/api";
  import Cookies from "js-cookie";
  import {ElMessage} from "element-plus";
  import {useRouter} from 'vue-router'
  import service from "@/api/request";
  import {userLogin} from "@/api/user/UserApi";

  const { proxy } = getCurrentInstance();
  const iframeMessenger = proxy.$iframeMessenger;
  const router = useRouter()

      
  iframeMessenger.on("init", async (data, context) => {
    if(context.sourceName !== "ihr-recruit-ai") return
    console.log('iframeMessenger', data, context);
    
    const params = new URLSearchParams()
    params.append('name', 'test1')
    params.append('pwd', '123456')

    // const resualt = await service.post('/user/doLogin', params)
    return new Promise((resolve) => {
      userLogin(params).then(({ data }) => {
        if (data) {
          Cookies.set('satoken', data, {path: '/', expires: 30}); // 更新 Cookie
        }
        ElMessage.success('登录成功')
        resolve({ success: data })
        router.push('/')
      })
    }) 
  });
</script>

<style scoped lang="scss">

</style>