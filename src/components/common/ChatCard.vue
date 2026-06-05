<!-- 聊天卡片组件 (使用Morph动画) -->
<template>
  <q-card
    v-morph:chat-card:chat-morph:300.resize="morphState"
    class="chat-panel"
    :class="[
      embedded ? 'chat-panel-host' : expanded ? 'chat-panel-large' : 'chat-panel-small',
      !embedded && !expanded ? 'draggable-panel' : '',
      verticalExpanded && !expanded && !embedded ? 'vertical-expanded' : '',
      !embedded && expanded && visibleThirdSwitchPlus ? 'third-party-mode embedded' : ''
    ]"
    v-show="visible"
    :style="[
      embedded
        ? {}
        : expanded
        ? visibleThirdSwitchPlus
          ? chatPanelLargeStyle
          : largePanelStyle
        : panelPosition
    ]"
    ref="chatCardRef"
  >
    <!--
      Workspace Toolbar
      embedded=true 时由外层 WorkspaceContainer 提供统一 toolbar，本组件不重复渲染
      fixed/floating 模式下保留这块 toolbar（含放大/纵向放大/关闭按钮）
    -->
    <div v-if="!embedded" class="workspace-toolbar" @mousedown="!expanded && startDrag($event)">
      <div class="toolbar-left">
        <h2 class="toolbar-title">{{ currentJobTitle || "AI 聚合控制台" }}</h2>
        <span v-if="currentJobCode" class="toolbar-job-code">{{ currentJobCode }}</span>
      </div>
      <div class="toolbar-right">
        <q-btn
          flat
          round
          dense
          size="sm"
          :icon="expanded ? 'fullscreen_exit' : 'fullscreen'"
          @click="toggleExpand"
          :disable="isAnimating"
          class="toolbar-btn"
        >
          <q-tooltip>{{ expanded ? "缩小" : "放大" }}</q-tooltip>
        </q-btn>
        <q-btn
          flat
          round
          dense
          size="sm"
          :icon="verticalExpanded ? 'unfold_less' : 'unfold_more'"
          @click="toggleVerticalExpand"
          :disable="isAnimating"
          class="toolbar-btn"
        >
          <q-tooltip>{{ verticalExpanded ? "纵向缩小" : "纵向放大" }}</q-tooltip>
        </q-btn>
        <q-btn
          flat
          round
          dense
          size="sm"
          icon="remove"
          @click="$emit('close')"
          :disable="isAnimating"
          class="toolbar-btn"
        />
      </div>
    </div>

    <q-card-section
      class="chat-content"
      :class="{ 'expanded-content': expanded }"
      style="cursor: auto"
    >
      <!--
        客户端嵌入式模式：未选职位 → ChatEmptyState 引导
        其它（浏览器模式 / 浮窗 / 已有职位但无消息）保持原 hint 空占位
      -->
      <ChatEmptyState v-if="shouldShowEmptyState" :selected-job="null" />
      <div
        v-else-if="messages.length === 0 && internalMessages.length === 0"
        class="text-center text-grey q-pa-md empty-message-hint"
      ></div>
      <div v-else-if="loading" class="loading-container">
        <q-spinner color="primary" size="3em" />
        <div class="q-mt-sm text-grey">正在加载聊天历史...</div>
      </div>
      <div v-else class="chat-messages">
        <!--
          顶部分页 hint（向上滚动加载更早历史）：
            - loadingMore=true → 加载中 spinner
            - hasNext=false 且翻过页 → "已加载全部历史"
            - hasNext=true → 不显示，等用户滚动到顶触发 loadMoreHistory
          滚动监听在 onMounted 绑定 .chat-content 的 scroll 事件
        -->
        <div v-if="historyLoadingMore" class="chat-history-hint loading">
          <q-spinner color="primary" size="1em" />
          <span>正在加载更早的消息...</span>
        </div>
        <div
          v-else-if="historyPagination.pageNo > 1 && !historyPagination.hasNext"
          class="chat-history-hint end"
        >
          已加载全部历史
        </div>
        <div
          v-for="(msg, index) in displayMessages"
          :key="msg.id || index"
          :class="['chat-message', msg.type === 'user' ? 'chat-message-user' : 'chat-message-bot']"
        >
          <div class="chat-message-avatar">
            <q-avatar
              v-if="!visibleThirdSwitchPlus"
              size="28px"
              :color="msg.type === 'user' ? 'primary' : 'secondary'"
              text-color="white"
              :class="`${msg.type === 'user' ? 'invisible' : ''}`"
            >
              AI
            </q-avatar>
            <q-avatar v-else size="28px" :class="`${msg.type === 'user' ? 'invisible' : ''}`">
              <img src="/image/AIavatar.png" />
            </q-avatar>
          </div>
          <div class="chat-message-content">
            <div class="chat-message-bubble">
              <!--
                bot 消息分三种渲染：
                  1. 含 [&AI_SEARCH&] 且能成功解析出结构化 JD 数据
                     → 用 AIProfileCard（1:1 复刻 ihraisaas 风格）渲染基础字段 + chip 列表 +
                       ActionPanel（搜索牛人 / 推荐牛人 + 配置卡片）
                  2. 含 [&AI_SEARCH&] 但解析失败（结构变了 / 老数据）→ fallback 老 ai-jd-container
                  3. 普通 bot 消息 → 直接 v-html
              -->
              <template
                v-if="msg.type === 'bot' && msg.content && msg.content.includes('[&AI_SEARCH&]')"
              >
                <template v-if="parseAISearchJD(msg.content)">
                  <!-- 结构化 profile 卡片：自带 header（标题 + 复制/编辑）+ ActionPanel（底部启动聚合搜索按钮） -->
                  <AIProfileCard
                    :profile="parseAISearchJD(msg.content)"
                    @copy="handleCopy(msg.content ? msg.content.replace('[&AI_SEARCH&]', '') : '')"
                    @edit="handleEdit(msg)"
                    @save="(p) => onAiProfileSkillsSave(msg, p)"
                  >
                    <template #action>
                      <AIProfileActionPanel
                        v-if="!(chatFluxStatus && index === displayMessages.length - 1)"
                        :message="msg"
                        :disabled="hasResultCardAfter(index)"
                        @change="(s) => handleActionPanelChange(msg, s)"
                        @aggregate="() => handleSearch(msg)"
                        @clear-and-restart="(s) => onAiPanelRetry(msg, 'RESTART', s)"
                        @keep-and-increment="(s) => onAiPanelRetry(msg, 'CONTINUE', s)"
                        @view-results="emit('view-results')"
                      />
                    </template>
                  </AIProfileCard>
                </template>
                <!-- fallback：解析失败时用老的 markdown 渲染 + ActionPanel -->
                <div v-else class="ai-jd-container">
                  <div
                    class="ai-jd-content"
                    v-html="parseMarkdown(msg.content.replace('[&AI_SEARCH&]', ''))"
                  ></div>
                  <AIProfileActionPanel
                    v-if="!(chatFluxStatus && index === displayMessages.length - 1)"
                    :message="msg"
                    :disabled="hasResultCardAfter(index)"
                    @change="(s) => handleActionPanelChange(msg, s)"
                    @aggregate="() => handleSearch(msg)"
                    @clear-and-restart="(s) => onAiPanelRetry(msg, 'RESTART', s)"
                    @keep-and-increment="(s) => onAiPanelRetry(msg, 'CONTINUE', s)"
                    @view-results="emit('view-results')"
                  />
                </div>
              </template>
              <!--
                聚合搜索执行进度卡片（msg.type === 'execution_log'）
                1:1 对照 ihraisaas/src/components/AIAssistant/Chat/ExecutionLog.tsx
                msg 形态：{ id, type:'execution_log', content: '...流程', steps: [{title,status}], data: {isStopped} }
              -->
              <ExecutionLog
                v-else-if="msg.type === 'execution_log'"
                :content="msg.content"
                :steps="msg.steps"
                :data="msg.data"
              />
              <!--
                聚合搜索任务真实状态卡片（msg.type === 'task_status'）
                绑定 SearchTasks store 的某个 taskId，内部 computed 跟随 task.channels 状态 reactive 更新。
                注意：未绑定 taskId（pending 初始化）时显示"正在初始化任务..."loading 文案。
              -->
              <TaskStatusCard
                v-else-if="msg.type === 'task_status'"
                :task-id="msg.taskId || ''"
                :force-stopped="!!msg.isStopped"
                :kind="msg.kind || 'all'"
              />
              <!--
                任务完成卡片（msg.type === 'task_completion_card'）：
                  - 用 Vue 组件 TaskCompletionCard 渲染，props 全部来自 msg.cardData
                  - 跟 server_html（后端推的整段 HTML）的区别：本路径前端拿结构化数据自己渲染，
                    可控性更强（按钮交互、样式微调都方便）
                  - 后端模板源就是 TaskCompletionCard.vue 的 <template>，含 `{{ }}` 占位
              -->
              <TaskCompletionCard
                v-else-if="msg.type === 'task_completion_card'"
                :html="msg.html || ''"
                :show-retry-actions="msg.id === lastCompletionCardId"
                @view-result="onTaskCardViewResult(msg, $event)"
                @clear-and-restart="onTaskCardClearAndRestart(msg, $event)"
                @keep-and-increment="onTaskCardKeepAndIncrement(msg, $event)"
                @unknown-action="onTaskCardUnknownAction(msg, $event)"
              />
              <!--
                再次启动聚合搜索的配置卡（msg.type === 'retry_config_card'）：
                  - 由点击 task_completion_card 的「保留增量」/「清空重新」插入
                  - **仅当原任务包含 BOSS 推荐时才插**：用户需要重新指定本次"简历份数"
                  - 用户在卡片里改份数 → 点"启动聚合搜索" → emit start → 真正调聚合搜索
                  - 不含推荐的纯搜索任务直接重启，不插这张卡（行为不变）
              -->
              <RetryConfigCard
                v-else-if="msg.type === 'retry_config_card'"
                :card-data="msg.cardData || {}"
                @start="onRetryConfigStart(msg, $event)"
              />
              <!--
                服务端 SSE 推过来的富文本卡片消息（scenario='CHAT'，messageType=TASK_COMPLETION_CARD 等），
                content 已经是后端拼好的完整 HTML，直接 v-html 渲染。
                跟普通 bot 消息（v-html=parseMarkdown）区分开：后端 HTML 不要再过 markdown-it 一遍，避免被破坏。
              -->
              <div
                v-else-if="msg.type === 'server_html'"
                class="server-html-card"
                v-html="msg.content || ''"
              ></div>
              <div v-else-if="msg.type === 'bot'" v-html="parseMarkdown(msg.content || '')"></div>
              <div v-else class="bot-message-formatted">{{ msg.content || "" }}</div>

              <!-- 添加AI输出中的动画 -->
              <div
                v-if="chatFluxStatus && index === displayMessages.length - 1 && msg.type === 'bot'"
                class="typing-indicator"
              >
                <span>~~</span>
                <span>~~</span>
                <span>~~</span>
              </div>
            </div>

            <!--
              消息操作按钮（旧 message-actions）
                - AI_SEARCH 消息：复制/编辑/聚合搜索 三个按钮已迁移到 AIProfileCard header / ActionPanel 底部，
                  这里只保留时间显示（避免冗余）；
                - 普通 bot 消息：保留"复制"按钮
            -->
            <div
              v-if="msg.type === 'bot' && !(chatFluxStatus && index === displayMessages.length - 1)"
              class="message-actions"
            >
              <div class="chat-message-time text-grey-6">{{ msg.time || "" }}</div>
              <q-btn
                v-if="!chatFluxStatus && !(msg.content && msg.content.includes('[&AI_SEARCH&]'))"
                class="btn-common"
                flat
                size="sm"
                icon="content_copy"
                @click="handleCopy(msg.content || '')"
                outline
                color="primary"
                text-color="#1F2329"
                label="复制"
              >
                <q-tooltip>复制</q-tooltip>
              </q-btn>
            </div>
          </div>
        </div>
      </div>
    </q-card-section>

    <!--
      centered-input 让输入框居中显示（浏览器"新聊天"初始化用）；
      嵌入式（visibleThirdSwitchPlus）模式下 ChatEmptyState 已经占中间，输入框必须**固定底部**避免重叠。
    -->
    <q-card-section
      style="cursor: auto"
      :key="isFirstMessage ? 'bottom-input' : 'center-input'"
      :class="[
        'chat-input q-pa-sm q-my-md',
        {
          'centered-input':
            !visibleThirdSwitchPlus &&
            isNewChat &&
            messages.length === 0 &&
            internalMessages.length === 0 &&
            !isFirstMessage
        }
      ]"
    >
      <!--
        老的初始化展示内容（"AI 智能招聘助手 / 快速筛选合适的候选人"）
        客户端 / iHR 融合（PlanA）模式下由 ChatEmptyState（chat-content 内）统一负责空状态，这块不再显示
      -->
      <div
        v-if="
          !visibleThirdSwitchPlus &&
          isNewChat &&
          messages.length === 0 &&
          internalMessages.length === 0 &&
          !isFirstMessage
        "
        class="q-pa-md q-mb-md rounded-borders"
      >
        <div class="text-center q-mb-md">
          <q-avatar size="xl">
            <img src="/logo/logo2.svg" />
          </q-avatar>
        </div>
        <div class="text-h5 text-primary text-center q-mb-md text-bold">AI 智能招聘助手</div>
        <div class="q-mb-sm text-center">
          <q-badge rounded class="bg-transparent text-grey-8">
            <q-icon name="search" size="sm" class="q-mr-sm" />
            <span class="text-subtitle1 text-weight-medium">快速筛选合适的候选人</span>
          </q-badge>
        </div>
        <div class="text-center">
          <q-badge class="bg-transparent text-grey-8">
            <q-icon name="analytics" size="sm" class="q-mr-sm" />
            <span class="text-subtitle1 text-weight-medium">分析简历要点和技能匹配度</span>
          </q-badge>
        </div>
      </div>
      <!--  输入框    -->
      <div class="input-container">
        <!--
          输入框 disable 三种情况（优先级 isTaskRunning > emptyState）：
            1) shouldShowEmptyState：还没选职位 → 禁用 + 提示选职位
            2) isTaskRunningForCurrentChat：当前 chat 有任务跑中 → 禁用 + 提示等任务完成
            3) 其它：正常输入

          enter 键发送也要拦：keydown 时 check 这两个 flag，命中就 prevent 不调 sendChatMessage
        -->
        <q-input
          v-model="chatMessage"
          borderless
          type="textarea"
          autogrow
          :disable="shouldShowEmptyState || isTaskRunningForCurrentChat"
          :input-style="{
            maxHeight: inputMaxHeight,
            minHeight: '40px',
            height: '40px',
            overflow: 'auto',
            resize: 'none'
          }"
          :placeholder="
            shouldShowEmptyState
              ? '请从左侧列表选择职位开始'
              : isTaskRunningForCurrentChat
              ? '当前任务进行中，请等待任务完成后再发送消息'
              : '给[i快招]AI发送消息，示例：发送一段招聘JD'
          "
          class="full-width message-input"
          @keydown.enter.exact.prevent="onEnterPress"
          @keydown.shift.enter.prevent="newLine"
        >
          <template v-slot:hint v-if="!chatFluxStatus && !isTaskRunningForCurrentChat">
            <span class="text-grey-6">Shift+Enter 换行，Enter 发送</span>
          </template>
        </q-input>

        <div class="send-button-container">
          <q-badge class="bg-transparent text-grey-8"> Shift+Enter 换行，Enter 发送 </q-badge>
          <!--
            统一用同一个 q-btn round dense（位置/大小/形状完全一致），
            只按当前状态切换 color/icon/click：
              1) isTaskRunningForCurrentChat：当前 chat 有跑中的聚合搜索任务
                 → 红色 stop icon，点击调 SearchTasks/stopForChat 终止整个任务
              2) chatFluxStatus：AI 流式回复进行中
                 → 蓝色 send icon + loading，点击 abort 当前 stream（原有逻辑）
              3) 默认 → 蓝色 send icon，点击发送消息
          -->
          <q-btn
            round
            dense
            :loading="!isTaskRunningForCurrentChat && chatFluxStatus"
            :disable="shouldShowEmptyState"
            :color="isTaskRunningForCurrentChat ? 'negative' : 'primary'"
            :icon="isTaskRunningForCurrentChat ? 'stop' : 'send'"
            @click="isTaskRunningForCurrentChat ? handleStopTask() : sendChatMessage()"
            class="send-button"
          >
            <q-tooltip>{{
              shouldShowEmptyState
                ? "请先从左侧列表选择职位"
                : isTaskRunningForCurrentChat
                ? "停止当前搜索任务"
                : chatFluxStatus
                ? "停止输出"
                : "发送"
            }}</q-tooltip>
          </q-btn>
        </div>
      </div>
    </q-card-section>

    <!--
      客户端模式专用：渠道未全登录时显示"请先登录招聘渠道"面板。
      放在 q-card 内最末尾 + absolute inset-0，覆盖**整个聊天卡片**（标题 + 内容 + 输入框）。
      模糊背景能盖住下方所有 UI，效果更明显。
    -->
    <LoginRequiredPanel
      v-if="showLoginRequiredPanel"
      class="chat-login-overlay"
      @complete="handleLoginRequiredComplete"
      @dismiss="handleLoginRequiredDismiss"
    />
  </q-card>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from "vue";
import { useStore } from "vuex";
import { useQuasar } from "quasar";
import MarkdownIt from "markdown-it";
import hljs from "highlight.js";
import {
  getChatHistory,
  getCurrentConditionByChatId,
  clearChatHistory
} from "src/api/chat/ChatApi";
import { fetchStream } from "src/api/chat/ChatUtil2";
import { v4 as uuidv4 } from "uuid";
import LoginRequiredPanel from "src/components/clients/LoginRequiredPanel.vue";
import AIProfileActionPanel from "src/components/clients/AIProfileActionPanel.vue";
import AIProfileCard from "src/components/clients/AIProfileCard.vue";
import ExecutionLog from "src/components/clients/ExecutionLog.vue";
import TaskStatusCard from "src/components/clients/TaskStatusCard.vue";
import TaskCompletionCard from "src/components/clients/TaskCompletionCard.vue";
import RetryConfigCard from "src/components/clients/RetryConfigCard.vue";
import {
  isTaskCompletionCardHtml,
  isTaskChannelProgressCardJson
} from "src/util/taskCompletionTemplate";
import ChatEmptyState from "src/components/clients/ChatEmptyState.vue";
import { parseAISearchJD, getAISearchPrefix } from "src/util/parseAISearchJD";
import { isElectronClient } from "src/util/openChannelLoginUrl";

