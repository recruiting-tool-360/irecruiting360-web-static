<template>
  <el-drawer modal-class="chatDrawer"
             v-model="visible"
             :show-close="false" :with-header="false" size="400">
    <div class="chatWidth chatTop">
      <!--  头部    -->
      <el-row class="el-row-100-percent-w chatHeader" style="margin-bottom: 30px;padding:8px 0;border-bottom: 1px solid #E0E0E0;
">
        <el-col :span="12" style="display:flex;align-items: center;justify-content: start">
          <el-image class="headerIcons" :src="'/index/header/icons/kefu.svg'"></el-image>
          <el-text style="font-size: 14px;margin-left: 8px"> AI助理小爱 </el-text>
        </el-col>
        <el-col :span="12" style="display:flex;align-items: center;justify-content: end">
          <el-image style="margin-right: 16px" class="headerIcons" :src="'/index/header/chat/chatClose.svg'" @click="visible=false"></el-image>
        </el-col>
      </el-row>
      <!--  内容部分    -->
      <el-row class="el-row-100-percent-w" style="height: 60vh">
        <div class="chat-container" v-chat-scroll ref="chatContainer">
          <div v-for="message in messages" :key="message.id">
            <div v-if="message.id%2!==0" style="display: flex;justify-content: end;padding: 8px;margin: 10px 0;">
              <el-text type="success">{{ message.text }}</el-text>
            </div>
            <div v-else style="display: flex;justify-content: start;padding: 8px;margin: 10px 0;">
              <el-text type="primary">{{ message.text }}</el-text>
            </div>
          </div>
        </div>
      </el-row>
      <!--   输入框   -->
      <el-row class="el-row-100-percent-w" style="padding: 12px 16px;display: flex;justify-content: center">
<!--        <el-button @click="sentMassage"></el-button>-->
        <div class="chat-container-send" style="width: 100%">
          <el-input
              v-model="message"
              class="custom-input"
              style="width: 100%"
              :autosize="{minRows: 3}"
              resize="none"
              type="textarea"
              placeholder="Please input"
          >
          </el-input>
          <el-row class="el-row-100-percent-w" style="overflow: hidden">
            <el-col style="display:flex;align-items: center;justify-content: end">
              <div class="helper-text" style="color: rgba(0,0,0,0.25);font-size: 12px;margin-right: 10px">
                <span>Enter 发送，Ctrl+Enter 换行</span>
              </div>
              <el-button
                  class="send-button"
                  @click="sentMassage"
                  type="primary"
                  round
                  style="width: 80px;height: 30px;background: linear-gradient(249.61deg, #C7A0FF 0%, #8777FF 11.71%, #5280FC 49.68%, #54A4FF 74.23%, #3CD1F6 90.26%, #74FFCD 100%);"
              >
                <el-image class="headerIcons" :src="'/index/header/chat/fasong.svg'" style="margin-right: 4px"></el-image>
                <el-text style="font-size: 12px;color: white">发送</el-text>
              </el-button>
            </el-col>
          </el-row>

        </div>
      </el-row>
    </div>

  </el-drawer>
</template>

<script setup>
import {ref,watch,nextTick} from "vue";
import { ElButton, ElDrawer } from 'element-plus'
import { vChatScroll } from "vue3-chat-scroll";
import streamService from "@/api/chat/ChatApi";
import {fetchStream} from "@/api/chat/ChatUtil2";

const props = defineProps({
  dialogFlag: {
    type: Boolean,
    default:false
  },
  onCloseClick: {
    type: Function,
    required: true
  }
});
const visible = ref(props.dialogFlag)
const message = ref(''); // 用于存储输入的消息
// 获取聊天容器的引用
const chatContainer = ref(null)

