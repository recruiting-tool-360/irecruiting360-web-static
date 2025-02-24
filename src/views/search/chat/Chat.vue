<template>
  <div class="chatWidth chatTop">
    <!--  头部    -->
    <el-row class="el-row-100-percent-w chatHeader" style="margin-bottom: 8px;padding:8px 0 8px 16px;border-bottom: 1px solid #E0E0E0;
">
      <el-col :span="12" style="display:flex;align-items: center;justify-content: start">
        <el-image class="headerIcons" :src="'/index/header/chat/ai.svg'" style="height: 30px;width: 40px"></el-image>
        <el-text style="font-size: 14px;margin-left: 8px;margin-top: 9px;color: #1296db;"> AI搜索人才 </el-text>
      </el-col>
      <!--  历史对话    -->
      <el-col :span="12" style="display:flex;align-items: center;justify-content: end">
        <el-popover placement="bottom" :width="300" trigger="click" popper-style="--el-popover-padding: 0" ref="historyRef">
          <template #reference>
            <el-image style="margin-right: 8px" class="headerIcons" :src="'/index/header/chat/time.svg'" @click="findHistoricalDialogue"></el-image>
          </template>
          <el-row style="padding: 10px 16px" v-loading="historyLoading">
            <!--     头部       -->
            <el-col :span="24" style="height: 40px;display:flex;align-items: center;justify-content: space-between;border-bottom: 1px solid rgba(0, 0, 0, 0.09)">
              <el-text class="default-font-size14" style="color: rgba(0, 0, 0, 0.85)">历史对话</el-text>
              <el-button class="default-font-size14" link style="color: rgba(25, 170, 141, 1)" @click="()=>{historyRef.hide();historyDialog=true}">清空</el-button>
            </el-col>
            <!--     内容       -->
            <el-col :span="24"  style="overflow: auto;max-height: 420px">
              <template v-for="(history, index) in chatHistoryList" :key="index">
              <el-row style="margin-top: 16px">
                <el-col :span="24" style="margin-bottom: 4px">
                  <el-text style="color: rgba(0, 0, 0, 0.45)">{{history.timestamp}}&nbsp;&nbsp;&nbsp;{{history.role==='user'?'(我)':'AI'}}</el-text>
                </el-col>
                <el-col :span="24">
                    <div class="chatListCard" style="width: 100%;display: flex;align-items: center" :style="`background: ${history.role==='user'?'rgba(255, 255, 255, 1)':'#1296db0d'}`">
                      <el-image :src="'/index/header/chat/wath.svg'" style="height: 20px;width: 20px;margin: 0 8px"></el-image>
                      <el-popover placement="left" :width="300" trigger="hover">
                        <template #reference>
                          <el-text class="el-text-ellipsis" style="color: rgba(0, 0, 0, 0.85)">{{ history.content }}</el-text>
                        </template>
                        <el-text style="color: rgba(0, 0, 0, 0.85)">{{ history.content }}</el-text>
                      </el-popover>
                    </div>
                </el-col>
              </el-row>
              </template>
            </el-col>
          </el-row>
        </el-popover>
        <el-image style="margin-right: 16px" class="headerIcons" :src="'/index/header/chat/chatClose.svg'" @click="props.onCloseClick"></el-image>
      </el-col>
    </el-row>
    <!--  内容部分    -->
    <el-row class="el-row-100-percent-w" style="height: 72vh">
      <div class="chat-container" v-chat-scroll ref="chatContainer">
        <div v-for="message in messages" :key="message.id">
          <div v-if="message.role ==='User'" style="display: flex;justify-content: end;padding: 8px;margin: 10px 0;">
            <div class="rightContainer chatContainer">
              <div class="dataCont">{{getFormatData(message.created)}}</div>
              <div class="content">{{ message.content }}</div>
            </div>
          </div>
          <div v-else-if="message.role ==='AI'" style="display: flex;flex-wrap:wrap;justify-content: start;padding: 8px;margin: 10px 0;">
            <div class="dataCont" style="width: 100%">{{getFormatData(message.created)}}</div>
            <div class="leftContainer chatContainer">
              <div class="contentBox">