const store = useStore();
const $q = useQuasar();

/* ============ 客户端模式：渠道未登录时挡住聊天，提示先登录 ============ */

// 用户主动关闭"请先登录"面板后这里置 true；后续 chatId 变化（切换会话）会重置
const loginRequiredDismissed = ref(false);
// 面板「打开」状态：一旦满足条件打开后保持，直到用户「稍后再说/开始搜索」或切换会话才关。
// —— 不随渠道启用/登录态变化自动关，避免「点勾选框（启用/禁用）面板就自动消失」。
const loginPanelOpen = ref(false);

// 是否「需要」登录面板（纯条件判定，不直接控制显隐，只用来决定何时打开）
const loginRequiredCondition = computed(() => {
  if (!isElectronClient()) return false;
  const conf = store.getters.getChannelConf || {};
  const userCfg = store.getters.getUserChannelConfig || [];
  const isEnabled = (k) => {
    if (!Array.isArray(userCfg) || userCfg.length === 0) return true;
    const e = userCfg.find((c) => c.key === k);
    return e ? !!e.enableConfig : true;
  };
  const keys = ["BOSS", "ZHILIAN", "JOB51"].filter(isEnabled);
  // 没启用任何渠道 → 也需要弹（面板里可勾选启用渠道 + 去登录，参考 ihraisaas 交互）
  if (keys.length === 0) return true;
  // 任一已启用渠道未登录就需要弹
  return keys.some((k) => !conf[k]?.login);
});

// 满足条件就打开面板（沾性：打开后不因 toggle/登录态变化自动关）
watch(
  loginRequiredCondition,
  (need) => {
    if (need && !loginRequiredDismissed.value) loginPanelOpen.value = true;
  },
  { immediate: true }
);

const showLoginRequiredPanel = computed(
  () => loginPanelOpen.value && !loginRequiredDismissed.value
);

function handleLoginRequiredComplete() {
  // 全部登录完了，用户点"开始搜索"——关掉面板
  loginRequiredDismissed.value = true;
  loginPanelOpen.value = false;
}

function handleLoginRequiredDismiss() {
  // 用户点"稍后再说"——暂时关掉，本会话内不再显示
  loginRequiredDismissed.value = true;
  loginPanelOpen.value = false;
}

/**
 * 外部强制打开「未检测到登录状态」面板（供 IndexPage 在「没启用任何渠道就点搜索」时调用，
 * 直接弹这个面板让用户勾选启用渠道 + 去登录，替代原来的 toast 提示）。
 */
function forceShowLoginRequired() {
  // ★ 清掉刚才「创建任务」流程已 push 的占位卡 + pending 绑定记录。
  //   否则 IndexPage 因「没启用渠道」拒绝创建后，占位永远绑不上 →
  //   _hasInflightTaskForChat 一直为 true → 再次点创建被「该 chat 已有在途任务」挡掉、不再弹面板。
  const chatId = currentChatId.value || props.chatId;
  if (chatId) _removeOldTaskCardsForChat(chatId);
  loginRequiredDismissed.value = false;
  loginPanelOpen.value = true;
}
// 注：每次切会话重置 dismissed 的 watch 放在下方 props 定义之后

/* ============ AI 职位画像 action 面板状态：搜索/推荐 模块 + Boss 职位 + 简历数 ============ */
// 按 msg.id 索引；后续"聚合搜索"按钮触发时读这里的值作为入参
const actionPanelStateByMsgId = ref({});

function handleActionPanelChange(msg, state) {
  if (!msg || !msg.id) return;
  actionPanelStateByMsgId.value = {
    ...actionPanelStateByMsgId.value,
    [msg.id]: state
  };
}

/** 给"聚合搜索"等按钮读用 */
function getActionPanelState(msg) {
  return actionPanelStateByMsgId.value[msg?.id] || null;
}
// 暂存到本地变量，避免未使用 lint 报警；如父组件需要可改 defineExpose 暴露
void getActionPanelState;

// Markdown配置
const md = new MarkdownIt({
  html: true,
  highlight: (str, lang) => {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(str, { language: lang }).value;
      } catch (err) {
        console.warn("Failed to highlight:", err);
        return str;
      }
    }
    return str;
  }
});

// 添加流式响应相关状态
const chatFluxStatus = ref(false);
const abortController = ref(null);
const loading = ref(false);
const sending = ref(false);
const isComposing = ref(false);
const currentChatId = ref("");
const userInfo = computed(() => store.getters.getUserInfo);
const latestChatId = computed(() => store.getters.getLatestChatId);

/**
 * 当前 chat 是否有"正在跑"的聚合搜索任务（含 RUNNING / WAITING / RESTING +
 * COMPLETED 但 AI 评分还没跑完的过渡态）。
 *
 * 用 SearchTasks/canCreateForChat 反推：能创建 = 没活跃任务；不能创建 = 有活跃任务。
 * 实现已经覆盖了"任务收敛 COMPLETED 但本 chat AI 评分还在跑"这种 corner case。
 *
 * 用途：发送按钮三态切换的关键 flag（见模板 send-button-container）。
 */
const isTaskRunningForCurrentChat = computed(() => {
  const cid = currentChatId.value || latestChatId.value;
  if (!cid) return false;
  const canCreate = store.getters["SearchTasks/canCreateForChat"];
  return typeof canCreate === "function" && !canCreate(cid);
});

/**
 * 用户点红色"停止"按钮 → 调 SearchTasks/stopForChat 终止整个任务。
 *
 * 流程：finishChannel(STOPPED) × N + 停 scoreUpdater + 标记本地 task STOPPED。
 * humanize+pagination 循环还在跑的话不会立刻 abort，但 task 已 STOPPED 后端会
 * 拒绝后续 /results /detail 调用，不会污染数据。
 *
 * 业务侧后续可在 humanize 循环每轮顶部加 check `state.userStoppedTaskIds[taskId]`
 * 实现立即 abort（state 字段已铺好）。
 */
/**
 * 输入框 Enter 键 handler。
 *
 * 任务跑中 / 空状态时**忽略** Enter 不发送（同时 q-input disable 也会阻止输入，
 * 这里是双保险——避免用户在 disable 一瞬间按 Enter 触发到 sendChatMessage）。
 */
const onEnterPress = () => {
  if (shouldShowEmptyState.value || isTaskRunningForCurrentChat.value) {
    console.log("[ChatCard] Enter 被忽略：emptyState 或 taskRunning");
    return;
  }
  sendChatMessage();
};

const handleStopTask = async () => {
  const cid = currentChatId.value || latestChatId.value;
  if (!cid) {
    console.warn("[ChatCard] handleStopTask: 没有 chatId，跳过");
    return;
  }
  console.log("[ChatCard] 用户点击红色停止按钮 chatId=", cid);
  try {
    const res = await store.dispatch("SearchTasks/stopForChat", cid);
    if (res?.ok) {
      $q.notify({
        type: "positive",
        message: res.message || "已停止当前搜索任务",
        timeout: 2500,
        position: "top"
      });
    } else {
      $q.notify({
        type: "warning",
        message: res?.message || "停止任务失败",
        timeout: 3000,
        position: "top"
      });
    }
  } catch (e) {
    console.error("[ChatCard] handleStopTask 异常:", e);
    $q.notify({
      type: "negative",
      message: `停止任务失败：${e?.message || e}`,
      timeout: 3000,
      position: "top"
    });
  }
};

/**
 * 嵌入式模式下：用户主动选中的职位实体（UI 空状态的唯一判定依据）
 *
 * 数据源：store.chatList.chosenJobId（独立 key，由 LeftMenu selectChat 设置，
 *        persisted 到 localStorage）。跟业务用的 latestChatId **完全解耦**。
 *
 * 这样设计的好处：
 *   - 清空 localStorage 的 `vuex.chatList.chosenJobId` 即可复现"请先选择职位"空状态
 *   - 业务 SSO / 聊天加载等流程对 latestChatId 的隐式 set 不会污染 UI 状态
 */
const chosenJobId = computed(() => store.getters.getChosenJobId || "");
const currentEmbeddedChat = computed(() => {
  const id = chosenJobId.value;
  if (!id) return null;
  const list = store.getters.getChatList || [];
  // 优先按 positionId 匹配；找不到再按 id 匹配（兜底兼容）
  return list.find((c) => c && (c.positionId === id || c.id === id)) || null;
});

/**
 * 是否显示 ChatEmptyState（"请从左侧列表选择职位开始"）
 *   - 在客户端 / iHR 融合（PlanA）模式下生效
 *   - 用户当前未选中任何职位时显示
 *
 * 实现要点：
 *   - 用 visibleThirdSwitchPlus 而非 props.embedded，避免 HMR / 父组件 prop 传递异常时空状态丢失
 *   - **只看 chosenJobId 是否为空**，不去 chatList 里 find；
 *     否则 chatList 异步加载完成前 find 返回 null，会出现"先显示后消失"的闪烁
 */
const shouldShowEmptyState = computed(() => visibleThirdSwitchPlus.value && !chosenJobId.value);

/* ===========================================================================
 * 「启动聚合搜索 / 保留增量 / 清空重新」三入口共用的 500ms 时间窗防抖
 *
 * 背景：三个按钮最终都 emit('aggregate-search') 给 IndexPage.handleAggregateSearch
 * 处理，handleAggregateSearch 内部 `prepareConditionOnly + dispatchTaskStore` 是
 * 异步链路（含 saveCondition 网络请求 + create 接口），整个跑完可能要 1-3s。
 * 期间 SearchTasks/canCreateForChat 仍返回 true（task 还没真正落到 store），
 * 用户连点会触发多次 dispatch → 创建多个任务。
 *
 * 解决：在 ChatCard 三个入口都过一道时间窗防抖（同一职位 chat 维度），
 * 阻挡 500ms 内的二次点击。配合 IndexPage 内 _dispatchTaskInProgress flag 兜底。
 * ========================================================================== */
const AGGREGATE_DEBOUNCE_MS = 500;
const _lastAggregateClickTsByChat = new Map(); // chatId -> ts

/**
 * @param {string} chatIdForSearch
 * @param {string} label    'INITIAL' | 'CONTINUE' | 'RESTART'，仅用于日志
 * @returns {boolean} true = 被防抖拦截（caller 应直接 return）
 */
function _isAggregateClickDebounced(chatIdForSearch, label) {
  const now = Date.now();
  const last = _lastAggregateClickTsByChat.get(chatIdForSearch) || 0;
  const elapsed = now - last;
  if (elapsed < AGGREGATE_DEBOUNCE_MS) {
    console.warn(
      `[ChatCard] ${label} 被 500ms 防抖拦截（距上次 ${elapsed}ms），忽略本次点击 chat=${chatIdForSearch}`
    );
    return true;
  }
  _lastAggregateClickTsByChat.set(chatIdForSearch, now);
  return false;
}

/**
 * 当前选中职位标题 + 代码（用在 workspace toolbar 左侧）
 * chat.name 现存格式如 "研发 (10001)" / "测试 (10002)"：左半为职位名，括号内为代码
 * 解析失败时 title=整个 name，code=''
 */
const currentChatEntity = computed(() => {
  const id = latestChatId.value;
  if (!id) return null;
  const getById = store.getters.getChatById;
  return typeof getById === "function" ? getById(id) : null;
});
const currentJobTitle = computed(() => {
  const name = currentChatEntity.value?.name || "";
  if (!name) return "";
  const m = name.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  return m ? m[1].trim() : name.trim();
});
const currentJobCode = computed(() => {
  const name = currentChatEntity.value?.name || "";
  const m = name.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  return m ? m[2].trim() : "";
});
const isFirstMessage = ref(false);
const isNewChat = ref(true);
//jobSearchFilterRef
const jobSearchFilterRef = computed(() => store.getters.getJobSearchFilterRefValue);

const msgYYY =
  "我已经为你生成了大致搜索条件，系统会依据这个生成完整搜索条件来精准查找合适简历。大致搜索条件是：2025 届毕业生，本科及以上计算机相关专业，对算法有兴趣，强编码能力，熟悉 linux 开发环境，掌握机器学习等相关技术，有相关领域经验优先。接下来系统会自动处理，你稍作等待就能看到符合要求的简历啦。\n" +
  "[&AI_SEARCH&]\n" +
  "\n" +
  "<div style='background: #f8f9fa; border: 1px solid #ddd; border-radius: 8px; padding: 15px; margin: 10px 0;'><div><div style='display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 10px;'><div style='flex: 1 1 45%; min-width: 200px;'><div style='font-weight: bold; margin-bottom: 3px;'>职位：</div><div style='color: #333; padding: 3px 0; font-size: 14px;'>算法工程师</div></div><div style='flex: 1 1 45%; min-width: 200px;'><div style='font-weight: bold; margin-bottom: 3px;'>工作经验：</div><div style='color: #333; padding: 3px 0; font-size: 14px;'>应届生</div></div><div style='flex: 1 1 45%; min-width: 200px;'><div style='font-weight: bold; margin-bottom: 3px;'>学历要求：</div><div style='color: #333; padding: 3px 0; font-size: 14px;'>本科/硕士/博士</div></div></div><div style='margin-top: 5px;'><div style='margin-bottom: 8px;'><div style='font-weight: bold; margin-bottom: 4px;'>专业技能：</div><div style='display: flex; flex-wrap: wrap; gap: 5px;'><div style='background: #e6f7ff; color: #1890ff; border: 1px solid #91d5ff; border-radius: 4px; padding: 2px 8px; display: inline-block; margin-right: 5px; margin-bottom: 5px; font-size: 13px;'>具备强悍的编码能力，熟悉linux开发环境，熟悉Hadoop/Hive优先</div><div style='background: #e6f7ff; color: #1890ff; border: 1px solid #91d5ff; border-radius: 4px; padding: 2px 8px; display: inline-block; margin-right: 5px; margin-bottom: 5px; font-size: 13px;'>具备扎实的数据结构功底，熟悉机器学习、深度学习、图计算、自然语言处理、数据挖掘、分布式计算中一项或多项</div></div></div><div style='margin-bottom: 8px;'><div style='font-weight: bold; margin-bottom: 4px;'>软实力要求：</div><div style='display: flex; flex-wrap: wrap; gap: 5px;'><div style='background: #f6ffed; color: #52c41a; border: 1px solid #b7eb8f; border-radius: 4px; padding: 2px 8px; display: inline-block; margin-right: 5px; margin-bottom: 5px; font-size: 13px;'>具备较好的数理基础和逻辑分析能力</div><div style='background: #f6ffed; color: #52c41a; border: 1px solid #b7eb8f; border-radius: 4px; padding: 2px 8px; display: inline-block; margin-right: 5px; margin-bottom: 5px; font-size: 13px;'>对解决具有挑战性的问题充满激情</div><div style='background: #f6ffed; color: #52c41a; border: 1px solid #b7eb8f; border-radius: 4px; padding: 2px 8px; display: inline-panel; margin-right: 5px; margin-bottom: 5px; font-size: 13px;'>具备较好的主动性和团队合作精神</div></div></div><div style='margin-bottom: 8px;'><div style='font-weight: bold; margin-bottom: 4px;'>相关经历：</div><div style='display: flex; flex-wrap: wrap; gap: 5px;'><div style='background: #fff7e6; color: #fa8c16; border: 1px solid #ffd591; border-radius: 4px; padding: 2px 8px; display: inline-block; margin-right: 5px; margin-bottom: 5px; font-size: 13px;'>有搜索引擎、推荐系统、计算广告、图像、互联网风控、智能客服、平台治理等相关领域经验者优先</div></div></div></div></div>";
// 添加内部消息列表
const internalMessages = ref([]);

// 合并消息列表（优先使用内部消息，如果内部没有则使用props传入的）
const displayMessages = computed(() => {
  const raw = internalMessages.value.length > 0 ? internalMessages.value : props.messages;

  // ★ 排队中（WAITING）不显示 task_status 卡片（用户要求：真正开始执行才插入卡片）
  //
  // 数据层面：internalMessages 里仍然保留占位 msg（pendingTaskBindingsByChat /
  // sessionStartedTaskIds 这些回填机制依赖它）。这里只在渲染层 filter 掉，
  // 当 task 进入 RUNNING / 终态时 computed 自动重算 → 卡片立刻显形。
  //
  // 过滤规则：
  //   - 不是 task_status → 一律保留
  //   - isStopped（任务创建失败）→ 保留（显示失败提示）
  //   - 没绑 taskId（占位刚 push，create 还没回）→ 隐藏
  //   - task 还在 store 没同步 → 隐藏（短暂窗口期）
  //   - task.taskStatus === 'WAITING'（排队中）→ 隐藏
  //   - 其它（RUNNING / RESTING / 终态）→ 保留
  const getTaskById = store.getters["SearchTasks/getTaskById"];
  return raw.filter((msg) => {
    if (msg?.type !== "task_status") return true;
    if (msg.isStopped) return true;
    if (!msg.taskId) return false;
    if (typeof getTaskById !== "function") return false;
    const task = getTaskById(msg.taskId);
    if (!task) return false;
    if (task.taskStatus === "WAITING") return false;
    return true;
  });
});

/**
 * 最新一张 task_completion_card 的 msg.id。
 *
 * 只有它显示"清空重新搜索 / 保留增量搜索"再发起按钮；历史完成卡只保留"查看结果"
 * （避免用户对旧任务误触发重新搜索）。基于 displayMessages 倒序找第一张完成卡。
 */
const lastCompletionCardId = computed(() => {
  const list = displayMessages.value;
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i]?.type === "task_completion_card") return list[i].id;
  }
  return null;
});

