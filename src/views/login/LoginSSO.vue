<template>
    <div>单点登录</div>
</template>

<script setup>
    import {onMounted} from "vue";
    import api from "@/utils/api";
    import Cookies from "js-cookie";
    import {ElMessage} from "element-plus";
    import {useRouter} from 'vue-router'
    import service from "@/api/request";
    import {userLogin} from "@/api/user/UserApi";


    const router = useRouter()


    onMounted(async ()=>{
      try {
        const params = new URLSearchParams()
        params.append('name', 'test1')
        params.append('pwd', '123456')

        // const resualt = await service.post('/user/doLogin', params)
        const {data} = await userLogin(params);
        if (data) {
          Cookies.set('satoken', data, {path: '/', expires: 30}); // 更新 Cookie
        }
        ElMessage.success('登录成功')
        router.push('/')
      } catch (error) {
        console.log(error)
        ElMessage.error('登录失败，请稍后重试')
      }
    });
</script>

<style scoped lang="scss">

</style>