<!--                <div class="content">{{ message.content }}</div>-->
<!--                <div v-html="md.render(markdownContent)"></div>-->
                <div class="content" v-html="parseMarkdown(message.content)"></div>
                <el-button class="contentButton" @click="aiSearchFlag=true">聚合搜索</el-button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </el-row>
    <!--   输入框   -->
    <el-row class="el-row-100-percent-w" style="padding: 12px 16px;display: flex;justify-content: center;border-top: 1px solid rgba(224, 224, 224, 1)">
      <!--        <el-button @click="sentMassage"></el-button>-->
      <div class="chat-container-send" style="width: 100%">
        <el-input
            v-model="message"
            class="custom-input"
            style="width: 100%"
            :autosize="{minRows: 3}"
            resize="none"
            type="textarea"
            @keydown="handleKeyDown"
            @compositionstart="isComposing = true"
            @compositionend="isComposing = false"
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
                v-if="!chatFluxStatus"
                round
                style="width: 80px;height: 30px;background: linear-gradient(249.61deg, #C7A0FF 0%, #8777FF 11.71%, #5280FC 49.68%, #54A4FF 74.23%, #3CD1F6 90.26%, #74FFCD 100%);"
            >
              <el-image class="headerIcons" :src="'/index/header/chat/fasong.svg'" style="margin-right: 4px"></el-image>
              <el-text style="font-size: 12px;color: white">{{'发送'}}</el-text>
            </el-button>
            <el-tooltip v-if="chatFluxStatus" content="点击停止输出" placement="top" effect="light">
              <el-button
                  class="send-button"
                  @click="sentMassage"
                  type="primary"
                  round
                  style="width: 80px;height: 30px;background: linear-gradient(249.61deg, #C7A0FF 0%, #8777FF 11.71%, #5280FC 49.68%, #54A4FF 74.23%, #3CD1F6 90.26%, #74FFCD 100%);"
              >
                <el-icon><Loading /></el-icon>
                <el-image class="headerIcons" :src="'/index/header/chat/fasong.svg'" style="margin-right: 4px"></el-image>
                <el-text style="font-size: 12px;color: white">{{'正在输出'}}</el-text>
              </el-button>
            </el-tooltip>
          </el-col>
        </el-row>

      </div>
    </el-row>
    <!--  历史对话dialog  -->
    <DialogTemplate v-model:dialogVisible="historyDialog" :change-close-status="()=>historyDialog=false" :on-confirm="clearHistory" :context="'确认清理历史对话!'"></DialogTemplate>
    <!--  ai搜索  -->
    <DialogTemplate v-model:dialogVisible="aiSearchFlag" :change-close-status="()=>aiSearchFlag=false" :on-confirm="findAiCondition" :context="'确认AI搜索!'"></DialogTemplate>
  </div>
</template>

<script setup>
import {onMounted,computed,ref,watch,nextTick} from "vue";
import {useStore} from 'vuex';
import { ElButton, ElMessage } from 'element-plus'
import { vChatScroll } from "vue3-chat-scroll";
import {fetchStream} from "@/api/chat/ChatUtil2";
import {clearChatHistory, getChatHistory, getCurrentConditionByChatId} from "@/api/chat/ChatApi";
import {getChatTemplate} from "@/views/search/dto/chat/ChatTemplate";
import DialogTemplate from "@/components/dialog/DialogTemplate.vue";
import { v4 as uuidv4 } from 'uuid';
import { Loading } from '@element-plus/icons-vue'
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
const store = useStore();

const props = defineProps({
  onCloseClick: {
    type: Function,
    required: true
  }
});
const message = ref(''); // 用于存储输入的消息
//用户信息
const userInfo = computed(() => store.getters.getUserInfo);
// 获取聊天容器的引用
const chatContainer = ref(null);
const userChatId = computed(() => store.getters.getLocalUserChatId);
//搜索id
const searchConditionId = computed(() => store.getters.getSearchConditionId);
//历史对话
const chatHistoryList = ref([]);
//loading效果
const historyLoading = ref(false);
//history确认弹窗
const historyDialog = ref(false);
const historyRef =ref(null);
//ai chat状态
const chatFluxStatus = ref(false);
//ai搜索开关
const aiSearchFlag = ref(false);
// 标记是否在输入法状态中
let isComposing = ref(false);



//初始化
onMounted(async ()=>{
  scrollToBottom();  // 调用滚动到底部的函数
});

const md = new MarkdownIt({
  highlight: function (str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return `<pre class="chatHtml"><code class="chatHtmlCode">${hljs.highlight(str, { language: lang }).value}</code></pre>`;
      } catch (e) {
        console.log(e)
      }
    }
    return `<pre class="chatHtml"><code class="chatHtmlCode">${md.utils.escapeHtml(str)}</code></pre>`;
  },
});
// 转换并清理 Markdown 内容
// 转换并清理 Markdown 内容
function parseMarkdown(content) {
  return md.render(content);
}

// 定义消息数据
const messages = computed(()=>store.getters.getChatMassages?store.getters.getChatMassages:[]);
// const messages = computed(() => {
//   const userId = userInfo.value?.id; // 使用可选链操作符
//   return userId ? store.getters.getUserMessages(userId) : [];
// });