/**
 * 该 AI 职位画像卡（AI_SEARCH 消息）后面是否已经有"结果卡片"（任务状态 / 完成卡 / 重试配置 /
 * 执行日志）。有 → 说明这张画像卡已经发起过搜索，按钮应禁用，避免对旧画像卡重复发起。
 */
const RESULT_CARD_TYPES = [
  "task_status",
  "task_completion_card",
  "retry_config_card",
  "execution_log"
];
function hasResultCardAfter(index) {
  const list = displayMessages.value;
  for (let i = index + 1; i < list.length; i++) {
    if (RESULT_CARD_TYPES.includes(list[i]?.type)) return true;
  }
  return false;
}

// 定义组件属性
const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  expanded: {
    type: Boolean,
    default: false
  },
  morphState: {
    type: String,
    default: "chat-card"
  },
  messages: {
    type: Array,
    default: () => []
  },
  containerWidth: {
    type: Number,
    default: 0
  },
  containerHeight: {
    type: Number,
    default: 0
  },
  containerTop: {
    type: Number,
    default: 48
  },
  containerLeft: {
    type: Number,
    default: 280
  },
  // 添加流式响应的props
  enableStream: {
    type: Boolean,
    default: true
  },
  chatId: {
    type: String,
    default: ""
  },
  /**
   * 嵌入式模式：作为 WorkspaceContainer 的子组件挂载在白色大卡片内。
   * 此模式下：
   *   - 不渲染自己的 workspace-toolbar（由外层 WorkspaceContainer 提供）
   *   - 不使用 fixed 定位，撑满父容器
   *   - 强制 expanded=true 视为放大态（无放大/缩小按钮）
   */
  embedded: {
    type: Boolean,
    default: false
  }
});

// 每次切换会话（点左侧不同职位/会话）都重置 dismissed 状态，
// 让"未登录提示"面板在新会话里重新显示一次（如果有渠道未登录）
//
// 业务流程：用户点左侧职位 → store.getters.getLatestChatId 变化（FloatingActionPanel
// 没给 ChatCard 传 chatId prop，切换靠 store 同步），所以这里 watch store getter。
const latestChatIdForLogin = computed(() => store.getters.getLatestChatId);
watch(latestChatIdForLogin, (newId, oldId) => {
  if (newId !== oldId) {
    loginRequiredDismissed.value = false;
    // 新会话重新按条件决定是否打开（上个会话点过"稍后再说"关掉的，这里恢复重判）
    loginPanelOpen.value = loginRequiredCondition.value;
  }
});

// 定义事件
const emit = defineEmits([
  "close",
  "toggle-expand",
  "send-message",
  "update:expanded",
  "edit-search", // 添加编辑搜索条件事件
  "aggregate-search", // 添加聚合搜索事件
  "aggregate", // 嵌入式模式：向父级（WorkspaceContainer）请求切换到 results 视图
  "view-results", // 调试 / 测试：直接切到 results 视图（不触发真正聚合）
  "stop-stream", // 添加停止流式输出事件
  "load-history-complete", // 添加历史加载完成事件
  "add-message", // 添加新消息添加事件
  "message-added", // 添加新消息添加事件
  "chat-reset", // 添加聊天重置事件
  "open-chat", // 添加打开聊天面板事件
  "profile-skills-edit" // AI 职位画像卡「技能关键词」编辑保存 → 同步到搜索条件 searchState
]);

// 聊天消息输入
const chatMessage = ref("");
const isAnimating = ref(false);
const chatCardRef = ref(null);

// 拖动功能相关状态
const isDragging = ref(false);
const initialX = ref(0);
const initialY = ref(0);
const offsetX = ref(0);
const offsetY = ref(0);
const defaultPosition = {
  right: "80px",
  bottom: "20px"
};

// 添加垂直展开状态
const verticalExpanded = ref(false);
//aiSearchRef
const aiSearchRef = computed(() => store.getters.getAiSearchRefValue);

// 计算面板位置样式
const panelPosition = computed(() => {
  // 纵向展开时的样式
  const verticalStyle =
    verticalExpanded.value && !isDragging.value
      ? {
          width: "380px",
          height: "calc(100vh - 80px)",
          bottom: "20px",
          right: "80px",
          top: "auto"
        }
      : {};

  if (offsetX.value || offsetY.value) {
    return {
      position: "fixed",
      left: offsetX.value ? `${offsetX.value}px` : "auto",
      top: offsetY.value ? `${offsetY.value}px` : "auto",
      right: !offsetX.value ? defaultPosition.right : "auto",
      bottom: !offsetY.value ? defaultPosition.bottom : "auto",
      height: verticalExpanded.value ? "calc(100vh - 80px)" : "500px",
      width: verticalExpanded.value ? "380px" : undefined,
      ...(!isDragging.value ? verticalStyle : {})
    };
  }
  return {
    position: "fixed",
    right: defaultPosition.right,
    bottom: defaultPosition.bottom,
    ...(!isDragging.value ? verticalStyle : {})
  };
});

// Markdown解析函数
const parseMarkdown = (content) => {
  return md.render(content || "");
};

const parseMarkdownCopy = (content) => {
  let html = md.render(content || "");

  // 定义需要处理的特定标题
  const titles = ["专业技能", "软实力要求", "相关经历"];
  // 正则表达式匹配包含特定标题的div结构
  const regex = new RegExp(
    `(<div[^>]*>\\s*<div[^>]*>\\s*(${titles.join(
      "|"
    )})[^<]*</div>\\s*<div[^>]*>)([\\s\\S]*?)(</div>\\s*</div>)`,
    "gi"
  );

  // 替换处理
  html = html.replace(regex, (match, prefix, title, content, suffix) => {
    // 匹配内容部分中的每个条目div
    const itemRegex = /<div[^>]*>([\s\S]*?)<\/div>/gi;
    let lastIndex = 0;
    let result = "";
    let itemMatch;
    let items = [];

    // 收集所有条目
    while ((itemMatch = itemRegex.exec(content)) !== null) {
      items.push({
        full: itemMatch[0],
        inner: itemMatch[1],
        start: itemMatch.index,
        end: itemRegex.lastIndex
      });
    }

    // 重新构建内容，在非最后一个条目末尾添加分号
    items.forEach((item, index) => {
      // 添加当前条目之前的内容（原始文本或空白）
      result += content.substring(lastIndex, item.start);
      result += item.full.replace(/([^>])(<\/div>)$/, "$1；$2");
      lastIndex = item.end;
    });

    // 添加条目之后的内容
    result += content.substring(lastIndex);

    return prefix + result + suffix;
  });
  console.log("html", html);
  return html;
};

const handleCopy = (content) => {
  try {
    // 创建临时元素提取纯文本
    const tempElement = document.createElement("div");
    tempElement.innerHTML = parseMarkdownCopy(content);
    const plainText = tempElement.innerText || tempElement.textContent;

    // 分割自然语言描述和结构化数据部分
    const descriptionEndIndex = plainText.indexOf("职位：");
    let naturalLanguage = "";
    let structuredData = "";

    if (descriptionEndIndex !== -1) {
      naturalLanguage = plainText.substring(0, descriptionEndIndex).trim();
      structuredData = plainText.substring(descriptionEndIndex);
    } else {
      naturalLanguage = plainText;
    }

    const fields = {
      position: extractField(structuredData, /职位：(.*?)(?=工作地点：|$)/),
      location: extractField(structuredData, /工作地点：([\s\S]*?)(?=(?:工作经验：|学历要求：|$))/),
      experience: extractField(
        structuredData,
        /工作经验：([\s\S]*?)(?=(?:学历要求：|薪资范围：|$))/
      ),
      education: extractField(
        structuredData,
        /学历要求：([\s\S]*?)(?=(?:薪资范围：|专业技能：|$))/
      ),
      salary: extractField(structuredData, /薪资范围：([\s\S]*?)(?=(?:专业技能：|软实力要求：|$))/),
      skills: extractField(structuredData, /专业技能：([\s\S]*?)(?=(?:软实力要求：|相关经历：|$))/),
      softSkills: extractField(structuredData, /软实力要求：([\s\S]*?)(?=(?:相关经历：|$))/),
      relatedExperience: extractField(structuredData, /相关经历：([\s\S]*)/)
    };

    // 构建格式化的文本 - 确保自然语言描述保持单行
    let formattedText = naturalLanguage.replace(/\s+/g, " ").trim();

    if (fields.position) {
      formattedText += `\n职位：${fields.position}`;
    }

    if (fields.location || fields.experience || fields.education) {
      formattedText += `\n工作地点：${fields.location || ""}  工作经验：${
        fields.experience || ""
      }  学历要求：${fields.education || ""}`;
    }

    if (fields.salary) {
      formattedText += `  薪资范围：${fields.salary}`;
    }

    if (fields.skills) {
      formattedText += `\n专业技能：${fields.skills}`;
    }

    if (fields.softSkills) {
      formattedText += `\n软实力要求：${fields.softSkills}`;
    }

    if (fields.relatedExperience) {
      formattedText += `\n相关经历：${fields.relatedExperience}`;
    }

    // 复制格式化后的文本
    navigator.clipboard.writeText(formattedText);
    $q.notify({
      message: "复制成功",
      color: "positive",
      position: "top",
      timeout: 1000
    });
  } catch (err) {
    console.error("复制失败:", err);
    $q.notify({
      message: "复制失败",
      color: "negative",
      position: "top"
    });
  }
};

// 辅助函数：从文本中提取字段
function extractField(text, regex) {
  const match = text.match(regex);
  return match ? match[1].trim() : "";
}

//新建聊天
const handleNewChat = () => {
  // 设置为新聊天状态
  isNewChat.value = true;
  isFirstMessage.value = false; // 改为 false，表示初始未发送消息状态

  // 清空消息
  store.commit("clearChatMessage");
  internalMessages.value = [];

  // 清空聊天 ID
  currentChatId.value = "";
  store.commit("SET_LATEST_CHAT_ID", "");

  // 清空搜索条件 ID
  store.commit("clearSearchConditionId");

  // 重置输入框
  chatMessage.value = "";

  // 确保聊天框始终处于最大状态
  if (!props.expanded) {
    // 如果当前不是最大状态，则更新状态并触发切换
    emit("update:expanded", true);
    emit("toggle-expand");
  }

  console.log("已重置到新建聊天状态");

  // 通知外部组件聊天已重置
  emit("chat-reset");
  // 新增：通知父组件需要打开聊天面板
  emit("open-chat");
};

/**
 * 清空当前对话（保留当前 chatId，只清消息历史）
 *
 * 跟 handleNewChat 的区别：
 *   - handleNewChat：新建会话，会清掉 chatId、SET_LATEST_CHAT_ID('')，会切回首屏
 *   - clearCurrentChat：保留 chatId 和职位绑定，只清空对话内容 + 输入框
 *
 * 调用时机：用户点击 WorkspaceContainer 顶部「清空当前对话」按钮 + 确认弹框
 *
 * TODO（后端接口已就绪但暂未接入，按用户要求先只清本地缓存）：
 *   src/api/chat/ChatApi.js → clearChatHistory(chatId, userId)
 *   接入时机：等本地清空流程跑通后，再串行 await 后端清空，避免刷新后历史"复活"
 *
 *   await clearChatHistory(chatId, store.getters.getUserInfo?.id);
 *
 * 此外要清掉跟当前 chat 相关的占位 task 卡片绑定（pendingTaskBindingsByChat[chatId]），
 * 否则清完再启动新任务时旧占位会回填错误。
 */
const clearCurrentChat = async () => {
  const chatId = currentChatId.value || props.chatId;
  console.log(`[ChatCard] clearCurrentChat 开始 chatId=${chatId}`);

  // ===== 本地优先策略 =====
  //   1) 先清本地（用户感知秒响应，不等后端往返）
  //   2) 再 await 后端接口（失败仅 console.warn，不 throw 阻塞 UI；用户可以重试）
  //   原因：本地清完用户就看到效果了；万一网络问题失败，下次进入会从后端 loadHistory，
  //   届时如果后端还有历史会重新加载回来（自洽，不会数据丢失也不会数据残留）。

  // 1) 清本地消息
  internalMessages.value = [];
  store.commit("clearChatMessage");

  // 2) 清搜索条件 ID（避免之前的搜索条件残留影响下次启动）
  store.commit("clearSearchConditionId");

  // 3) 清输入框
  chatMessage.value = "";

  // 4) 清掉当前 chat 的 task_status 占位卡片绑定记录
  //    （internalMessages 已清，但 pendingTaskBindings 是 ref 字典，要单独清掉对应 key）
  if (chatId && pendingTaskBindingsByChat.value[chatId]) {
    const next = { ...pendingTaskBindingsByChat.value };
    delete next[chatId];
    pendingTaskBindingsByChat.value = next;
  }

  // 5) 调后端清空历史接口（保留 chatId，只清 history）
  //    后端：GET/POST /ihire/chat/clearChatHistory?chatId=xxx
  //    失败仅日志，不影响本地已清的视觉效果（用户感知不阻塞）
  if (chatId) {
    try {
      const resp = await clearChatHistory(chatId);
      console.log(
        `[ChatCard] clearCurrentChat 后端清空 ok chatId=${chatId} resp=`,
        resp?.data ?? resp
      );
    } catch (e) {
      console.warn(
        `[ChatCard] clearCurrentChat 后端清空失败（本地已清，不影响 UI）chatId=${chatId}:`,
        e?.message || e
      );
    }
  }

  // 6) 通知外部组件
  emit("chat-cleared", { chatId });
};

// 编辑搜索条件
const handleEdit = (msg) => {
  // emit('edit-search', {
  //   content: msg.content,
  //   chatId: props.chatId || currentChatId.value
  // });

  // 判断对话框是否是缩小状态，如果不是就把它缩小
  if (props.expanded) {
    toggleExpand();
  }

  console.log("chatID:", currentChatId.value);
  //刷新搜索条件
  jobSearchFilterRef.value.refreshSearchCondition(currentChatId.value);
};

/**
 * AI 职位画像卡「技能关键词」编辑保存：把新的专业技能同步到搜索条件（searchState.criteria
 * .professional_skills），让后续 saveCondition / 搜索用编辑后的技能。
 * 透传给 IndexPage 处理（searchState 在 IndexPage，v-model 到 AISearch / JobSearchFilter）。
 */
function onAiProfileSkillsSave(msg, payload) {
  const skills = Array.isArray(payload?.skills) ? payload.skills : [];
  emit("profile-skills-edit", {
    chatId: msg?.chatId || props.chatId || currentChatId.value,
    skills
  });
}

// 聚合搜索
const handleSearch = async (msg) => {
  if (props.embedded) {
    // 嵌入式模式：基于 SearchTasks store 的真实任务状态卡片
    //
    //   1. 立刻 emit aggregate-search → IndexPage 后台 dispatch SearchTasks/create
    //      → store 拿到 taskId 后 push 真实搜索（runRealAggregateSearch）
    //   2. ChatCard 立即 push 一条 type='task_status' 占位消息（taskId 暂为空）
    //      由下方 watchPendingTaskBinding 在 store 出现新 task 时回填 taskId
    //   3. 任务进入终态（COMPLETED / FAILED / STOPPED）→ emit view-results
    //
    // 跟旧 mock 实现的关键区别：
    //   - 旧：本地定时器 1.2s 推进虚假步骤，跟真实搜索无关
    //   - 新：steps[].status 完全由 task.channels[].taskChannelStatus 决定，reactive
    const state = actionPanelStateByMsgId.value[msg?.id] || null;
    // fallback 默认 recommend:false（更保守）—— BOSS 禁用 / state 还没就绪时，
    // 避免误触发推荐牛人。AIProfileActionPanel 已经在 mount 时 immediate emit('change')
    // 推送真实状态（含 BOSS 禁用 → recommend:false 的转换），这条 fallback 只是双保险防御。
    const selectedModules = state?.selectedModules || { search: true, recommend: false };
    const matchedBossJobId = state?.matchedBossJobId || null;
    const resumeCount = state?.resumeCount ?? null;
    const chatIdForSearch = props.chatId || currentChatId.value;

    // ★ 500ms 防抖：避免连点导致多次 dispatchTaskStore（详见 _isAggregateClickDebounced 注释）
    if (_isAggregateClickDebounced(chatIdForSearch, "INITIAL")) return;

    // ★ 在途任务拦截：已有"占位未绑定 / create 在途"的任务 → 直接跳过，避免多张状态卡 + 多次 create
    //   （只在真正 execute / 任务建出来时才有一张卡）
    if (_hasInflightTaskForChat(chatIdForSearch)) {
      console.log("[ChatCard] handleSearch 跳过：该 chat 已有在途任务（占位未绑定 / 创建中）");
      return;
    }

    // 提前拦截重复点击：同一职位已有 RUNNING/WAITING/RESTING 任务时直接返回，
    // 不 push 占位卡片，避免出现"正在初始化任务..."永远转圈的状态。
    // IndexPage 也会再判一次并通过 notify 告知用户，这里只静默兜底。
    const canCreate = store.getters["SearchTasks/canCreateForChat"];
    if (typeof canCreate === "function" && !canCreate(chatIdForSearch)) {
      console.warn("[ChatCard] handleSearch 拒绝：该 chat 已有进行中任务");
      // 仍然 emit 给 IndexPage（让 IndexPage 的 notify.warning 弹出来）
      emit("aggregate-search", {
        chatId: chatIdForSearch,
        selectedModules,
        matchedBossJobId,
        resumeCount,
        content: msg?.content
      });
      return;
    }

    // 1) 立刻 push 占位 task_status 卡片：按 selectedModules 拆成 search / recommend 两张
    //    独立卡片（视觉上是两个聊天气泡），不再合到一张里。watch 触发时同一 taskId
    //    会回填给两张占位
    const placeholderMsgId = pushTaskStatusPlaceholdersByModules(chatIdForSearch, selectedModules);

    // 2) 通知父级真正去创建任务 + 跑搜索
    emit("aggregate-search", {
      chatId: chatIdForSearch,
      selectedModules,
      matchedBossJobId,
      resumeCount,
      content: msg?.content,
      placeholderMsgId
    });
    // 不再 await mock 动画；watchPendingTaskBinding 会在任务进入终态时 emit view-results
    return;
  }
  // 浮窗模式：判断对话框是否是缩小状态，如果不是就把它缩小
  if (props.expanded) {
    toggleExpand();
  }
  console.log("chatID:", currentChatId.value);
  //刷新搜索条件并搜索
  jobSearchFilterRef.value && jobSearchFilterRef.value.refreshAndSearchFN(currentChatId.value);
};