// 平滑滚动到底部的函数
const smoothScrollToBottom = () => {
  if (!chatContainer.value) return;

  const container = chatContainer.value;
  const start = container.scrollTop;
  const end = container.scrollHeight;
  const distance = end - start;
  const duration = 500; // 滚动动画持续时间，单位为毫秒
  let startTime;

  const animateScroll = (currentTime) => {
    if (!startTime) startTime = currentTime;
    const timeElapsed = currentTime - startTime;
    const progress = Math.min(timeElapsed / duration, 1); // 计算动画进度（0 - 1）

    container.scrollTop = start + distance * progress;

    if (timeElapsed < duration) {
      requestAnimationFrame(animateScroll); // 如果动画未完成，继续请求下一帧
    } else {
      container.scrollTop = end; // 确保滚动到目标位置
    }
  };

  requestAnimationFrame(animateScroll); // 启动动画
};

// 监听消息更新并滚动到底部
const scrollToBottom = () => {
  nextTick(() => {
    if (chatContainer.value) {
      //chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
      smoothScrollToBottom();  // 平滑滚动到底部
    }
  });
};

// 定义消息数据
const messages = ref([
  { id: 1, text: "Hello, how are you?" },
  { id: 2, text: "I'm good, thanks!" },
]);
let j =3;
const sentMassage = () =>{
  testChat();
  // for (let i=1;i<=100;i++){
  //   const data = { id: i*j, text: "Hello, how are you?---"+(i*j) }
  //   messages.value.push(data);
  //   scrollToBottom();  // 调用滚动到底部的函数
  // }
  // j+=2;
}

const chatRequest = {
  chatId: "123",
  userId: "456",
  searchConditionId: "789",
  prompt: "你好",
};

const handleMessage = (message) => {
  console.log("Received:", message);
  // 更新 UI 或其他逻辑
};

const handleError = (error) => {
  console.error("Error:", error);
  // 错误提示逻辑
};

let idNum =1;
const testChat = () => {
  // streamService.streamRequest(
  //     "http://127.0.0.1:8087/ihire/chat/streamChat",
  //     chatRequest,
  //     handleMessage,
  //     handleError
  // )
  fetchStream(
      "http://127.0.0.1:8087/ihire/chat/streamChat",
      chatRequest,
      (message) => {
        console.log("Received:", message);
        //this.messages.push(message); // 将接收到的消息添加到消息列表
        const msg = { id: ++idNum, text: message};
        messages.value.push(msg);
        scrollToBottom();  // 调用滚动到底部的函数
      },
      (error) => {
        console.error("Stream error:", error);
      }
  );
}













// 如果 props 的值可能会变化，使用 watch 来同步更新 localValue
watch(() => props.dialogFlag, (newValue) => {
  visible.value = newValue;
});
// 如果 visible关闭回调父组件
watch(() => visible.value, (newValue) => {
if(newValue===false){
  console.log("kkk")
  props.onCloseClick();
}
});
</script>

<style scoped lang="scss">
.chat-container {
  height: 100%;
  width: 100%;
  box-shadow: inset 1px 1px 20px 20px #dadada33;
  padding: 12px;
  overflow-y: auto;
}
  .chatWidth{
    width: 360px;
  }
  .chatTop{
    padding: 8px 16px 0 16px;
  }
  .chatHeader{
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.98) 100%), linear-gradient(90deg, rgba(232, 248, 255, 1) 0%, rgba(237, 254, 246, 1) 25.15%, rgba(222, 255, 243, 1) 50.61%, rgba(229, 241, 255, 1) 74.68%, rgba(246, 238, 255, 1) 100%);
  }
::v-deep(.custom-input .el-input__inner ){
  border-color: transparent !important; /* 默认边框颜色透明 */
  background-color: #f9f9f9; /* 背景颜色可自定义 */
  border-radius: 10px;
  box-shadow: none; /* 去掉阴影 */
  transition: border-color 0.3s ease; /* 平滑过渡 */
}
.custom-input >>> .el-input__inner:focus {
  border-color: transparent !important; /* 聚焦时边框仍透明 */
  box-shadow: none !important; /* 去掉聚焦阴影 */
  outline: none; /* 移除默认的外边框 */
}
</style>