// 处理按键事件
const handleKeyDown = (event) => {
  if(isComposing.value){
    return;
  }
  if (event.key === "Enter" && event.ctrlKey) {
    // Ctrl+Enter 换行
    message.value += "\n";
    event.preventDefault(); // 阻止默认的 Enter 行为
  } else if (event.key === "Enter") {
    // Enter 键发送消息
    event.preventDefault(); // 阻止默认换行行为
    if(chatFluxStatus.value){
      ElMessage.warning('正在输出内容，请稍等！');
      return;
    }
    sentMassage();
  }
};

//查询历史对话
const findHistoricalDialogue = async () => {
  historyLoading.value=true;
  try {
    const {data} = await getChatHistory(userChatId.value,userInfo.value.id);
    chatHistoryList.value = data.chatHistory;
  }catch (e){
    console.log(e);
    ElMessage.error('服务异常，请联系管理员！');
    chatHistoryList.value = [];
  }
  historyLoading.value=false;
}

const clearHistory = async () => {
  try {
    await clearChatHistory(userChatId.value,userInfo.value.id);
    ElMessage.success('操作成功！');
  }catch (e){
    console.log(e);
    ElMessage.error('服务异常，请联系管理员！');
  }
  historyDialog.value = false;
}

// 查询搜索条件
const findAiCondition = async () => {
  try {
    let {data} = await getCurrentConditionByChatId(userChatId.value);
    if(data){
      store.commit('changeSearchConditionRequestData',data);
    }
    if(props.onCloseClick){
      aiSearchFlag.value=false
      // setTimeout(async () => {
      //   props.onCloseClick();
      // },200);
      props.onCloseClick();
    }
  } catch (e) {
    console.log(e);
    ElMessage.error('服务异常，请联系管理员！');
  }
}


//发送对话
const sentMassage = () =>{
  if(chatFluxStatus.value){
    chatFluxStatus.value=false;
    return;
  }
  if(!message.value){
    return;
  }
  const userMsg = getChatTemplate();
  userMsg.content = message.value;
  userMsg.id =uuidv4();
  userMsg.chatId =userChatId.value;
  userMsg.searchConditionId = searchConditionId.value;
  userMsg.created = Math.floor(Date.now() / 1000);
  userMsg.role = "User";
  userMsg.userId = userInfo.value.id;
  store.commit('addMessageToQueue',userMsg);
  //messages.value.push(userMsg);
  message.value = '';
  scrollToBottom();  // 调用滚动到底部的函数
  invokeChat(userMsg);
}

// 发送对话
const invokeChat = (userMsg) => {
  if(!searchConditionId.value){
    ElMessage.error('系统无法监测到有效的搜索数据！');
    return;
  }
  const aiRequestMsg = {
    chatId: userMsg.chatId,
    userId: userMsg.userId,
    searchConditionId: userMsg.searchConditionId,
    prompt: userMsg.content,
  }
  //chatRequest.chatId = userChatId.value;
  //chatRequest.searchConditionId = searchConditionId.value;
  //发送ai 用户消息
  chatFluxStatus.value = true;
  fetchStream(
      process.env.VUE_APP_API_BASE_URL+"/ihire/chat/streamChat",
      aiRequestMsg,
      (message) => {
        try {
          const jsonString = message.replace(/^data:/, "").trim();
          if(!jsonString){
            return;
          }
          let json = JSON.parse(jsonString); // 解析流数据
          setMsgContainer(json);
        } catch (error) {
          chatFluxStatus.value = false;
          console.error("chat出列异常，Message parsing error:", error, message);
        }
        scrollToBottom();  // 调用滚动到底部的函数
      },
      (error) => {
        chatFluxStatus.value = false;
        console.error("Stream error:", error);
        console.log("chat结束了 Stream error",error)
      },()=>{
        chatFluxStatus.value = false;
        console.log("chat正常结束了 Stream end")
      }
  );
}

const setMsgContainer = (msg) => {
  const content = msg.choices?.[0]?.delta?.content; // 提取内容
  if (content) {
    if(content==='[DONE]'){
      console.log("chat结束了",content)
      chatFluxStatus.value = false;
      return;
    }
    const foundObject = messages.value.find(item => item.id === msg.id);
    if(foundObject){
      foundObject.content = foundObject.content+content;
    }else{
      const chatTemplate = getChatTemplate();
      chatTemplate.content = content;
      chatTemplate.id =msg.id;
      chatTemplate.chatId =msg.chatId;
      chatTemplate.searchConditionId = msg.searchConditionId;
      chatTemplate.model =msg.model;
      chatTemplate.object =msg.object;
      chatTemplate.created = msg.created;
      chatTemplate.role = "AI";
      //messages.value.push(chatTemplate);
      store.commit('addMessageToQueue',chatTemplate);
    }
  }
}