/**
 * 搜索结果页顶部「搜索条件栏」点搜索 → 走任务流程（跟"清空重新搜索"一致：taskType=RESTART），
 * 而不是旧的直接 executeSearch。由 IndexPage.searchJobList 切回聊天视图后调用。
 *
 * - 搜索关键字/条件：handleAggregateSearch → prepareConditionOnly 读 searchState 自动带入
 *   （searchState 与顶部搜索栏 v-model 双绑，用户改的条件就在里面）。
 * - 复用占位卡 + 在途去重 + canCreate 拦截，跟「启动聚合搜索 / 清空重新搜索」同一套。
 * @returns {boolean} 是否成功发起
 */
function startSearchFromFilter() {
  const chatIdForSearch = props.chatId || currentChatId.value;
  if (!chatIdForSearch) {
    console.warn("[ChatCard] startSearchFromFilter: 没拿到 chatId");
    return false;
  }
  if (_isAggregateClickDebounced(chatIdForSearch, "RESTART")) return false;
  if (_hasInflightTaskForChat(chatIdForSearch)) {
    console.log("[ChatCard] startSearchFromFilter 跳过：该 chat 已有在途任务");
    return false;
  }
  const canCreate = store.getters["SearchTasks/canCreateForChat"];
  if (typeof canCreate === "function" && !canCreate(chatIdForSearch)) {
    $q.notify({
      message: "该职位已有搜索任务在进行中，请等待完成后再搜索",
      color: "warning",
      icon: "warning",
      position: "top",
      timeout: 2500
    });
    return false;
  }
  const selectedModules = { search: true, recommend: false };
  const placeholderMsgId = pushTaskStatusPlaceholdersByModules(chatIdForSearch, selectedModules);
  emit("aggregate-search", {
    chatId: chatIdForSearch,
    taskType: "RESTART",
    selectedModules,
    placeholderMsgId
  });
  return true;
}

/**
 * 搜索结果页「加载更多」→ 走任务流程的「保留增量搜索」（taskType=CONTINUE），
 * 而不是旧的直接翻下一页。由各渠道/聚合列表的 loadMore（经 store.chatCardRef）调用。
 *
 * - originalTaskId 取本 chat 最新任务（CONTINUE 要挂在原 resultSet 上增量追加）。
 * - 搜索条件由 handleAggregateSearch → prepareConditionOnly 读 searchState 带入。
 * - 复用占位卡 + 在途去重 + canCreate 拦截。返回聊天视图由 IndexPage.handleAggregateSearch 统一切。
 * @returns {boolean} 是否成功发起
 */
function startContinueSearch() {
  const chatIdForSearch = props.chatId || currentChatId.value;
  if (!chatIdForSearch) {
    console.warn("[ChatCard] startContinueSearch: 没拿到 chatId");
    return false;
  }
  if (_isAggregateClickDebounced(chatIdForSearch, "CONTINUE")) return false;
  if (_hasInflightTaskForChat(chatIdForSearch)) {
    console.log("[ChatCard] startContinueSearch 跳过：该 chat 已有在途任务");
    return false;
  }
  const canCreate = store.getters["SearchTasks/canCreateForChat"];
  if (typeof canCreate === "function" && !canCreate(chatIdForSearch)) {
    $q.notify({
      message: "该职位已有搜索任务在进行中，请等待完成后再加载更多",
      color: "warning",
      icon: "warning",
      position: "top",
      timeout: 2500
    });
    return false;
  }
  const latest = store.getters["SearchTasks/getLatestTaskByChat"]?.(chatIdForSearch);
  const originalTaskId = latest?.taskId || null;
  // ★ 按被增量的原任务渠道组成决定要插哪些状态卡：原任务有推荐渠道 → 也要插推荐状态卡
  //   （否则 current 回来的 CONTINUE 任务带 RECOMMEND，但聊天里只有搜索卡、没有推荐卡）
  const chans = Array.isArray(latest?.channels) ? latest.channels : [];
  const selectedModules = {
    search: chans.some((c) => c.businessChannel === "SEARCH"),
    recommend: chans.some((c) => c.businessChannel === "RECOMMEND")
  };
  if (!selectedModules.search && !selectedModules.recommend) selectedModules.search = true;
  const placeholderMsgId = pushTaskStatusPlaceholdersByModules(chatIdForSearch, selectedModules);
  emit("aggregate-search", {
    chatId: chatIdForSearch,
    taskType: "CONTINUE",
    originalTaskId,
    selectedModules,
    placeholderMsgId
  });
  return true;
}

/* ===== 任务状态卡片：占位 push + watch 回填 + 终态切视图 =====
 * 老 mock pushAndAnimateExecutionLog / mockStartAggregateProgress 已废弃，仅留代码作为对照。
 */

// 待绑定 taskId 的占位消息（chatId → 占位消息 id）
// 一个 chat 同时只允许有 1 个 pending 占位（handleSearch 出口已被 SearchTasks/refused 拦截重复点击）
const pendingTaskBindingsByChat = ref({});

// 「保留增量 / 清空重新」配置卡（RetryConfigCard）点了启动后会乐观锁定（actionExecuted=true）。
// 记录 chatId → 该卡 msgId，若任务创建失败则把它解锁（恢复输入框 + 按钮），避免卡死在"聚合搜索已启动"。
const pendingRetryCardByChat = ref({});
// 已经触发过 view-results 的 taskId 集合，避免一个任务进入终态被多次切视图
const viewResultsFiredTaskIds = ref(new Set());

/**
 * "本会话用户主动启动的"任务 ID 集合——只有进入这个集合的任务在 COMPLETED 时才会
 * 自动切到 results 视图。
 *
 * 为什么需要这个集合：
 *   watchPendingTaskBinding 监听的是 "latest task" 任务对象，task 来源有 3 路：
 *     (a) 用户本次点"启动聚合搜索 / 清空重新 / 保留增量" → create → push placeholder → 写 store
 *     (b) SearchTasks/resumeFromCurrent 启动时从后端拉 current 任务恢复到 store
 *     (c) vuex-persistedstate 在 mount 时从 localStorage 恢复 tasksById（含已 COMPLETED 的老任务）
 *
 *   旧版只用 viewResultsFiredTaskIds 去重（per-mount in-memory Set），
 *   导致 (b)(c) 路径下"老 COMPLETED 任务"在每次 ChatCard mount 时都被 watch 当作
 *   "新到达的 COMPLETED 状态"，触发 emit view-results → 用户上次明明点过 "返回对话"，
 *   重启 / 刷新 / 切换职位回来后视图又被强制切回 results。
 *
 *   修复：把"本会话 user 主动启动"的 task ID 集中跟踪。watch 触发时多加一道闸门——
 *   只有出现在 sessionStartedTaskIds 里的 COMPLETED 任务才 emit view-results。
 *   (b)(c) 路径的老任务永远进不来，自然不会覆盖用户的视图选择。
 *
 *   写入时机：occurred in 占位回填那一步，即 watch 已确认这个 task 是配着当前
 *   pending placeholder 创建的（createdAt >= placeholderCreatedAt），意味着 user
 *   刚刚点过按钮启动它——只有这一次配对成功才算"本会话主动启动"。
 */
const sessionStartedTaskIds = ref(new Set());

/**
 * 该 chat 是否已有"在途任务"——已 push 但还没绑定 taskId 的占位，或 create 正在请求中。
 *
 * 用途：连续点击「启动聚合搜索 / 清空重新 / 保留增量」时，第一次点击会 push 占位卡 +
 * 发起 create（→ queue → current → execute）。在这条任务真正建出来（占位被绑定 taskId、
 * 或任务进 RUNNING 被 canCreateForChat 拦住）之前，后续点击都应**直接跳过**，
 * 避免出现多张状态卡片 / 多次 create（实际后端只执行一次 execute）。
 */
function _hasInflightTaskForChat(chatId) {
  if (!chatId) return false;
  // 有未绑定 taskId 的占位（push 了但任务还没建出来）
  if (pendingTaskBindingsByChat.value[chatId]) return true;
  // create 接口在途
  const isPending = store.getters["SearchTasks/isPendingCreate"];
  if (typeof isPending === "function" && isPending(chatId)) return true;
  return false;
}

/**
 * 立即 push 一条占位 task_status 消息，返回消息 id。
 *
 * @param {string} chatId
 * @param {'search'|'recommend'|'all'} [kind='all']  这张卡片只渲染哪个流程段。
 *        ChatCard 会按 selectedModules 调用本函数 1～2 次（search + recommend 各一张），
 *        让两段流程视觉上是**两个独立的聊天气泡**，而不是挤在同一张卡片里。
 *        kind='all' 用于兼容（向后兼容旧调用 / 不确定时全显示）。
 */
function pushTaskStatusPlaceholder(chatId, kind = "all") {
  const id =
    "task-status-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6) + "-" + kind;
  const createdAt = Date.now();
  internalMessages.value.push({
    id,
    type: "task_status",
    taskId: "",
    chatId: chatId || "",
    kind,
    createdAt,
    time: new Date().toTimeString().slice(0, 8),
    user: ""
  });
  // 同时记录创建时间——watch 回填时只绑"晚于这个时间创建"的任务，
  // 避免把 resumeFromCurrent 标 FAILED 的旧任务误绑给新点击产生的占位
  //
  // 结构从单 entry 改为数组：一个 chat 可能同时挂 search + recommend 两张占位，
  // 都要被同一个 taskId 回填
  const cur = pendingTaskBindingsByChat.value[chatId];
  const arr = Array.isArray(cur) ? [...cur] : cur ? [cur] : [];
  arr.push({ id, createdAt, kind });
  pendingTaskBindingsByChat.value = {
    ...pendingTaskBindingsByChat.value,
    [chatId]: arr
  };
  nextTick(() => {
    try {
      scrollChatToBottom();
    } catch (_e) {
      /* ignore */
    }
  });
  return id;
}

/**
 * 创建新任务前：移除该 chat 旧的**进度状态卡**（task_status / 旧 execution_log）。
 * 用户要求：重新搜索 / 加载更多增量搜索时，旧的进度状态卡删掉、新状态卡插到最新位置。
 * ⚠️ **保留** task_completion_card（结果/完成卡，带「查看结果」）和 retry_config_card —— 这些是
 *    历史结果，之前误删了导致"最后一条结果卡片被干没了"。
 */
function _removeOldTaskCardsForChat(chatId) {
  if (!chatId) return;
  const TASK_CARD_TYPES = new Set(["task_status", "execution_log"]);
  internalMessages.value = internalMessages.value.filter(
    (m) => !(m && TASK_CARD_TYPES.has(m.type) && m.chatId === chatId)
  );
  // 旧占位已被移除 → 清掉该 chat 的占位绑定记录，避免悬挂
  if (pendingTaskBindingsByChat.value[chatId]) {
    const next = { ...pendingTaskBindingsByChat.value };
    delete next[chatId];
    pendingTaskBindingsByChat.value = next;
  }
}

/**
 * 根据 selectedModules push 一条或两条 task_status 占位（让两个流程是独立的气泡）。
 * 返回最后一张占位的 msgId（向后兼容旧 callers 取一个 placeholderMsgId 的用法）。
 */
function pushTaskStatusPlaceholdersByModules(chatId, selectedModules) {
  // 先删旧任务卡，再 push 新占位 → 新状态卡始终在最新位置，历史卡不堆叠
  _removeOldTaskCardsForChat(chatId);
  const sel = selectedModules || { search: true, recommend: false };
  let lastId = "";
  if (sel.search) lastId = pushTaskStatusPlaceholder(chatId, "search");
  if (sel.recommend) lastId = pushTaskStatusPlaceholder(chatId, "recommend");
  if (!sel.search && !sel.recommend) {
    // 都没勾还是兜底 push 一张 'all'，避免占位丢失
    lastId = pushTaskStatusPlaceholder(chatId, "all");
  }
  return lastId;
}

/**
 * watch SearchTasks store：当前 chat 下出现新 task → 回填占位消息的 taskId
 * 任务进入终态（COMPLETED / FAILED / STOPPED）→ emit view-results（一次性）
 *
 * 注意 watch source 是函数式 getter（getLatestTaskByChat 是 curried getter）
 *   `store.getters['SearchTasks/getLatestTaskByChat'](chatId)`
 */
watch(
  () => {
    const chatId = currentChatId.value || props.chatId;
    if (!chatId) return null;
    const getter = store.getters["SearchTasks/getLatestTaskByChat"];
    return typeof getter === "function" ? getter(chatId) : null;
  },
  (newTask) => {
    if (!newTask || !newTask.taskId) return;
    const chatId = currentChatId.value || props.chatId;
    // (a) 占位回填：仅当任务的 createdAt 不早于 placeholder 创建时间时才绑定
    //
    //   修复场景：resumeFromCurrent 把当前 chat 旧 BOSS 任务标 FAILED 写入 store，
    //   用户随后点"启动聚合搜索"，此 watch source 第一次拿到的"latest task"就是那个
    //   FAILED 旧任务（因为新任务还没建出来）。旧版逻辑会把占位卡片直接绑到 FAILED
    //   旧任务上，TaskStatusCard 渲染成"已完成"（FAILED 也算 done），用户看到状态错乱。
    //
    //   正确做法：占位只绑"新于自己"的任务。FAILED 旧任务 createdAt < placeholder
    //   createdAt → 跳过；等真正的新任务被 create 出来时（createdAt >= placeholder）
    //   再绑。
    const pendingRaw = pendingTaskBindingsByChat.value[chatId];
    // 兼容三种历史结构：string（旧）/ object（旧）/ array（新，支持 search+recommend 两张占位）
    const pendingEntries = Array.isArray(pendingRaw)
      ? pendingRaw
      : pendingRaw
      ? [typeof pendingRaw === "string" ? { id: pendingRaw, createdAt: 0 } : pendingRaw]
      : [];
    if (pendingEntries.length > 0) {
      const newTaskCreatedAt = Number(newTask.createdAt) || 0;
      // 该 kind 在新任务里是否「没有未完成渠道」（缺这个渠道 或 渠道已终态）→ 应丢弃这张占位，
      // 不绑定也不显示（已完成的渠道不插状态卡；占位 kind 是按原任务猜的，可能跟新任务对不上）。
      const isTermStatus = (s) =>
        s === "COMPLETED" || s === "FAILED" || s === "STOPPED" || s === "SKIPPED";
      const shouldDropKind = (kind) => {
        const biz = kind === "search" ? "SEARCH" : kind === "recommend" ? "RECOMMEND" : null;
        if (!biz) return false; // 'all' 占位不判，正常绑定
        const chans = Array.isArray(newTask.channels) ? newTask.channels : [];
        return !chans.some((c) => c.businessChannel === biz && !isTermStatus(c.taskChannelStatus));
      };
      let anyBound = false;
      let anySkipped = false;
      for (const entry of pendingEntries) {
        const pendingMsgId = entry.id;
        const placeholderCreatedAt = entry.createdAt || 0;
        // 允许 200ms 时间漂移（client 时钟 vs server 时钟）
        const isFreshEnough = newTaskCreatedAt >= placeholderCreatedAt - 200;
        const target = internalMessages.value.find((m) => m.id === pendingMsgId);
        if (target && !target.taskId && isFreshEnough && shouldDropKind(entry.kind)) {
          // 新任务里该渠道已完成 / 不存在 → 移除占位卡（不显示已完成渠道的状态卡）
          internalMessages.value = internalMessages.value.filter((m) => m.id !== pendingMsgId);
          anyBound = true; // 视为已处理，循环结束后清掉 pending 记录
          console.log(
            `[ChatCard] 占位卡片丢弃（新任务该渠道已完成/不存在）taskId=${newTask.taskId} kind=${
              entry.kind || "all"
            }`
          );
        } else if (target && !target.taskId && isFreshEnough) {
          target.taskId = newTask.taskId;
          anyBound = true;
        } else if (target && !target.taskId && !isFreshEnough) {
          anySkipped = true;
          console.log(
            `[ChatCard] 占位卡片跳过绑定旧任务 taskId=${
              newTask.taskId
            }（createdAt=${newTaskCreatedAt} < placeholder=${placeholderCreatedAt}）kind=${
              entry.kind || "all"
            }`
          );
        }
      }
      if (anyBound) {
        const next = { ...pendingTaskBindingsByChat.value };
        delete next[chatId];
        pendingTaskBindingsByChat.value = next;
        // 任务真正建出来 → RetryConfigCard 保持锁定（成功），清掉"待失败解锁"记录
        if (pendingRetryCardByChat.value[chatId]) {
          const nr = { ...pendingRetryCardByChat.value };
          delete nr[chatId];
          pendingRetryCardByChat.value = nr;
        }
        // 配对成功 → 标记为"本会话主动启动"，COMPLETED 时才会触发自动切到 results 视图
        sessionStartedTaskIds.value.add(newTask.taskId);
      } else if (anySkipped) {
        // 全部跳过：不动 binding，等真正新任务出来
      }
    }

    // (a.2) 占位 kind 对账：占位卡的 search/recommend 是按「原任务」渠道猜的，新任务的实际
    //   渠道可能不同（典型：CONTINUE 出来是「推荐-only」，但原任务是搜索 → 只 push 了搜索占位，
    //   推荐状态卡缺失）。这里按**新任务实际 channels** 补齐缺的那张卡（ensureTaskStatusCardForCurrentChat
    //   内部按 taskId+kind 去重，已绑定的不会重复插）。
    ensureTaskStatusCardForCurrentChat();

    // (b) 终态切视图：每个 taskId 只 fire 一次。COMPLETED 才切；FAILED/STOPPED 留在当前视图
    // 不强切，避免用户在搜索失败时被强制跳走
    //
    // ⚠️ 关键守卫：**必须**是 sessionStartedTaskIds 里的任务才切。
    //   resumeFromCurrent / vuex-persistedstate 恢复的老 COMPLETED 任务进不来这个集合，
    //   防止 ChatCard remount 时把用户上次"返回对话"的视图选择重新覆盖掉。
    if (
      newTask.taskStatus === "COMPLETED" &&
      sessionStartedTaskIds.value.has(newTask.taskId) &&
      !viewResultsFiredTaskIds.value.has(newTask.taskId)
    ) {
      viewResultsFiredTaskIds.value.add(newTask.taskId);
      // 延时 3 秒再切结果页：让用户能先看到完成卡片（该职位聚合搜索已全部完成！），
      // 再自动跳转到搜索结果列表，避免卡片一出现就立刻被覆盖
      setTimeout(() => {
        // ★ 必须带 source='task_completion_card'：让 IndexPage.handleViewResults 走
        //   完整数据加载链路 —— 把结果按 taskId 写进隔离的 ViewingResults bucket +
        //   记 viewingTaskId。否则 handleViewResults 提前 return，只切视图不灌数据，
        //   结果页只能依赖共享的 ChannelConfig.ALL.data；一旦 selectChat 清掉 ALL.data
        //   就空白。自动跳转要和手动点完成卡"查看结果"完全同一套逻辑。
        emit("view-results", {
          chatId,
          taskId: newTask.taskId,
          taskStatus: newTask.taskStatus,
          source: "task_completion_card"
        });
      }, 3000);
    }
  },
  { deep: true }
);

