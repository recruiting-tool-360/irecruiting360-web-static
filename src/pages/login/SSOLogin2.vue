<template>
  <div class="sso-login-container">
    <div class="login-content">
      <h1 class="text-h4 text-primary q-mb-lg">SSO 登录</h1>

      <q-card flat bordered class="q-pa-md " v-if="!loading">
        <q-card-section class="text-center">
          <p class="text-body1">登录过程被中断或发生错误</p>
          <div class="q-mt-md">
            <q-btn color="primary" label="重试" @click="handleSSOLogin" class="q-mr-md" />
            <q-btn color="primary" label="返回登录页" to="/login" />
          </div>
        </q-card-section>
      </q-card>
    </div>

    <div class="loading-overlay" v-if="loading">
      <q-spinner color="primary" size="3em" />
      <div class="text-subtitle1 q-mt-sm text-white">正在登录中，请稍候...</div>
      <q-btn flat color="white" label="取消" class="q-mt-md" @click="cancelLogin" />
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { generateSsoToken, ssoLogin } from 'src/api/user/UserApi';
import { createChat } from 'src/api/chat/ChatApi';
import { useStore } from 'vuex';
import notify from 'src/util/notify';
import Cookies from 'js-cookie'

const router = useRouter();
const store = useStore();
const loading = ref(true);

// SSO 登录流程
const handleSSOLogin = async () => {
  try {
    loading.value = true;

    // 从 URL 获取参数，如果有的话
    const urlParams = new URLSearchParams(window.location.search);
    const errorMsg = urlParams.get('error');

    if (errorMsg) {
      notify.error(decodeURIComponent(errorMsg));
      loading.value = false;
      return;
    }

    // 步骤1: 生成SSO令牌
    const tokenData = {
      "tenantCode": "company_a",
      "apiKey": "test_api_key_123",
      "signature": "94a8f1478929d191c56fb42e1007cdfe",
      "thirdPartyUserId": "778",
      "userData": {
        "username": "test3",
        "nickname": "test3",
        "email": "test1123@qq.com",
        "phone": "67854533",
        "avatar": null
      },
      "extendData":{
        "from":"recruit-assistant",
        "plan": "PlanA"
      }
    };

    const tokenResponse = await generateSsoToken(tokenData);

    if (tokenResponse.data && tokenResponse.data.token) {
      const token = tokenResponse.data.token;

      // 步骤2: 使用令牌进行SSO登录
      const loginResponse = await ssoLogin(token);

      if (loginResponse.success === "success") {
        // 如果登录成功，更新用户信息到 Vuex
        if (loginResponse.data) {
          Cookies.set('satoken', loginResponse.data, {path: '/', expires: 30}); // 更新 Cookie
        }
        // if (loginResponse.data && loginResponse.data.userInfo) {
        //   store.commit('changeUserInfo', loginResponse.data.userInfo);
        // }

        // 步骤3: 创建聊天
        const chatData = [
          {
            "positionId": "1",
            "name": "A",
            "jd":"职位名称：骑车开发工程师\n" +
                "职位性质：  工作年限：3-5年  职能类型：技术类  薪酬范围：20000-30000K·12薪  工作城市：上海、北京  学历要求：硕士\n" +
                "职位描述：\n" +
                "   职位描述：\n" +
                "      1、 负责设备改善/改造，包括设备UPH，稼动率，OEE,TEEP,MTTR,MTBF,CPK,产品转型时间等量化指标的提升及生产工艺流程优化；\n" +
                "      2、 负责设备电气设计及预算，绘制电气原理图、布局图、接线图，电气部件选型及BOM制定，编写程序，协助/指导完成设备安装及调试；\n" +
                "      3、 配合机械工程师完成新设备导入工作，制定设备控制系统、通讯协议等相关技术要求；\n" +
                "      4、 配合机械工程师制定设备开发过程中所需技术文档，包括方案设计说明，设备技术协议，项目开发计划表，DOE实验报告，设备使用/维护手册，设备易损件/备件清单等；\n" +
                "      5、 参与生产线重大/疑难品质异常的FA分析及改善；\n" +
                "      6、 制定设备电气控制模块化，标准化规范，优化控制系统稳定性，缩短设备开发周期；\n" +
                "      7、 参与控制系统疑难问题会诊、分析，协助/指导EE解决疑难问题。\n" +
                "\n" +
                "   任职要求：\n" +
                "      1、本科含以上学历，自动化类相关专业优先；\n" +
                "      2、三年以上相关工作经验，能独立运用PLC编程实现自动化设备的控制；\n" +
                "      3、熟悉PLC编程，熟悉CAD制图，人机界面编辑，对运动控制系统有一定了解；\n" +
                "      4、熟悉232/485通讯、以太网通讯，完成智能仪器与PLC数据通讯，完成与上位机或者MES数据交互。"
          },
          {
            "positionId": "2",
            "name": "B"
          }
        ];

        try {
          const chatResponse = await createChat(chatData);

          if (chatResponse.success === "success") {
            // 如果聊天创建成功，保存聊天ID（如果响应中有的话）
            if (chatResponse.data && chatResponse.data.chatId) {
              store.commit('changeLocalUserChatId', chatResponse.data.chatId);
            }

            // 所有步骤成功完成，跳转到首页
            router.push('/');
          } else {
            notify.error(chatResponse.errorMessage || '创建聊天失败');
            console.error('创建聊天失败:', chatResponse);
            loading.value = false;
          }
        } catch (chatError) {
          console.error('创建聊天时发生错误:', chatError);
          notify.error('创建聊天时发生错误');
          // 尽管创建聊天失败，但用户已登录，仍然可以跳转到首页
          setTimeout(() => {
            router.push('/');
          }, 2000);
        }
      } else {
        notify.error(loginResponse.errorMessage || 'SSO登录失败');
        console.error('SSO登录失败:', loginResponse);
        loading.value = false;
      }
    } else {
      notify.error('生成SSO令牌失败');
      loading.value = false;
    }
  } catch (error) {
    console.error('SSO登录过程中发生错误:', error);
    notify.error('登录过程中发生错误');
    loading.value = false;
  }
};

// 取消登录
const cancelLogin = () => {
  loading.value = false;
  notify.warning('登录操作已取消');
};

// 组件挂载时自动开始登录流程
onMounted(() => {
  handleSSOLogin();

  // 添加超时处理，防止无限等待
  const timeout = setTimeout(() => {
    if (loading.value) {
      loading.value = false;
      notify.error('登录超时，请稍后重试');
    }
  }, 30000); // 30秒超时

  // 组件卸载时清除超时定时器
  clearTimeoutOnUnmount(timeout);
});

// 组件卸载时清除超时定时器
const clearTimeoutOnUnmount = (timeout) => {
  onUnmounted(() => {
    clearTimeout(timeout);
  });
};
</script>

<style scoped>
.sso-login-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #f5f5f5;
}

.login-content {
  width: 90%;
  max-width: 400px;
  text-align: center;
  z-index: 1;
}

.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.7);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  backdrop-filter: blur(3px);
}
</style>