// 平滑滚动到底部的函数
const smoothScrollToBottom = () => {
  if (!chatContainer.value) return;

  const container = chatContainer.value;
  const start = container.scrollTop;
  const end = container.scrollHeight;
  const distance = end - start;
  const duration = 300; // 滚动动画持续时间，单位为毫秒
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
      smoothScrollToBottom();  // 平滑滚动到底部
    }
  });
};

const getFormatData =(timestamp)=>{
  const date = new Date(timestamp * 1000); // 转换为毫秒级时间戳
// 格式化为 "YYYY-MM-DD HH:mm"
  const formattedDate = date.toLocaleString('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false // 24小时制
  });
  return formattedDate;
}

</script>

<style scoped lang="scss">
.chat-container {
  height: 100%;
  width: 100%;
  //box-shadow: inset 1px 1px 20px 20px #dadada33;
  padding: 12px;
  overflow-y: auto;

  .dataCont{
    padding: 4px 8px;
    font-size: 13px;
    color: rgb(182, 184, 187);
    text-align: left;
  }

  .rightContainer{
    max-width: 75%;

    .content{
      padding: 8px 12px;
      border-radius: 10px 2px 10px 10px;
      background: #E6FFFB;
      font-size: 13px;
      font-weight: 400;
      color: rgba(31, 35, 41, 1);
      text-align: left;
      word-wrap: break-word; /* 允许单词在任意位置换行 */
      word-break: break-word; /* 兼容旧浏览器 */
      overflow-wrap: break-word; /* 现代浏览器支持 */
    }
  }

  .leftContainer{
    max-width: 75%;

    .contentBox{
      border-radius: 2px 10px 10px 10px;
      background: #FFFFFF;
      border: 1px solid #E8E8E8;
      padding: 12px;

      .content {
        width: 100%;
        font-size: 13px;
        font-weight: 400;
        color: rgba(31, 35, 41, 1);
        text-align: left;
        word-wrap: break-word; /* 允许单词在任意位置换行 */
        word-break: break-word; /* 兼容旧浏览器 */
        overflow-wrap: break-word; /* 现代浏览器支持 */

        ::v-deep(.chatHtml){
          white-space: pre-wrap;
          overflow-x: auto;
          background: #f5f5f5;
          padding: 10px;
          border-radius: 5px;
          font-size: 14px;
          font-family: 'Courier New', monospace;
          overflow-x: auto; /* 防止代码块溢出 */
        }
      }

      .contentButton{
        width: 100%;
        border-radius: 13px;
        background: linear-gradient(234.2deg, #C7A0FF 0%, #8777FF 11.71%, #5280FC 49.68%, #54A4FF 74.23%, #3CD1F6 90.26%, #74FFCD 100%);
        height: 26px;
        color: rgba(255, 255, 255, 1);
        font-size: 13px;
        font-weight: 400;
        margin-top: 15px;
      }

    }
  }

}
.chatWidth{
  width: 100%;
}
.chatTop{
  //padding: 8px 16px 0 16px;
}
.chatHeader{
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.98) 100%), linear-gradient(90deg, rgba(232, 248, 255, 1) 0%, rgba(237, 254, 246, 1) 25.15%, rgba(222, 255, 243, 1) 50.61%, rgba(229, 241, 255, 1) 74.68%, rgba(246, 238, 255, 1) 100%);
}
.headerIcons{
  cursor: pointer;
}
.chatListCard{
  padding: 12px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 1);
  border: 1px solid rgba(232, 232, 232, 1);

  .el-text-ellipsis{
    display: -webkit-box; /* 必须要设置为 WebKit 的盒模型 */
    -webkit-box-orient: vertical; /* 设置垂直排列 */
    -webkit-line-clamp: 2; /* 限制显示的行数 */
    overflow: hidden; /* 隐藏超出范围的内容 */
    text-overflow: ellipsis; /* 设置省略号 */
    word-wrap: break-word; /* 防止长单词撑破布局 */
    max-width: 220px; /* 根据需要设置最大宽度 */
    width: 220px;
  }
}

.custom-input {
  border: none !important; /* 去除外部容器的边框 */
  box-shadow: none !important; /* 去除阴影 */

  :hover{
    box-shadow: none !important;
  }
  :focus{
    box-shadow: none !important;
  }
}
::v-deep(.custom-input .el-textarea__inner) {
  box-shadow: none !important;
}

.chat-container-send{
  padding-right: 12px;
  padding-bottom: 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 1);
  border: 1px solid rgba(121, 96, 255, 1);
}
</style>

<style scoped lang="scss">
.hljs {
  padding: 10px;
  border-radius: 5px;
  background: #e70404 !important;
}
</style>