/**
 * 监听 pendingCreate 状态：当 create 流程结束（成功或失败）且占位消息仍未被绑定 taskId
 * → 说明任务创建失败 → 把占位消息标为 isStopped=true，让 TaskStatusCard 显示失败状态
 * 而不是一直显示"正在初始化任务..."。
 */
watch(
  () => {
    const chatId = currentChatId.value || props.chatId;
    if (!chatId) return false;
    const isPending = store.getters["SearchTasks/isPendingCreate"];
    return typeof isPending === "function" ? isPending(chatId) : false;
  },
  (isPending, wasPending) => {
    if (wasPending && !isPending) {
      // pendingCreate 从 true → false（create 流程结束）
      const chatId = currentChatId.value || props.chatId;
      if (!chatId) return;

      // ★ 任务创建失败 → 解锁「保留增量 / 清空重新」配置卡：恢复输入框 + 按钮（接口请求完后恢复正常态）
      //   判定：create 流程结束后，本 chat 没有"刚创建（createdAt 近 10s）"的任务 = 失败
      const retryMsgId = pendingRetryCardByChat.value[chatId];
      if (retryMsgId) {
        const latest = store.getters["SearchTasks/getLatestTaskByChat"]?.(chatId);
        const createdAt = Number(latest?.createdAt) || 0;
        const createdFresh = createdAt > 0 && Date.now() - createdAt < 10000;
        if (!createdFresh) {
          const card = internalMessages.value.find((m) => m.id === retryMsgId);
          if (card?.cardData?.actionExecuted) {
            // 仅解锁配置卡（input 可编辑 + 按钮回"启动聚合搜索"）。
            // 不弹 toast：创建失败的精确原因已由 IndexPage 用接口 errorMessage 提示过了。
            card.cardData.actionExecuted = false;
            console.log("[ChatCard] 任务创建失败 → 解锁 RetryConfigCard", retryMsgId);
          }
        }
        const nr = { ...pendingRetryCardByChat.value };
        delete nr[chatId];
        pendingRetryCardByChat.value = nr;
      }

      const pending = pendingTaskBindingsByChat.value[chatId];
      if (!pending) return; // 已经被正常绑定了，不需要处理
      // 兼容三种结构：array（新，search+recommend 两张占位）/ object / string
      const entries = Array.isArray(pending)
        ? pending
        : [typeof pending === "string" ? { id: pending } : pending];
      // 任务创建失败 → **直接移除**未绑定的占位卡片，不在聊天记录里留"任务创建失败"状态卡。
      const failedIds = new Set(
        entries
          .map((e) => e?.id)
          .filter((id) => {
            const m = internalMessages.value.find((x) => x.id === id);
            return m && !m.taskId; // 还没绑定 taskId = 这次创建没成功
          })
      );
      if (failedIds.size > 0) {
        console.log("[ChatCard] pendingCreate 结束但占位未绑定 → 移除占位卡", [...failedIds]);
        internalMessages.value = internalMessages.value.filter((m) => !failedIds.has(m.id));
      }
      // ★ 一定要清掉本 chat 的 pending 记录：否则 _hasInflightTaskForChat 会一直为 true，
      //   导致"报错后再点启动聚合搜索没反应"（被在途守卫拦掉）。
      const next = { ...pendingTaskBindingsByChat.value };
      delete next[chatId];
      pendingTaskBindingsByChat.value = next;
    }
  }
);

/* ===== 旧 mock 聚合进度卡片已废弃（pushAndAnimateExecutionLog / mockStartAggregateProgress）=====
 * 已被 TaskStatusCard + SearchTasks store reactive 状态替代。
 * type='execution_log' 渲染分支保留向后兼容（历史消息回放），但不再有代码主动 push。
 */

/**
 * 切换 chat 加载历史后调一次：如果当前 chat 的最新任务**真正还活着**，
 * 在 internalMessages 末尾补一张 task_status 卡片（taskId 已绑定，能立即反映真实状态）。
 *
 * 回放策略（避免显示僵尸任务）：
 *   - 任务终态（COMPLETED / FAILED / STOPPED）→ 不回放（任务已结束，没必要再显示卡片）
 *   - 任务 taskStatus = RUNNING / WAITING / RESTING，但 createdAt 太久（> 15 分钟）→ 不回放
 *     （store 持久化保留了"卡死的旧任务"——比如 dispatchTaskStore 修复前创建、SSE 没正常结束
 *      就被刷新打断的，状态永远 RUNNING。这些被时效判定过滤掉，不污染当前 chat 的体验。）
 *
 *   注：vuex-persistedstate 持久化了 SearchTasks.tasksById 但**不**持久化 runtime 字段
 *       （runningTaskId / queue），所以无法用 runtime 判断"任务真的在跑"，只能用时效兜底。
 *
 * 跳过条件：
 *   - 没有当前 chat
 *   - store 没该 chat 的任务
 *   - internalMessages 里已经有同 taskId 的 task_status 卡片（避免重复）
 *   - 不满足上述"还活着"的判定
 */
function ensureTaskStatusCardForCurrentChat() {
  const chatId = currentChatId.value || props.chatId;
  if (!chatId) return;
  const getter = store.getters["SearchTasks/getLatestTaskByChat"];
  if (typeof getter !== "function") return;
  const latestTask = getter(chatId);
  if (!latestTask || !latestTask.taskId) return;

  // 已经结束的任务不回放
  const isAlive =
    latestTask.taskStatus === "RUNNING" ||
    latestTask.taskStatus === "WAITING" ||
    latestTask.taskStatus === "RESTING";
  if (!isAlive) return;

  // 超过 15 分钟的"在跑"任务多半是僵尸（SSE 没正常结束就被刷新打断）
  // ★ 豁免：后端 queue items 里还有这个任务 → 一定还活着（比如 OUT_OF_WORK_PERIOD 等几小时），
  //   不能用 createdAt 15min 阈值跳过——这类任务恰恰是用户最想看到的"排队中"。
  const queueItemsList = store.state?.SearchTasks?.taskQueue?.items || [];
  const inBackendQueue = queueItemsList.some(
    (it) => it?.taskId && String(it.taskId) === String(latestTask.taskId)
  );

  const FIFTEEN_MIN_MS = 15 * 60 * 1000;
  const createdAt = Number(latestTask.createdAt) || 0;
  const isRecent = createdAt > 0 && Date.now() - createdAt < FIFTEEN_MIN_MS;
  if (!isRecent && !inBackendQueue) {
    console.log(
      `[ChatCard] 跳过任务回放（疑似僵尸）: taskId=${latestTask.taskId} status=${latestTask.taskStatus}` +
        ` createdAt=${new Date(createdAt).toLocaleString()} inBackendQueue=${inBackendQueue}`
    );
    return;
  }
  if (!isRecent && inBackendQueue) {
    console.log(
      `[ChatCard] 任务超 15min 但在后端 queue 中（活的）→ 仍然回放: taskId=${latestTask.taskId} status=${latestTask.taskStatus}`
    );
  }

  // 按 task 实际的 channels 推 search / recommend 两张独立气泡（跟新建任务一致）
  // ★ 只为「未完成」的渠道插卡：已终态（COMPLETED/FAILED/STOPPED/SKIPPED）的渠道说明这一路
  //   本轮不会再跑（典型：CONTINUE 任务里推荐已完成、只补搜索），不再插它的状态卡。
  const isChannelTerminal = (s) =>
    s === "COMPLETED" || s === "FAILED" || s === "STOPPED" || s === "SKIPPED";
  const channels = Array.isArray(latestTask.channels) ? latestTask.channels : [];
  const hasSearch = channels.some(
    (c) => c.businessChannel === "SEARCH" && !isChannelTerminal(c.taskChannelStatus)
  );
  const hasRecommend = channels.some(
    (c) => c.businessChannel === "RECOMMEND" && !isChannelTerminal(c.taskChannelStatus)
  );
  const kinds = [];
  if (hasSearch) kinds.push("search");
  if (hasRecommend) kinds.push("recommend");
  // 注意：所有渠道都已终态时 kinds 为空 → 不插任何卡（不再兜底插 'all'）。

  let pushedAny = false;
  for (const kind of kinds) {
    // ★ 按 kind 单独判重：只有同 taskId + 同 kind 的卡已存在才跳过。
    //   修复"任务带搜索+推荐，但聊天里只有搜索卡时，推荐卡因整体判重被跳过、永远不出现"。
    const exists = internalMessages.value.some(
      (m) =>
        m.type === "task_status" &&
        String(m.taskId) === String(latestTask.taskId) &&
        (m.kind || "all") === kind
    );
    if (exists) continue;
    internalMessages.value.push({
      id: "task-status-restored-" + latestTask.taskId + "-" + kind,
      type: "task_status",
      taskId: latestTask.taskId,
      chatId,
      kind,
      time: new Date().toTimeString().slice(0, 8),
      user: ""
    });
    pushedAny = true;
  }
  if (!pushedAny) return;
  nextTick(() => {
    try {
      scrollChatToBottom();
    } catch (_e) {
      /* ignore */
    }
  });
}

/* （已移除）测试用 mock TaskCompletionCard 默认插入逻辑 —— 不再自动注入测试卡片。
 * 生产中走的是后端 chatHistory / SSE 推过来的 HTML 字符串，由 isTaskCompletionCardHtml
 * 检测后用 TaskCompletionCard 渲染。开发期如需手动测试，可临时 push 一条 type='task_completion_card'
 * 的 internalMessage（参考 git 历史中的 pushMockTaskCompletionCard 写法）。
 */

/* 任务完成卡片按钮事件分发：
 *
 * 协议：TaskCompletionCard 通过 click 代理捕获 `data-action`，emit 出对应事件。
 * 每个 handler 接收 (msg, payload)：
 *   - msg：触发卡片的消息对象（含 chatId / cardData）
 *   - payload：{ actionCode, cardData }（actionCode 跟事件名一致，方便统一日志）
 *
 * 当前临时占位为日志 + 简单转发；后续接实际业务（切 results 视图 / 清空重搜 / 增量搜索）。
 */
function onTaskCardViewResult(msg, payload) {
  console.log("[ChatCard] task_completion_card action=view-result", { msg, payload });
  // payload.cardData 来自 TaskCompletionCard 从模板根 div 提取的 data-* 集合，
  // 含 taskId / taskChannelId / searchConditionId / chatId / resultSetId 等
  // → 透传给 IndexPage 让它调 /search/resultSet/query 拉任务级结果集
  const cardData = payload?.cardData || {};
  emit("view-results", {
    chatId: cardData.chatId || currentChatId.value || props.chatId,
    taskId: cardData.taskId,
    taskChannelId: cardData.taskChannelId,
    taskChannelIds: cardData.taskChannelIds,
    searchConditionId: cardData.searchConditionId,
    searchConditionIds: cardData.searchConditionIds,
    resultSetId: cardData.resultSetId,
    source: "task_completion_card"
  });
}
/**
 * 从 SearchTasks store 里把"原任务"的渠道复原成 aggregate-search payload 期望的
 * { selectedModules, matchedBossJobId, resumeCount }。
 *
 * 为什么不读当前 AIProfileCard 的 panel 状态：
 *   - 完成卡片可能是历史消息里的（用户隔了几天再点），AIProfileCard 的 actionPanelState
 *     未必跟当时一致；用户语义是"基于这次完成的任务再来一遍"。
 *   - panel 状态在跨刷新 / 跨会话时不持久，没法稳定 fallback。
 *   - 任务 store 里 task.channels 是创建时落库的，完整且权威。
 *
 * 找不到原任务时返回 null，让上层 fallback 到 IndexPage 的 settings-based 兜底
 * （走 dispatchTaskStore 默认从 settings 拉启用渠道）。
 */
function _extractRetrySearchParamsFromOriginalTask(originalTaskId) {
  if (!originalTaskId) return null;
  const getter = store.getters["SearchTasks/getTaskById"];
  if (typeof getter !== "function") return null;
  const originalTask = getter(originalTaskId);
  if (
    !originalTask ||
    !Array.isArray(originalTask.channels) ||
    originalTask.channels.length === 0
  ) {
    return null;
  }
  const channels = originalTask.channels;
  const hasSearch = channels.some((c) => c.businessChannel === "SEARCH");
  const hasRecommend = channels.some((c) => c.businessChannel === "RECOMMEND");

  // 推荐渠道（限 BOSS）的配置——抽 relatedPositionValue / maxResumeCount
  let matchedBossJobId = null;
  let resumeCount = null;
  const recommendCh = channels.find(
    (c) => c.businessChannel === "RECOMMEND" && c.channelSubType === "BOSS"
  );
  if (recommendCh?.searchTaskConfig) {
    try {
      const cfg = JSON.parse(recommendCh.searchTaskConfig);
      matchedBossJobId = cfg?.relatedPositionValue || null;
      if (Number.isFinite(Number(cfg?.maxResumeCount))) {
        resumeCount = Number(cfg.maxResumeCount);
      }
    } catch (_e) {
      // searchTaskConfig 不是合法 JSON：忽略，让 IndexPage 用 settings 兜底
    }
  }
  return {
    selectedModules: { search: hasSearch, recommend: hasRecommend },
    matchedBossJobId,
    resumeCount
  };
}

/**
 * RESTART / CONTINUE 两个按钮共用的"再来一次"逻辑。
 *
 * 分两条路径：
 *   A) **原任务含 BOSS 推荐 (recommend=true)**：
 *      用户每次重启都要明确"本次简历份数"（推荐量很影响时长 + 风控）→
 *      插入一张 RetryConfigCard（type='retry_config_card'）让用户输入份数 →
 *      用户点"启动聚合搜索"按钮 → onRetryConfigStart → 走 _emitRetryAggregateSearch
 *
 *   B) **只有搜索（无推荐）**：
 *      数量不需要由用户确认（用原任务的 resumeCount / 默认值），直接走 _emitRetryAggregateSearch
 *      —— 保持旧的"一键重启"体验
 *
 * 两条路径最终都走 _emitRetryAggregateSearch：
 *   1) canCreateForChat 拦截重复点击（被拒也 emit 让 IndexPage 弹 notify）
 *   2) 立刻 push 一张占位 task_status 卡片（watchPendingTaskBinding 会自动绑定到新 taskId）
 *   3) emit('aggregate-search') 携带 taskType + originalTaskId，IndexPage 复用同一套
 *      dispatchTaskStore → SearchTasks/create → enqueue → runTask 链路
 */
function _retriggerTaskFromCard(taskType, msg, payload) {
  const cardData = payload?.cardData || {};
  const chatIdForSearch = cardData.chatId || props.chatId || currentChatId.value;
  if (!chatIdForSearch) {
    console.warn(`[ChatCard] task_completion_card ${taskType}: 没拿到 chatId，跳过`);
    return;
  }

  // ★ 500ms 防抖：避免连点 / 双击 完成卡按钮触发多次任务创建
  if (_isAggregateClickDebounced(chatIdForSearch, taskType)) return;

  // ★ 入口拦截：当前 chat 已有任务在跑 → 不插卡 / 不重启，直接 toast 提示
  //   避免用户看到 RetryConfigCard 插入但点"启动聚合搜索"时被拒绝的体验断裂
  //   判定语义跟 handleAggregateSearch 入口的 canCreateForChat 完全一致（RUNNING/WAITING/RESTING/AI 评分中）
  const canCreate = store.getters["SearchTasks/canCreateForChat"];
  if (typeof canCreate === "function" && !canCreate(chatIdForSearch)) {
    console.warn(`[ChatCard] task_completion_card ${taskType} 拒绝：该 chat 已有进行中任务`);
    const latestTask = store.getters["SearchTasks/getLatestTaskByChat"]?.(chatIdForSearch);
    const isAiAnalyzingPhase =
      latestTask?.taskStatus === "COMPLETED" &&
      store.getters["SearchTasks/isAiAnalyzingForChat"]?.(chatIdForSearch);
    $q.notify({
      message: isAiAnalyzingPhase
        ? "搜索已完成，AI 分析还在进行中，请等分析完成后再启动新任务"
        : "该职位已有搜索任务在进行中，请等待完成后再启动",
      color: "warning",
      icon: "warning",
      position: "top",
      timeout: 2500
    });
    return;
  }

  // 从原任务复原 selectedModules / matchedBossJobId / resumeCount
  const params = _extractRetrySearchParamsFromOriginalTask(cardData.taskId);

  // ★ 路径 A：含推荐 → 插 RetryConfigCard 中间卡，等用户确认份数
  //
  // 防重：用户可能先点"保留增量"又改主意点"清空重新"，不能并排出现两张未启动的卡 ——
  // 找最近一张 actionExecuted=false 的 retry_config_card **就地替换 cardData**（保留 id
  // 避免 Vue key 抖动导致 input 失焦），没找到才追加新的。
  // 跟 ihraisaas useChatLogic.handleRestartSearch/handleContinueSearch 同语义。
  if (params?.selectedModules?.recommend) {
    const newContent = taskType === "CONTINUE" ? "保留增量搜索配置" : "清空重新搜索配置";
    const newCardData = {
      configType: taskType, // 'CONTINUE' | 'RESTART'
      chatId: chatIdForSearch,
      originalTaskId: cardData.taskId,
      selectedModules: params.selectedModules,
      matchedBossJobId: params.matchedBossJobId,
      initialResumeCount:
        typeof params.resumeCount === "number" && params.resumeCount > 0 ? params.resumeCount : 60, // 兜底跟 IndexPage 默认值一致
      actionExecuted: false
    };

    const existingIdx = internalMessages.value.findLastIndex(
      (m) => m?.type === "retry_config_card" && !m?.cardData?.actionExecuted
    );
    if (existingIdx !== -1) {
      const existing = internalMessages.value[existingIdx];
      existing.content = newContent;
      existing.cardData = newCardData;
      existing.time = new Date().toLocaleTimeString();
      nextTick(() => scrollChatToBottom());
    } else {
      addMessage({
        id: uuidv4(),
        role: "assistant",
        type: "retry_config_card",
        content: newContent,
        time: new Date().toLocaleTimeString(),
        chatId: chatIdForSearch,
        cardData: newCardData
      });
    }
    return;
  }

  // ★ 路径 B：纯搜索 → 沿用旧直接重启路径
  _emitRetryAggregateSearch({
    taskType,
    chatIdForSearch,
    originalTaskId: cardData.taskId,
    params,
    msgContent: msg?.content
  });
}

/**
 * 实际 emit aggregate-search（路径 A 用户确认后、路径 B 直接调）
 *
 * @param {object} opts
 * @param {'RESTART'|'CONTINUE'} opts.taskType
 * @param {string} opts.chatIdForSearch
 * @param {string} opts.originalTaskId
 * @param {object|null} opts.params  { selectedModules, matchedBossJobId, resumeCount }
 * @param {string} [opts.msgContent]
 */
function _emitRetryAggregateSearch({
  taskType,
  chatIdForSearch,
  originalTaskId,
  params,
  msgContent
}) {
  const basePayload = {
    chatId: chatIdForSearch,
    taskType,
    originalTaskId,
    content: msgContent,
    ...(params || {})
  };

  // ★ 在途任务拦截：已有"占位未绑定 / create 在途"的任务 → 直接跳过，避免连点出现多张状态卡 + 多次 create
  if (_hasInflightTaskForChat(chatIdForSearch)) {
    console.log(`[ChatCard] retry ${taskType} 跳过：该 chat 已有在途任务（占位未绑定 / 创建中）`);
    return false;
  }

  const canCreate = store.getters["SearchTasks/canCreateForChat"];
  if (typeof canCreate === "function" && !canCreate(chatIdForSearch)) {
    console.warn(`[ChatCard] retry ${taskType} 拒绝：该 chat 已有进行中任务`);
    emit("aggregate-search", basePayload);
    return false;
  }

  const placeholderMsgId = pushTaskStatusPlaceholdersByModules(
    chatIdForSearch,
    params?.selectedModules
  );
  emit("aggregate-search", { ...basePayload, placeholderMsgId });
  return true;
}

function onTaskCardClearAndRestart(msg, payload) {
  console.log("[ChatCard] task_completion_card action=clear-and-restart", { msg, payload });
  _retriggerTaskFromCard("RESTART", msg, payload);
}
function onTaskCardKeepAndIncrement(msg, payload) {
  console.log("[ChatCard] task_completion_card action=keep-and-increment", { msg, payload });
  _retriggerTaskFromCard("CONTINUE", msg, payload);
}
function onTaskCardUnknownAction(msg, payload) {
  console.warn("[ChatCard] task_completion_card 未知 action", { msg, payload });
}

/**
 * AI 职位画像卡片（AIProfileActionPanel）retryMode 下的「清空重新搜索 / 保留增量搜索」。
 *
 * 与「查看结果完成卡」的同名按钮功能一致（RESTART / CONTINUE），区别：
 *   - originalTaskId 取自消息的 previousSearchTaskId（streamChat 新增字段）
 *   - 搜索参数直接用卡片当前 getState（用户在卡片里填的 selectedModules / 简历份数 / BOSS 职位），
 *     不再额外插 RetryConfigCard（卡片本身已是配置面板）
 *
 * @param {object} msg        AI_SEARCH 消息（带 previousSearchTaskId / searchConditionId）
 * @param {'RESTART'|'CONTINUE'} taskType
 * @param {object} panelState AIProfileActionPanel.getState() → { selectedModules, matchedBossJobId, resumeCount }
 */
function onAiPanelRetry(msg, taskType, panelState) {
  const chatIdForSearch = msg?.chatId || props.chatId || currentChatId.value;
  const originalTaskId = msg?.previousSearchTaskId;
  if (!chatIdForSearch) {
    console.warn(`[ChatCard] AIProfile retry ${taskType}: 没拿到 chatId，跳过`);
    return;
  }
  console.log("[ChatCard] AIProfile retry", { taskType, originalTaskId, panelState });

  if (props.embedded) {
    if (_isAggregateClickDebounced(chatIdForSearch, taskType)) return;
    _emitRetryAggregateSearch({
      taskType,
      chatIdForSearch,
      originalTaskId,
      params: {
        selectedModules: panelState?.selectedModules || { search: true, recommend: false },
        matchedBossJobId: panelState?.matchedBossJobId || null,
        resumeCount: panelState?.resumeCount ?? null
      },
      msgContent: msg?.content
    });
    return;
  }
  // 非嵌入式（浮窗）模式：沿用普通搜索入口
  handleSearch(msg);
}

/**
 * RetryConfigCard "启动聚合搜索" 按钮回调。
 * 把用户填的 resumeCount 覆盖到 params 上，调 _emitRetryAggregateSearch 走原链路。
 * 同时把 cardData.actionExecuted=true 锁定 UI（输入框 disabled + 按钮文案变化）。
 */
function onRetryConfigStart(msg, payload) {
  const cd = msg?.cardData;
  if (!cd) return;
  const resumeCount = Number(payload?.resumeCount) || cd.initialResumeCount;
  const taskType = cd.configType;
  const chatIdForSearch = cd.chatId;

  console.log("[ChatCard] retry_config_card start", {
    taskType,
    resumeCount,
    originalTaskId: cd.originalTaskId
  });

  // 锁定卡片 UI（input disabled + 按钮变"聚合搜索已启动"）
  cd.actionExecuted = true;
  cd.initialResumeCount = resumeCount;

  const proceeded = _emitRetryAggregateSearch({
    taskType,
    chatIdForSearch,
    originalTaskId: cd.originalTaskId,
    params: {
      selectedModules: cd.selectedModules,
      matchedBossJobId: cd.matchedBossJobId,
      resumeCount
    },
    msgContent: msg?.content
  });

  // 同步就被拦下（在途 / 已有进行中任务）→ create 根本没发起 → 立刻解锁，别卡在"聚合搜索已启动"
  if (!proceeded) {
    cd.actionExecuted = false;
    return;
  }
  // create 已发起：记录这张卡，若异步创建失败则在 pendingCreate 失败 watch 里解锁恢复
  if (msg?.id && chatIdForSearch) {
    pendingRetryCardByChat.value = {
      ...pendingRetryCardByChat.value,
      [chatIdForSearch]: msg.id
    };
  }
}

// 换行处理
const newLine = () => {
  chatMessage.value += "\n";
};

// 开始拖动
const startDrag = (event) => {
  if (props.expanded) return; // 只在全屏模式下禁止拖动，纵向展开模式允许拖动

  // 防止文本选择
  event.preventDefault();

  const card = chatCardRef.value?.$el || chatCardRef.value;
  if (!card) return;

  const rect = card.getBoundingClientRect();

  // 记录初始位置
  initialX.value = event.clientX;
  initialY.value = event.clientY;

  // 如果是第一次拖动，计算初始偏移量
  if (!offsetX.value && !offsetY.value) {
    offsetX.value = rect.left;
    offsetY.value = rect.top;
  }

  isDragging.value = true;

  // 添加移动和结束拖动事件监听
  document.addEventListener("mousemove", doDrag);
  document.addEventListener("mouseup", endDrag);
};

// 拖动中
const doDrag = (event) => {
  if (!isDragging.value) return;

  // 使用 requestAnimationFrame 优化性能
  requestAnimationFrame(() => {
    // 计算移动距离
    const deltaX = event.clientX - initialX.value;
    const deltaY = event.clientY - initialY.value;

    // 更新位置 (使用直接计算方式而不是累加)
    const newOffsetX = offsetX.value + deltaX;
    const newOffsetY = offsetY.value + deltaY;

    // 确保不超出屏幕边界
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const card = chatCardRef.value?.$el || chatCardRef.value;

    if (card) {
      const rect = card.getBoundingClientRect();
      const cardWidth = rect.width;
      const cardHeight = rect.height;

      // 右边界限制 (保留20px在视图内)
      const maxX = windowWidth - cardWidth + 20;
      // 左边界限制 (保留20px在视图内)
      const minX = -20;
      // 底部边界限制 (保留20px在视图内)
      const maxY = windowHeight - cardHeight + 20;
      // 顶部边界限制 (保留50px的顶部空间)
      const minY = 50;

      // 应用边界限制
      offsetX.value = Math.min(Math.max(newOffsetX, minX), maxX);
      offsetY.value = Math.min(Math.max(newOffsetY, minY), maxY);
    } else {
      // 如果没有获取到元素，直接更新位置
      offsetX.value = newOffsetX;
      offsetY.value = newOffsetY;
    }

    // 更新初始位置为当前位置
    initialX.value = event.clientX;
    initialY.value = event.clientY;
  });
};

// 结束拖动
const endDrag = () => {
  if (!isDragging.value) return;

  isDragging.value = false;

  // 确保聊天框至少一半在视图内
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  const card = chatCardRef.value?.$el || chatCardRef.value;

  if (card) {
    const rect = card.getBoundingClientRect();
    const cardWidth = rect.width;
    const cardHeight = rect.height;

    // 如果聊天框超过一半在屏幕外，则将其拉回
    if (offsetX.value + cardWidth < cardWidth / 2) {
      offsetX.value = 0;
    }
    if (offsetX.value > windowWidth - cardWidth / 2) {
      offsetX.value = windowWidth - cardWidth;
    }
    if (offsetY.value + cardHeight < cardHeight / 2) {
      offsetY.value = 0;
    }
    if (offsetY.value > windowHeight - cardHeight / 2) {
      offsetY.value = windowHeight - cardHeight;
    }
  }

  document.removeEventListener("mousemove", doDrag);
  document.removeEventListener("mouseup", endDrag);

  // 保存最后位置到本地存储（可选）
  try {
    localStorage.setItem(
      "chatCardPosition",
      JSON.stringify({
        x: offsetX.value,
        y: offsetY.value
      })
    );
  } catch (e) {
    console.error("无法保存聊天卡片位置:", e);
  }
};

// 清理事件监听
onUnmounted(() => {
  document.removeEventListener("mousemove", doDrag);
  document.removeEventListener("mouseup", endDrag);
  document.removeEventListener("compositionstart", () => (isComposing.value = true));
  document.removeEventListener("compositionend", () => (isComposing.value = false));

  // 解绑聊天容器 scroll 监听
  const chatEl = document.querySelector(".chat-content");
  if (chatEl) chatEl.removeEventListener("scroll", _handleChatScroll);

  // 中断流式响应
  if (chatFluxStatus.value && abortController.value) {
    abortController.value.abort();
  }

  console.log("ChatCard组件已卸载");
});

// 使用计算属性获取面板尺寸样式
const largePanelStyle = computed(() => {
  // 如果是三方企业模式，不使用传入的宽度
  if (visibleThirdSwitchPlus.value) {
    return chatPanelLargeStyle.value;
  }

  // 正常模式
  if (props.containerWidth && props.containerHeight) {
    return {
      width: `${props.containerWidth}px`,
      height: `${props.containerHeight}px`,
      top: `${props.containerTop}px`,
      left: `${props.containerLeft}px`
    };
  }
  // 默认样式
  return {};
});

// 获取header可见性和高度
const headerVisible = computed(() => store.getters.getHeaderVisible);
const headerHeight = computed(() => store.getters.getHeaderHeight);

//三方显示隐藏控制开关
const visibleThirdSwitch = computed(() => {
  return store.getters.getUserInfo?.extendData?.plan || "";
});
const visibleThirdSwitchPlus = computed(() => {
  return ["PlanA"].includes(visibleThirdSwitch.value);
});

// 计算大型聊天面板的样式
const chatPanelLargeStyle = computed(() => {
  // visibleThirdSwitchPlus（i人事融合 / 客户端模式）：
  // ChatCard 是嵌在右侧灰底主区里的"白卡片"，周围露出 24px padding
  // 参考 ihraisaas/src/App.tsx 第 959-960 行 p-6 bg-[#f0f2f5] + 白卡片 rounded-2xl shadow-xl
  if (visibleThirdSwitchPlus.value) {
    const drawerWidth = 300; // 与 MainLayout q-drawer width 一致
    const padding = 24; // p-6 = 24px
    // 客户端模式下，q-header（ClientHeader）的实际高度由 .layout-headerA / mini header 决定，
    // 这里直接用 headerHeight.value（store 维护的 header 高度，未隐藏时一般 40-48px）。
    const topOffset = (headerHeight.value || 0) + padding;
    return {
      top: `${topOffset}px`,
      left: `${drawerWidth + padding}px`,
      right: `${padding}px`,
      bottom: `${padding}px`,
      width: "auto",
      height: "auto"
    };
  }

  // 非客户端模式：保留原全屏铺满逻辑
  const baseStyle = {
    width: props.containerWidth ? `${props.containerWidth}px` : "calc(100% - 280px)",
    left: props.containerLeft ? `${props.containerLeft}px` : "280px"
  };

  if (headerVisible.value) {
    return {
      ...baseStyle,
      top: `${headerHeight.value}px`,
      height: `calc(100vh - ${headerHeight.value}px)`
    };
  } else {
    return {
      ...baseStyle,
      top: "0",
      height: "100vh"
    };
  }
});

// 添加 getChatTemplate 函数
const getChatTemplate = () => {
  return {
    id: uuidv4(),
    role: "",
    content: "",
    created: Math.floor(Date.now() / 1000),
    chatId: "",
    searchConditionId: "",
    model: "",
    object: "",
    type: "", // 用户类型，'user' 或 'bot'
    time: new Date().toLocaleTimeString(),
    timestamp: new Date().toISOString()
  };
};

// 展开/收缩聊天面板
const toggleExpand = () => {
  // 进入动画状态
  isAnimating.value = true;

  // 反转展开状态
  emit("update:expanded", !props.expanded);

  // 触发展开/缩小事件
  emit("toggle-expand");

  // 等待DOM更新后滚动到底部
  nextTick(() => {
    // 在动画完成后执行
    setTimeout(() => {
      scrollChatToBottom();
      isAnimating.value = false;
    }, 500); // 与CSS过渡时间一致
  });
};

// 纵向展开/收缩聊天面板
const toggleVerticalExpand = () => {
  // 进入动画状态
  isAnimating.value = true;

  // 如果是大屏模式，先切换到小屏模式再纵向展开
  if (props.expanded) {
    // 先切换到小屏模式
    emit("update:expanded", false);

    // 等待小屏切换完成后再进行纵向展开
    setTimeout(() => {
      verticalExpanded.value = true;

      // 等待DOM更新后滚动到底部
      nextTick(() => {
        scrollChatToBottom();
        isAnimating.value = false;
      });
    }, 300);
  } else {
    // 直接切换纵向展开状态
    verticalExpanded.value = !verticalExpanded.value;

    // 等待DOM更新后滚动到底部
    nextTick(() => {
      // 在动画完成后执行
      setTimeout(() => {
        scrollChatToBottom();
        isAnimating.value = false;
      }, 300);
    });
  }
};

// 滚动聊天到底部
const scrollChatToBottom = () => {
  const chatContent = document.querySelector(".chat-content");
  if (chatContent) {
    chatContent.scrollTop = chatContent.scrollHeight;
  }
};

/* ========================================================================== *
 * 历史消息分页加载（接口 GET /ihire/chat/getChatHistory?pageNo=&pageSize=）
 *   - pageNo=1 返回最新一页（页内时间正序：旧→新）
 *   - pageNo=2 返回更早一页 → prepend 到 internalMessages 头部
 *   - hasNext 标识还有更早的历史可拉
 *
 * 触发：
 *   - 首次加载：watch currentChatId 切换时调 loadHistory()
 *   - 向上滚动：onMounted 绑 .chat-content scroll 监听，scrollTop ≤ 50 时 loadMoreHistory()
 *
 * 关键：loadMoreHistory prepend 后必须用 (newScrollHeight - oldScrollHeight) 补 scrollTop，
 * 否则用户视觉上会"跳到顶部"，体验断裂。
 * ========================================================================== */
const HISTORY_PAGE_SIZE = 20;

const historyPagination = ref({
  pageNo: 0, // 0 = 还没加载过；1+ = 已加载页码
  pageSize: HISTORY_PAGE_SIZE,
  hasNext: false,
  total: 0
});
const historyLoadingMore = ref(false);

/**
 * 把后端返回的单条 chatHistory 转成内部消息对象。
 *
 * 分类：
 *   - role=user → type='user'
 *   - role=assistant + isTaskCompletionCardHtml → type='task_completion_card'（带 html prop）
 *   - role=assistant + isTaskChannelProgressCardJson → 返回 null（不渲染，UI 由 TaskStatusCard 接管）
 *   - role=assistant + 其它 → type='bot'
 *
 * @returns 内部消息对象，或 null（应跳过此条）
 */
function mapHistoryMessage(msg, chatIdToUse) {
  if (isTaskChannelProgressCardJson(msg.content)) {
    console.log(`[ChatCard] 跳过 TASK_CHANNEL_PROGRESS_CARD JSON 历史消息 id=${msg.id}`);
    return null;
  }
  const isUser = msg.role === "user";
  const isCompletionCard = !isUser && isTaskCompletionCardHtml(msg.content);

  return {
    id: msg.id || uuidv4(),
    role: msg.role,
    content: msg.content,
    created: new Date(msg.timestamp).getTime() / 1000,
    type: isUser ? "user" : isCompletionCard ? "task_completion_card" : "bot",
    time: new Date(msg.timestamp).toLocaleTimeString(),
    chatId: chatIdToUse,
    searchConditionId: msg.searchConditionId,
    previousSearchTaskId: msg.previousSearchTaskId,
    ...(isCompletionCard ? { html: msg.content } : {})
  };
}

// 修改加载历史消息（首页加载，pageNo=1，加完后 scroll 到底部）
const loadHistory = async () => {
  if (!currentChatId.value && !props.chatId) return;

  const chatIdToUse = currentChatId.value || props.chatId;

  // 清空内部消息列表 + 重置分页
  internalMessages.value = [];
  historyPagination.value = {
    pageNo: 0,
    pageSize: HISTORY_PAGE_SIZE,
    hasNext: false,
    total: 0
  };

  loading.value = true;
  try {
    const { data } = await getChatHistory(chatIdToUse, userInfo.value?.id, {
      pageNo: 1,
      pageSize: HISTORY_PAGE_SIZE
    });

    if (data?.chatHistory?.length) {
      data.chatHistory.forEach((msg) => {
        const mapped = mapHistoryMessage(msg, chatIdToUse);
        if (mapped) addMessage(mapped);
      });
    } else {
      console.log("没有历史消息");
    }

    // 维护分页元数据（后端不传时按"无下一页"处理）
    historyPagination.value = {
      pageNo: data?.pageNo ?? 1,
      pageSize: data?.pageSize ?? HISTORY_PAGE_SIZE,
      hasNext: data?.hasNext ?? false,
      total: data?.total ?? (data?.chatHistory?.length || 0)
    };

    // 加载完真实历史后，如果当前 chat 还有进行中 / 排队中 / 刚结束的任务，
    // 自动在末尾补一张 task_status 卡片（taskId 已绑定）
    // —— 解决用户切走再切回时看不到搜索状态的问题
    ensureTaskStatusCardForCurrentChat();

    // 触发历史加载完成事件
    emit("load-history-complete", data);
  } catch (e) {
    console.error("加载历史消息失败:", e);
    $q.notify({
      message: "加载历史消息失败",
      color: "negative",
      position: "top",
      timeout: 2000
    });

    // 添加错误消息到聊天
    const errorMessage = getChatTemplate();
    errorMessage.id = uuidv4();
    errorMessage.role = "assistant";
    errorMessage.type = "bot";
    errorMessage.content = `加载历史消息失败。错误信息: ${e?.message || "未知错误"}`;
    errorMessage.created = Math.floor(Date.now() / 1000);
    errorMessage.time = new Date().toLocaleTimeString();
    errorMessage.error = true;
    addMessage(errorMessage);
  } finally {
    loading.value = false;

    // 等待DOM更新后滚动到底部
    nextTick(() => {
      scrollChatToBottom();
    });
  }
};

/**
 * 向上滚动到顶时触发：加载更早的一页历史消息，prepend 到 internalMessages 头部。
 *
 * 关键：prepend 后通过 (newScrollHeight - oldScrollHeight) 补 scrollTop，
 * 保持用户当前视觉位置（不要"跳到顶"造成阅读断裂）。
 */
const loadMoreHistory = async () => {
  if (historyLoadingMore.value || loading.value) return;
  if (!historyPagination.value.hasNext) return;
  if (!currentChatId.value && !props.chatId) return;

  const chatIdToUse = currentChatId.value || props.chatId;
  const nextPage = (historyPagination.value.pageNo || 1) + 1;

  const el = document.querySelector(".chat-content");
  const prevScrollHeight = el?.scrollHeight || 0;
  const prevScrollTop = el?.scrollTop || 0;

  historyLoadingMore.value = true;
  try {
    const { data } = await getChatHistory(chatIdToUse, userInfo.value?.id, {
      pageNo: nextPage,
      pageSize: historyPagination.value.pageSize
    });

    if (data?.chatHistory?.length) {
      // 走 mapHistoryMessage 过滤掉 TASK_CHANNEL_PROGRESS_CARD 等不应渲染的消息
      const mapped = data.chatHistory
        .map((msg) => mapHistoryMessage(msg, chatIdToUse))
        .filter(Boolean);

      // ★ prepend 到头部（不能用 addMessage，那个会 push 到末尾 + scrollToBottom）
      internalMessages.value = [...mapped, ...internalMessages.value];

      // 等 DOM 渲染完后，按 scrollHeight 增量补 scrollTop 保持视觉位置
      await nextTick();
      if (el) {
        const newScrollHeight = el.scrollHeight;
        el.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);
      }
    }

    historyPagination.value = {
      pageNo: data?.pageNo ?? nextPage,
      pageSize: data?.pageSize ?? historyPagination.value.pageSize,
      hasNext: data?.hasNext ?? false,
      total: data?.total ?? historyPagination.value.total
    };
  } catch (e) {
    console.error("加载更多历史消息失败:", e);
    $q.notify({
      message: "加载更多历史消息失败",
      color: "negative",
      position: "top",
      timeout: 2000
    });
  } finally {
    historyLoadingMore.value = false;
  }
};

/**
 * .chat-content scroll handler：scrollTop ≤ 50px 且还有下一页时，触发 loadMoreHistory。
 * 用 passive listener（不需要 preventDefault，省主线程开销）。
 */
const _handleChatScroll = () => {
  const el = document.querySelector(".chat-content");
  if (!el) return;
  if (
    el.scrollTop <= 50 &&
    !historyLoadingMore.value &&
    !loading.value &&
    historyPagination.value.hasNext
  ) {
    loadMoreHistory();
  }
};

/**
 * 启动 / 重启 scroll 监听（chat-content DOM 可能延迟 mount，多试几次保险）
 */
function _bindChatScrollListener() {
  const el = document.querySelector(".chat-content");
  if (!el) return false;
  el.removeEventListener("scroll", _handleChatScroll);
  el.addEventListener("scroll", _handleChatScroll, { passive: true });
  return true;
}

// 添加消息到内部列表
const addMessage = (message) => {
  // 确保消息有所有必要的字段
  if (!message.id) message.id = uuidv4();
  if (!message.time) message.time = new Date().toLocaleTimeString();

  // 添加消息到内部列表
  internalMessages.value.push(message);
  // console.log("消息已添加到内部列表:", message);

  // 触发父组件更新(可选)
  emit("message-added", message);

  // 确保聊天滚动到底部
  nextTick(() => {
    scrollChatToBottom();
  });
};

// 修改消息处理函数
const setMsgContainer = (msg) => {
  console.log("处理消息:", msg);
  const content = msg.choices?.[0]?.delta?.content;

  if (content) {
    console.log("处理内容:", content);

    if (content === "[DONE]") {
      console.log("聊天结束", content);
      chatFluxStatus.value = false;
      return;
    }

    // 首先检查内部消息列表
    const messages = internalMessages.value;
    console.log("当前内部消息列表:", messages);

    const foundObject = messages.find((item) => item.id === msg.id);
    if (foundObject) {
      console.log("找到现有消息，更新内容:", foundObject);
      // 更新已存在消息的内容
      foundObject.content = foundObject.content + content;
      // 这两个字段可能在后续 chunk 才带过来（首个 chunk 没有）→ 补齐，保证卡片能切按钮
      if (msg.searchConditionId && !foundObject.searchConditionId) {
        foundObject.searchConditionId = msg.searchConditionId;
      }
      if (msg.previousSearchTaskId && !foundObject.previousSearchTaskId) {
        foundObject.previousSearchTaskId = msg.previousSearchTaskId;
      }
    } else {
      console.log("创建新消息");
      // 创建新消息
      const chatTemplate = getChatTemplate();
      chatTemplate.content = content;
      chatTemplate.id = msg.id;
      chatTemplate.chatId = msg.chatId;
      chatTemplate.searchConditionId = msg.searchConditionId;
      // 上一次搜索任务 id（streamChat 新增）：用于 AI 画像卡片切「清空重新/保留增量」按钮
      chatTemplate.previousSearchTaskId = msg.previousSearchTaskId;
      chatTemplate.model = msg.model;
      chatTemplate.object = msg.object;
      chatTemplate.created = msg.created;
      chatTemplate.role = "assistant";
      chatTemplate.type = "bot";
      chatTemplate.time = new Date().toLocaleTimeString();

      console.log("创建的新消息:", chatTemplate);

      // 如果收到服务端返回的 chatId，更新状态
      if (msg.chatId && !currentChatId.value) {
        console.log("更新chatId:", msg.chatId);
        currentChatId.value = msg.chatId;
        // 更新 vuex 中的 activeChatId
        store.commit("SET_ACTIVE_CHAT_ID", msg.chatId);
        // 触发列表刷新
        store.commit("SET_NEED_REFRESH_LIST", true);
        isNewChat.value = false;
      }
      // 将消息添加到内部列表
      addMessage(chatTemplate);
      console.log("消息已添加到内部列表");
    }

    // 确保聊天滚动到底部
    nextTick(() => {
      scrollChatToBottom();
    });
  } else {
    console.log("消息没有内容:", msg);
  }
};

// 添加错误响应函数
const addErrorResponse = (userContent, error) => {
  const botMessage = getChatTemplate();
  botMessage.id = uuidv4(); // 确保有唯一ID
  botMessage.role = "assistant";
  botMessage.type = "bot";
  botMessage.content = `抱歉，服务器响应出错。请稍后再试或联系管理员。错误信息: ${
    error?.message || "未知错误"
  }`;
  botMessage.created = Math.floor(Date.now() / 1000);
  botMessage.time = new Date().toLocaleTimeString();
  botMessage.error = true; // 标记为错误消息
  botMessage.chatId = currentChatId.value || props.chatId || "";

  // 添加到内部消息列表
  addMessage(botMessage);

  // 通知服务器处理错误（可选）
  try {
    const errorData = {
      type: "error",
      message: error?.message || "未知错误",
      timestamp: new Date().toISOString(),
      userContent: userContent
    };
    console.error("发送错误信息到服务器:", errorData);
    // 这里可以添加向服务器报告错误的代码
  } catch (e) {
    console.error("报告错误失败:", e);
  }
};

// 发送聊天消息
const sendChatMessage = async (msg) => {
  console.log("发送聊天消息开始执行", { chatFluxStatus: chatFluxStatus.value });

  // 如果正在输出中，则停止输出
  if (chatFluxStatus.value) {
    emit("stop-stream");
    chatFluxStatus.value = false;
    if (abortController.value) {
      abortController.value.abort();
      abortController.value = null;
    }
    return;
  }

  const messageText = msg || chatMessage.value.trim();
  console.log("发送聊天消息", messageText, sending.value, isComposing.value);

  if (messageText === "") return;
  if (sending.value) return;
  if (isComposing.value) return;

  // 标记首次消息状态
  if (!isFirstMessage.value) {
    isFirstMessage.value = true;
  }

  chatMessage.value = "";
  sending.value = true;

  try {
    // 添加用户消息
    const userMessage = getChatTemplate();
    userMessage.role = "user";
    userMessage.type = "user";
    userMessage.content = messageText;
    userMessage.created = Math.floor(Date.now() / 1000);
    userMessage.time = new Date().toLocaleTimeString();
    userMessage.chatId = currentChatId.value || props.chatId || "";

    console.log("准备发送用户消息:", userMessage);

    // 将用户消息添加到聊天列表
    addMessage(userMessage);

    // 等待DOM更新后滚动到底部
    nextTick(() => {
      scrollChatToBottom();
    });

    // 创建新的 AbortController 并标记状态
    abortController.value = new AbortController();
    chatFluxStatus.value = true;

    try {
      // 准备请求数据
      const aiRequestMsg = {
        chatId: currentChatId.value || props.chatId || "",
        userId: userInfo.value?.id,
        searchConditionId: store.getters.getSearchConditionId,
        prompt: messageText
      };

      console.log("准备发送AI请求:", aiRequestMsg);

      // 发送 AI 请求
      fetchStream(
        `${process.env.VUE_APP_API_BASE_URL}/ihire/chat/streamChat`,
        aiRequestMsg,
        (message) => {
          try {
            const jsonString = message.replace(/^data:/, "").trim();
            if (!jsonString) return;

            const msg = JSON.parse(jsonString);
            console.log("收到流式响应:", msg);
            setMsgContainer(msg);
          } catch (error) {
            chatFluxStatus.value = false;
            console.error("消息解析错误:", error, message);
            addErrorResponse(messageText, error);
          }
          nextTick(() => {
            scrollChatToBottom();
          });
        },
        (error) => {
          chatFluxStatus.value = false;
          console.error("Stream error:", error);
          $q.notify({
            message: "发送失败: " + (error?.message || "网络错误"),
            color: "negative",
            position: "top",
            timeout: 3000
          });

          addErrorResponse(messageText, error);
        },
        () => {
          chatFluxStatus.value = false;
          console.log("聊天正常结束");
        },
        abortController.value // 传入 AbortController
      );
    } catch (streamError) {
      console.error("流式响应出错:", streamError);
      chatFluxStatus.value = false;
      // 添加错误回应
      addErrorResponse(messageText, streamError);
    }
  } catch (e) {
    console.error("发送消息失败:", e);
    $q.notify({
      message: "发送失败",
      color: "negative",
      position: "top"
    });
    // 添加错误回应
    addErrorResponse(messageText, e);
  } finally {
    sending.value = false;
  }
};

// 设置流式响应结束
const endStreamResponse = () => {
  chatFluxStatus.value = false;
  abortController.value = null;
};

// 监听 props.chatId 和 latestChatId 的变化
watch(
  [() => props.chatId, () => latestChatId.value],
  ([newChatId, newLatestChatId]) => {
    // 优先使用 props.chatId，如果为空则使用 latestChatId
    const effectiveId = newChatId || newLatestChatId;

    if (effectiveId) {
      isNewChat.value = false;
      abortController.value?.abort();
      chatFluxStatus.value = false;
      currentChatId.value = effectiveId; // 更新内部的 chatId
      loadHistory(); // 加载历史消息
    } else {
      currentChatId.value = ""; // 清空内部的 chatId
      // 这里不清空消息列表，由父组件控制
    }
  },
  { immediate: true }
); // 立即执行一次

// 监听父组件传入的消息变化
watch(
  () => props.messages,
  (newMessages) => {
    console.log("父组件消息列表更新:", newMessages);

    // 如果内部消息为空且父组件提供了消息，则使用父组件的消息
    if (internalMessages.value.length === 0 && newMessages.length > 0) {
      console.log("使用父组件提供的消息");
      internalMessages.value = [...newMessages];
    }
  },
  { deep: true }
);

// 兜底滚动：只要消息**数量**有变化（新消息插入 / 历史加载 / 占位卡片 push / task_status 回放）
// 都自动滚到底。不监听 deep 是为了避免流式 content 累加时频繁刷新（流式那条路径已经
// 在 fetchStream onData 自己 nextTick(scrollChatToBottom) 处理过了）。
watch(
  () => displayMessages.value.length,
  (newLen, oldLen) => {
    if (newLen > (oldLen || 0)) {
      nextTick(() => {
        try {
          scrollChatToBottom();
        } catch (_e) {
          /* ignore */
        }
      });
    }
  }
);

/**
 * 监听 SSE 推过来的服务端聊天消息（store.serverPushedMessage）。
 *
 * 时序：
 *   SseManager 收到 scenario='CHAT' 消息 → commit SET_SERVER_PUSHED_MESSAGE
 *   → 此 watch 触发 → 若 chatId 匹配当前 chat → 把 message push 到 internalMessages
 *
 * 消息形态由后端定，content 是完整 HTML（如 TASK_COMPLETION_CARD 任务完成卡片）。
 * 用新类型 'server_html'，让 template v-html 直接渲染（不走 markdown-it）。
 *
 * 已 push 的 message.id 做去重，避免同一个消息被重复 push（store ts 变化但 message.id 不变时）。
 */
const pushedServerMsgIds = ref(new Set());
watch(
  () => store.state.chatList?.serverPushedMessage,
  (evt) => {
    if (!evt || !evt.chatId || !evt.message) return;
    const activeChatId = currentChatId.value || props.chatId;
    if (!activeChatId) return;
    if (String(evt.chatId) !== String(activeChatId)) {
      // 不是当前 chat：不渲染（用户切回该 chat 时由 loadHistory 从后端拿历史消息）
      return;
    }
    const msgId = evt.message.id;
    if (msgId && pushedServerMsgIds.value.has(msgId)) {
      console.log(`[ChatCard] server msg ${msgId} 已经 push 过，跳过去重`);
      return;
    }
    if (msgId) pushedServerMsgIds.value.add(msgId);

    // 识别任务完成卡片：content 是 TASK_COMPLETION_CARD HTML → 走 TaskCompletionCard
    //                  其它富文本 → 走 server_html 路径（普通 v-html 渲染，无按钮事件代理）
    const content = evt.message.content || "";

    // 旧版后端的"任务进度卡片 JSON"消息直接过滤掉，不渲染
    // （任务进度由 TaskStatusCard 通过 store reactive 实时绘制）
    if (isTaskChannelProgressCardJson(content)) {
      console.log(`[ChatCard] 跳过 TASK_CHANNEL_PROGRESS_CARD JSON SSE 消息 id=${msgId}`);
      return;
    }

    const isCompletionCard =
      isTaskCompletionCardHtml(content) || evt.message.messageType === "TASK_COMPLETION_CARD";

    const wireMessage = {
      id: msgId || uuidv4(),
      type: isCompletionCard ? "task_completion_card" : "server_html",
      role: evt.message.role || "assistant",
      content,
      messageType: evt.message.messageType || "",
      time:
        typeof evt.message.timestamp === "string"
          ? evt.message.timestamp
          : new Date().toLocaleTimeString(),
      chatId: evt.chatId,
      user: "bot",
      // 任务卡片消息把 content 复制到 html 字段（TaskCompletionCard 的 prop 名）
      ...(isCompletionCard ? { html: content } : {})
    };
    internalMessages.value.push(wireMessage);
    nextTick(() => {
      try {
        scrollChatToBottom();
      } catch (_e) {
        /* ignore */
      }
    });
    console.log(
      `[ChatCard] 已渲染 server-pushed 消息 type=${wireMessage.messageType} chatId=${evt.chatId}`
    );
  },
  { deep: false }
);

// 组件挂载时初始化
onMounted(() => {
  console.log("ChatCard组件已挂载", {
    visible: props.visible,
    expanded: props.expanded,
    enableStream: props.enableStream,
    chatId: props.chatId || currentChatId.value
  });

  // 尝试从本地存储恢复位置（可选）
  try {
    const savedPosition = localStorage.getItem("chatCardPosition");
    if (savedPosition) {
      const position = JSON.parse(savedPosition);
      offsetX.value = position.x;
      offsetY.value = position.y;
    }
  } catch (e) {
    console.error("无法恢复聊天卡片位置:", e);
  }

  // 如果父组件传入了消息，则复制到内部消息列表
  if (props.messages && props.messages.length > 0) {
    console.log("复制父组件传入的消息到内部列表");
    internalMessages.value = [...props.messages];
  }
  // 如果有聊天ID，尝试加载历史记录
  else if (props.chatId || currentChatId.value) {
    console.log("尝试加载历史记录");
    loadHistory();
  }
  // 不添加默认欢迎消息，保持空白聊天

  // 绑定聊天容器 scroll 监听（向上滚到顶 → 加载更早历史）
  // nextTick 后 chat-content DOM 才存在；多试一次保险（loading 态时 DOM 可能不是目标容器）
  nextTick(() => {
    if (!_bindChatScrollListener()) {
      setTimeout(_bindChatScrollListener, 300);
    }
  });

  // 绑定键盘事件
  document.addEventListener("compositionstart", () => {
    isComposing.value = true;
  });

  document.addEventListener("compositionend", () => {
    isComposing.value = false;
  });
});

// 插入消息到输入框的方法
const insertMessageToInput = async (msg) => {
  console.log("接收到外部消息，准备插入到输入框:", msg);

  // 确保聊天框是最大状态
  if (!props.expanded) {
    console.log("切换聊天框到最大状态");
    // 更新扩展状态
    emit("update:expanded", true);
    // 触发切换事件
    emit("toggle-expand");

    // 等待动画完成
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // 确保聊天面板可见
  if (!props.visible) {
    console.log("显示聊天面板");
    emit("open-chat");
    await nextTick();
  }

  fillMessageToInput(msg);
};

const fillMessageToInput = async (msg) => {
  if (!chatFluxStatus.value && !sending.value) {
    setTimeout(() => {
      sendChatMessage(msg);
    }, 500);
  }
};

const inputMaxHeight = computed(() => {
  const vh = window.innerHeight;
  const halfScreen = vh * 0.5;
  return `${halfScreen}px`;
});

// 向外暴露方法
defineExpose({
  scrollToBottom: scrollChatToBottom,
  endStreamResponse,
  loadHistory,
  handleNewChat,
  clearCurrentChat,
  insertMessageToInput,
  fillMessageToInput,
  startSearchFromFilter,
  startContinueSearch,
  forceShowLoginRequired
});
</script>

<style scoped>
/*
  Workspace Toolbar（1:1 对照 ihraisaas/src/App.tsx 第 975 行）
    h-12 flex items-center justify-between px-6 border-b border-neutral-50
    bg-white/50 backdrop-blur-md shrink-0
*/
.workspace-toolbar {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  border-bottom: 1px solid #fafafa; /* border-neutral-50 */
  background: rgba(255, 255, 255, 0.5); /* bg-white/50 */
  backdrop-filter: blur(12px); /* backdrop-blur-md */
  -webkit-backdrop-filter: blur(12px);
  flex-shrink: 0;
  user-select: none;
  cursor: grab;
}
.workspace-toolbar:active {
  cursor: grabbing;
}
.toolbar-left {
  display: flex;
  align-items: center;
  gap: 16px; /* space-x-4 */
  min-width: 0;
}
.toolbar-title {
  /* text-sm font-black text-neutral-800 tracking-tight */
  margin: 0;
  font-size: 14px;
  font-weight: 900;
  color: #262626; /* neutral-800 */
  letter-spacing: -0.025em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.toolbar-job-code {
  /* text-[10px] px-2 py-0.5 bg-neutral-100 text-neutral-500 rounded-md font-mono font-bold */
  display: inline-flex;
  align-items: center;
  font-size: 10px;
  padding: 2px 8px;
  background: #f5f5f5; /* neutral-100 */
  color: #737373; /* neutral-500 */
  border-radius: 6px; /* rounded-md */
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-weight: 700;
  line-height: 1.4;
  flex-shrink: 0;
}
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.toolbar-btn {
  color: #a3a3a3; /* neutral-400 */
}
.toolbar-btn:hover {
  color: #14b8a6; /* primary-500 */
}

/*
  AI 职位画像消息（含 [&AI_SEARCH&]）专用 wrapper：
    - 提供统一的浅灰边框 + 圆角，把 markdown 渲染出的 JD 卡片和下方
      AIProfileActionPanel 视觉上包在同一个边框内
    - 用 :deep() 穿透 v-html 内容，重置 markdown JD div 自带的 inline border/padding/margin，
      避免双层边框
*/
.ai-jd-container {
  background: #f8f9fa;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 15px;
  margin: 10px 0;
}
.ai-jd-content :deep(> div) {
  background: transparent !important;
  border: 0 !important;
  border-radius: 0 !important;
  padding: 0 !important;
  margin: 0 !important;
  box-shadow: none !important;
}

/* 聊天面板样式 */
.chat-panel {
  position: fixed;
  display: flex;
  flex-direction: column;
  z-index: 1000;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
  overflow: hidden;
  border: none;
  transition: all 0.5s cubic-bezier(0.25, 0.1, 0.25, 1);
  transform-origin: bottom right;
  backface-visibility: hidden;
  will-change: transform, opacity, width, height;
}

.chat-panel-small {
  width: 380px;
  height: 500px;
  right: 80px;
  bottom: 20px;
  border-radius: 16px; /* rounded-2xl 对齐 ihraisaas 大卡片 */
  border: 1px solid #f5f5f5; /* border-neutral-100 */
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05); /* shadow-xl */
  transform: translateZ(0);
}

/*
  嵌入式模式（embedded=true）：作为 WorkspaceContainer 子组件，撑满父容器
  外层大卡片样式由 WorkspaceContainer 提供，本组件不再 fixed
*/
.chat-panel-host {
  position: absolute !important;
  inset: 0;
  width: 100% !important;
  height: 100% !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  border: 0 !important;
  background: transparent !important;
}

.chat-panel-large {
  position: fixed;
  top: 0;
  right: 0;
  /* 移除固定宽度，使用计算属性中的宽度 */
  /* width: 100%; */
  height: 100vh; /* 使用 100vh 而不是 100% 确保占据整个视口高度 */
  border-radius: 0;
  box-shadow: none;
  z-index: 1000;
  background-color: white;
  transition: all 0.3s;
}

/*
  客户端 / iHR 融合模式专用：嵌入式大白卡片
    - fixed 定位但 top/left/right/bottom 都留 padding，让外层灰底 #f0f2f5 露出
    - 圆角 16px、border-neutral-100、shadow-xl，1:1 对照 ihraisaas/src/App.tsx 第 960 行
*/
.chat-panel-large.embedded {
  border-radius: 16px;
  border: 1px solid #f5f5f5; /* border-neutral-100 */
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05); /* shadow-xl */
  background: #fff;
  overflow: hidden; /* 让内部圆角生效，不溢出 */
}

/* 聊天面板垂直展开时的样式 - 仅当不是大屏模式时应用 */
.chat-panel-small.vertical-expanded {
  height: calc(100vh - 80px) !important;
  width: 380px !important;
  position: fixed;
  bottom: 20px !important;
  right: 80px !important;
  top: auto !important;
  border-radius: 16px;
  z-index: 1000;
}

/* 拖动相关样式 */
.draggable-panel {
  cursor: move;
  transition: none;
}

.cursor-move {
  cursor: move;
}

.chat-content {
  flex: 1;
  overflow-y: auto;
  /* 1:1 对照 ihraisaas/src/components/AIAssistant/ChatPanel.tsx 第 205 行：
     bg-[#fcfcfc]（极浅灰），让里面的白色消息卡片视觉上"浮"出来 */
  background-color: #fcfcfc;
  padding: 16px;
  transition: all 0.4s ease;
  /* LoginRequiredPanel absolute inset-0 模糊背板要相对本容器定位 */
  position: relative;
}

.chat-input {
  background-color: white;
  padding: 8px 16px;
  transition: all 0.4s ease;
}

/* 聊天消息样式 */
.chat-messages {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 历史分页 hint：顶部"加载中" / "已加载全部"提示 */
.chat-history-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 0 4px;
  font-size: 12px;
  color: #a3a3a3;
  font-weight: 500;
  letter-spacing: -0.025em;
}
.chat-history-hint.loading {
  color: #525252;
}
.chat-history-hint.end {
  color: #d4d4d4;
  font-size: 11px;
}

.chat-message {
  display: flex;
  margin-bottom: 8px;
  transition: transform 0.3s ease;
}

.chat-message-bot {
  align-self: flex-start;
}

.chat-message-user {
  align-self: flex-end;
  flex-direction: row-reverse;
}

.chat-message-avatar {
  margin: 0 8px;
}

.chat-message-content {
  max-width: 80%;
}

/*
  消息卡片宽度（1:1 对照 ihraisaas/src/components/AIAssistant/Chat/MessageItem.tsx line 103-104）：
    - bot 消息：w-[600px] max-w-full → width: 600px（默认撑到 600px），容器更窄时 max-w-full 收缩
    - user 消息：max-w-[500px]
  覆盖默认 .chat-message-content 的 80%
*/
.chat-message-bot .chat-message-content {
  width: 600px;
  max-width: 100%;
}
.chat-message-user .chat-message-content {
  width: auto;
  max-width: 500px;
}

/*
  消息气泡 1:1 对照 ihraisaas/src/components/AIAssistant/Chat/MessageItem.tsx
    line 99-105：
      bubble class = "p-[20px] rounded-[16px] transition-all duration-300 relative"
      bot 额外：bg-white border border-neutral-200 shadow-[1px_1px_4px_4px_rgba(83,84,85,0.02)]
              rounded-tl-none w-[600px] max-w-full
      user 额外：bg-primary-500 border border-primary-500 text-white
               rounded-tr-none shadow-sm max-w-[500px]
*/
.chat-message-bubble {
  padding: 20px;
  border-radius: 16px;
  word-break: break-word;
  transition: all 0.3s;
  position: relative;
}

.chat-message-bot .chat-message-bubble {
  background-color: #fff;
  border: 1px solid #e5e7eb; /* border-neutral-200 */
  box-shadow: 1px 1px 4px 4px rgba(83, 84, 85, 0.02);
  border-top-left-radius: 0; /* rounded-tl-none */
  width: 100%; /* w-[600px] max-w-full：由 chat-message-content 的 max-width 接管 600px 上限 */
}

.chat-message-user .chat-message-bubble {
  background-color: var(--q-primary);
  border: 1px solid var(--q-primary);
  color: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05); /* shadow-sm */
  border-top-right-radius: 0; /* rounded-tr-none */
}

.chat-message-time {
  font-size: 0.7rem;
  margin-top: auto;
  margin-right: auto;
  text-align: left;
}

.chat-message-user .chat-message-time {
  text-align: right;
}

.chat-message-bot .chat-message-time {
  text-align: left;
}

/* 动画效果增强 */
.chat-panel :deep(.q-card__section) {
  transition: all 0.4s ease;
}

.chat-panel :deep(.q-btn:not([class*="btn-common"])) {
  transition: all 0.2s ease;
}

.chat-panel :deep(.q-btn:not([class*="btn-common"]):hover) {
  transform: scale(1.05);
}

/* 添加扩展内容的过渡样式 */
.expanded-content {
  animation: content-expand 0.5s ease-out;
}

@keyframes content-expand {
  from {
    opacity: 0.8;
    transform: scale(0.98);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* 覆盖卡片过渡效果 */
.q-card {
  transition-property: all;
  transition-duration: 0.5s;
  transition-timing-function: cubic-bezier(0.19, 1, 0.22, 1);
}

/* 消息操作按钮 */
.message-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  transition: opacity 0.2s ease;
  padding: 0 12px;

  .btn-common {
    height: 24px;
    opacity: 1;
    padding: 0 12px;
    border: 1px solid rgba(221, 221, 221, 1);
    transition: opacity 0.2s ease;

    &:deep(.q-icon) {
      font-size: 12px !important;
      opacity: 1;
      margin-right: 5px;
      color: #1f2329;
    }

    &:deep(.block) {
      font-size: 12px !important;
      font-weight: 400;
      line-height: 1;
    }

    &:hover {
      background-color: rgba(0, 0, 0, 0.04) !important;
      border: 1px solid #dddddd;
    }
  }

  .aggregation-search {
    border: none !important;
    color: #ffffff;
    background: linear-gradient(90deg, #5f66f4 0%, #d880df 100%);

    &:deep(.q-icon) {
      font-size: 14px !important;
      color: #ffffff;
    }

    &:hover {
      opacity: 0.7;
    }
  }

  .q-btn--round {
    border-radius: 4px;
  }
}

.message-actions:hover {
  opacity: 1;
}

/* 添加 AI 输出中的动画样式 */
.typing-indicator {
  display: flex;
  align-items: center;
  margin-top: 8px;
  margin-bottom: 4px;
}

.typing-indicator span {
  display: inline-block;
  width: 6px;
  height: 6px;
  background-color: var(--q-primary);
  border-radius: 50%;
  margin: 0 2px;
  opacity: 0.4;
  animation: typing 1s infinite ease-in-out;
  color: transparent;
  user-select: none;
}

.typing-indicator span:nth-child(1) {
  animation-delay: 200ms;
}

.typing-indicator span:nth-child(2) {
  animation-delay: 300ms;
}

.typing-indicator span:nth-child(3) {
  animation-delay: 400ms;
}

@keyframes typing {
  0% {
    transform: translateY(0);
    opacity: 0.4;
  }
  50% {
    transform: translateY(-4px);
    opacity: 0.8;
  }
  100% {
    transform: translateY(0);
    opacity: 0.4;
  }
}

/* Markdown样式 */
:deep(pre) {
  margin: 8px 0;
  padding: 12px;
  background: #f6f8fa;
  border-radius: 4px;
  font-size: 14px;
  line-height: 1.5;
  overflow-x: auto;
}

:deep(code) {
  font-family: Menlo, Monaco, Consolas, "Courier New", monospace;
}

:deep(p) {
  margin: 0;
  line-height: 1.6;
}

:deep(ul),
:deep(ol) {
  margin: 8px 0;
  padding-left: 20px;
}

:deep(blockquote) {
  margin: 8px 0;
  padding-left: 16px;
  border-left: 4px solid #ddd;
  color: #666;
}

/* 加载指示器样式 */
.loading-container {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100%;
  width: 100%;
  position: absolute;
  top: 0;
  left: 0;
  background-color: rgba(255, 255, 255, 0.9);
  z-index: 10;
}

/* 输入框容器样式 */
.input-container {
  display: flex;
  flex-direction: column;
  position: relative;
  padding: 10px 24px;
  border-radius: 32px;
  background-color: #f5f5f5;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05) inset;
  min-height: 80px;
}

.message-input {
  padding-right: 40px;
  padding-bottom: 40px;
}

.message-input :deep(.q-field__control) {
  background: transparent;
  box-shadow: none;
  min-height: 40px;
}

.message-input :deep(.q-field__native) {
  height: 80px;
  max-height: 150px;
  overflow-y: auto;
  scrollbar-width: thin;
  line-height: 1.5;
  padding: 4px 0;
  resize: none;
}

.message-input :deep(.q-field__native::-webkit-scrollbar) {
  width: 6px;
}

.message-input :deep(.q-field__native::-webkit-scrollbar-track) {
  background: transparent;
}

.message-input :deep(.q-field__native::-webkit-scrollbar-thumb) {
  background-color: #bbb;
  border-radius: 3px;
}

.message-input :deep(.q-field__marginal) {
  height: 40px;
}

.send-button-container {
  position: absolute;
  bottom: 10px;
  right: 12px;
  z-index: 5;
}

.send-button {
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s ease;
}

.send-button:hover {
  transform: scale(1.05);
}

/* 空聊天提示 */
.empty-message-hint {
  padding: 20px;
  color: rgba(0, 0, 0, 0.6);
}

.welcome-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--q-primary);
  margin-bottom: 16px;
  text-align: center;
}

.welcome-features {
  margin-bottom: 16px;
  padding: 20px;
  background-color: rgba(0, 0, 0, 0.02);
  border-radius: 8px;
}

.feature-item {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
  font-size: 15px;
  color: rgba(0, 0, 0, 0.75);
}

.feature-item:last-child {
  margin-bottom: 0;
}

/* 居中输入框样式 */
.centered-input {
  position: absolute !important;
  left: 0 !important;
  right: 0 !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
  width: 90% !important;
  max-width: 90% !important;
  margin: 0 auto !important;
  transition: all 0.3s cubic-bezier(0.19, 1, 0.22, 1) !important;
  /* box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1) !important; */
  border-radius: 12px !important;
  z-index: 10 !important;
}

/* 三方企业模式样式 */
.third-party-mode {
  width: calc(100% - 280px) !important; /* 固定宽度，减去左侧菜单宽度 */
  right: 0 !important;
  left: 280px !important; /* 与左侧菜单宽度一致 */
}
/* 保持文本格式的样式 */
.bot-message-formatted {
  white-space: pre-wrap; /* 保持换行符和空格 */
  word-wrap: break-word; /* 长单词换行 */
  word-break: break-word; /* 强制长单词换行 */
  line-height: 1.6; /* 行高 */
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  overflow-wrap: break-word; /* 兼容性更好的换行 */
}
</style>
