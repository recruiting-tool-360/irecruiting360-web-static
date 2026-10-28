<template>
  <!--
    iHR / 客户端模式：root 必须严格 = q-drawer__content 高度（不能 min-height: 100vh）。
    否则 root 比父容器高 → q-drawer 整体外滚 → 底部「设置功能」按钮被一起滚走。
    严格高度 + .iHR-style flex column → .iHR-job-list 内部 overflow:auto + .iHR-bottom-actions 钉底。

    浏览器模式：保留 min-height 兼容旧布局（q-list 没设内部 overflow，原本依赖外滚）。
  -->
  <div
    :class="visibleThirdSwitchPlus && 'iHR-style'"
    :style="visibleThirdSwitchPlus ? { height: '100%' } : { height: '100%', minHeight: '100vh' }"
  >
    <!-- 新建AI聊天按钮 -->
    <div class="q-mx-md q-my-md" v-if="!visibleThirdSwitchPlus">
      <q-btn class="full-width q-px-none" color="primary" flat @click="handleNewChat">
        <div class="full-width flex justify-start items-center">
          <q-icon name="add" size="sm" />
          &nbsp;&nbsp;&nbsp;&nbsp;新建AI聊天
        </div>
      </q-btn>
    </div>

    <!--
      i人事融合 / 客户端模式下的顶部 header
      1:1 参考 ihraisaas/src/components/AIAssistant/JobList.tsx 第 38-42 行：
        p-4 border-b border-neutral-100 flex items-center justify-between
          h3 text-sm font-semibold text-neutral-800: "招聘中职位"
          span text-[10px] bg-neutral-100 px-2 py-0.5 rounded-full text-neutral-500: "X个职位"
    -->
    <div v-if="visibleThirdSwitchPlus">
      <div class="iHR-list-header">
        <h3 class="iHR-list-title">招聘中职位</h3>
        <span class="iHR-list-count">{{ chatList?.length || 0 }}个职位</span>
      </div>
      <div v-if="tipsStatus" class="iHR-menu-tips flex relative-position q-pa-sm q-mx-sm q-mb-sm">
        <div>
          <q-icon class="q-mr-sm" name="info" size="xs" style="color: var(--q-primary-90)" />
        </div>
        <span class="col">点击职位唤起AI寻聘进行简历搜索</span>
        <q-icon
          class="cursor-pointer absolute text-grey-7"
          name="clear"
          size="xs"
          @click="closeTips"
          style="right: 5px; top: 10px"
        />
      </div>
    </div>
    <!--    <q-separator />-->

    <!--
      职位列表渲染：
        - 三方融合 / 客户端模式（visibleThirdSwitchPlus=true）：1:1 还原 ihraisaas JobList
          一行 [Pin + 标题 + 状态icon]，下一行编号
        - 普通模式：保留原 q-item 结构
    -->
    <template v-if="visibleThirdSwitchPlus">
      <div class="iHR-job-list">
        <div
          v-for="item in sortedChatList"
          :key="item.id"
          class="job-item"
          :class="{
            active: currentChatId === item.id,
            pinned: isItemPinned(item.id),
            // 任务状态影响卡片整体背景色（1:1 对照 ihraisaas JobList.tsx 第 59-62 行）
            'status-processing': jobAggregateStatus(item.id).status === 'processing',
            'status-queued': jobAggregateStatus(item.id).status === 'queued',
            'status-resting': jobAggregateStatus(item.id).status === 'resting',
            'status-stopped': jobAggregateStatus(item.id).status === 'stopped'
          }"
          @click="selectChat(item)"
        >
          <!-- 左侧：pin / 标题 / 编号（原结构保留） -->
          <div class="job-item-content">
            <!-- 第一行：pin + 标题 -->
            <div class="job-item-row">
              <button
                type="button"
                class="pin-btn"
                :class="{ active: isItemPinned(item.id) }"
                :title="isItemPinned(item.id) ? '取消置顶' : '置顶职位'"
                @click="togglePin(item.id, $event)"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="12"
                  height="12"
                  :fill="isItemPinned(item.id) ? 'currentColor' : 'none'"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M12 17v5" />
                  <path
                    d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"
                  />
                </svg>
              </button>
              <div class="job-title-wrap">
                <h4 class="job-title">{{ parseJobName(item.name).title || item.name }}</h4>
                <span v-if="isJobProfileOff(item)" class="job-profile-off-tag">未开启</span>
              </div>
            </div>
            <!-- 第二行（仅在有 code 时）：编号 -->
            <div v-if="parseJobName(item.name).code" class="job-item-row job-item-row-bottom">
              <p class="job-code">({{ parseJobName(item.name).code }})</p>
            </div>
          </div>

          <!--
            右侧：任务状态列（1:1 对照 ihraisaas JobList.tsx 第 92-141 行）
            竖向：icon 在上 + 文字在下；min-w 60px 保证文字不被挤
            - idle / completed-but-current-selected → 显示原 briefcase 按钮（发送 JD）
            - processing → 蓝 spinner + "进行中..." pulse
            - queued / resting → 橙 clock + "排队中 N"
            - stopped (非 manual) → 红 alert + "异常停止" pulse
            - completed (未选中) → 绿 check + "已完成"
          -->
          <div class="job-item-status">
            <template
              v-if="
                jobAggregateStatus(item.id).status === 'completed' &&
                currentChatId !== item.id &&
                !acknowledgedCompletedIds.includes(item.id)
              "
            >
              <!-- 已完成（非当前选中） -->
              <div class="status-completed-circle">
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M21.801 10A10 10 0 1 1 17 3.335" />
                  <path d="m9 11 3 3L22 4" />
                </svg>
              </div>
              <span class="status-label-text completed">已完成</span>
            </template>

            <template v-else>
              <div class="status-icons">
                <svg
                  v-if="jobAggregateStatus(item.id).status === 'processing'"
                  class="status-icon-spinner"
                  viewBox="0 0 24 24"
                  width="12"
                  height="12"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                <svg
                  v-else-if="
                    jobAggregateStatus(item.id).status === 'queued' ||
                    jobAggregateStatus(item.id).status === 'resting'
                  "
                  class="status-icon-clock"
                  viewBox="0 0 24 24"
                  width="12"
                  height="12"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <svg
                  v-else-if="jobAggregateStatus(item.id).status === 'stopped'"
                  class="status-icon-alert"
                  viewBox="0 0 24 24"
                  width="12"
                  height="12"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" x2="12" y1="8" y2="12" />
                  <line x1="12" x2="12.01" y1="16" y2="16" />
                </svg>
                <!-- idle / completed-当前选中：briefcase 按钮（保留原"发送 JD"业务） -->
                <button
                  v-else
                  type="button"
                  class="recruit-btn"
                  :title="
                    planInfo?.sendJdAuth
                      ? '发送当前职位的JD信息至AI招聘助理'
                      : '您当前无职位管理模块权限'
                  "
                  @click="
                    handleRecruitAction(item);
                    $event.stopPropagation();
                  "
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="12"
                    height="12"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                    <rect width="20" height="14" x="2" y="6" rx="2" />
                  </svg>
                </button>
              </div>
              <div class="status-label">
                <span
                  v-if="jobAggregateStatus(item.id).status === 'processing'"
                  class="status-label-text processing"
                  >进行中...</span
                >
                <span
                  v-else-if="
                    jobAggregateStatus(item.id).status === 'queued' ||
                    jobAggregateStatus(item.id).status === 'resting'
                  "
                  class="status-label-text queued"
                >
                  排队中{{
                    jobAggregateStatus(item.id).queuePosition > 0
                      ? " " + jobAggregateStatus(item.id).queuePosition
                      : ""
                  }}
                </span>
                <span
                  v-else-if="jobAggregateStatus(item.id).status === 'stopped'"
                  class="status-label-text stopped"
                  >异常停止</span
                >
              </div>
              <!--
                ★ 预计时间提示
                  - queued（排队中）→ 显示"预计 X 开始"（用 estimatedStartTime）
                  - processing / resting（进行中 / 休息中）→ 显示"预计 X 结束"（用 estimatedEndTime）
                  - 完成 / 失败状态不显示
                  显示条件：状态对得上 + 对应时间字段非空
                  时间格式：今天 → HH:mm；其它日期 → MM-dd HH:mm（详见 formatEstimatedTime）
                  数据来源：后端 /search/task/queue items[i].estimated{Start,End}Time
              -->
              <div v-if="estimateLabelFor(item.id)" class="status-estimated">
                {{ estimateLabelFor(item.id) }}
              </div>
            </template>
          </div>
        </div>

        <div v-if="chatList.length === 0 && !loading" class="job-empty">暂无数据</div>
        <div v-if="loading" class="job-empty">
          <q-spinner color="primary" size="1.5em" />
          <div class="q-mt-xs text-grey text-caption">加载中...</div>
        </div>
      </div>
    </template>

    <!-- 普通模式：保留原 q-item 结构 -->
    <q-list v-else padding class="rounded-borders text-grey-9 q-pt-none">
      <q-item
        class="iHR-item-style q-py-md"
        v-for="(item, index) in chatList"
        :key="item.id"
        :class="index == 0 ? 'q-mt-none q-mb-sm' : 'q-my-sm'"
        clickable
        v-ripple
        :active="currentChatId === item.id"
        @click="selectChat(item)"
        active-class="iHR-menu-link my-menu-link text-grey-7"
      >
        <q-item-section avatar>
          <q-avatar size="md" color="primary" text-color="white">
            {{ item?.name?.charAt(0)?.toUpperCase() || "?" }}
          </q-avatar>
        </q-item-section>

        <q-item-section>
          <q-item-label>{{ item.name }}</q-item-label>
          <q-item-label caption>{{ item.createTime }}</q-item-label>
        </q-item-section>

        <q-item-section side>
          <q-btn round flat dense icon="more_horiz" size="sm" @click.stop>
            <q-menu
              anchor="bottom left"
              self="top left"
              transition-show="flip-right"
              transition-hide="flip-left"
            >
              <q-list style="min-width: 50px">
                <q-item clickable v-close-popup @click.stop="openRenameDialog(item)">
                  <div class="flex justify-center items-center">
                    <q-icon name="edit" size="xs" />
                    <span class="q-ml-sm">重命名</span>
                  </div>
                </q-item>
                <q-item clickable v-close-popup @click.stop="handleDelete(item)">
                  <div class="flex justify-center items-center">
                    <q-icon name="delete" size="xs" color="negative" />
                    <span class="q-ml-sm">删除</span>
                  </div>
                </q-item>
              </q-list>
            </q-menu>
          </q-btn>
        </q-item-section>
      </q-item>

      <q-item v-if="chatList.length === 0 && !loading">
        <q-item-section class="text-center text-grey">暂无数据</q-item-section>
      </q-item>

      <q-item v-if="loading">
        <q-item-section class="text-center">
          <q-spinner color="primary" size="1.5em" />
          <div class="q-mt-xs text-grey text-caption">加载中...</div>
        </q-item-section>
      </q-item>
    </q-list>

    <!--
      ★ iHR / 客户端模式底部固定操作区：设置功能
      1:1 视觉还原 ihraisaas/src/components/AIAssistant/JobList.tsx 第 151-170 行
        - 外层 .iHR-bottom-actions：p-3 + border-t + space-y-2（垂直 gap）
        - 按钮 .iHR-settings-btn：白底圆角 + 1px neutral-200 border + neutral-500 文字
          hover：primary-500 文字 + primary-200 边框 + primary-50 背景
        - Settings 齿轮 icon（lucide-react）16×16

      不再用 Tailwind 类：Quasar preflight 关掉 + hover variants 失效，
      统一改 SCSS 控制（class 见下面 .iHR-settings-btn）
    -->
    <div v-if="visibleThirdSwitchPlus" class="iHR-bottom-actions">
      <button type="button" class="iHR-settings-btn" @click="handleOpenSettings">
        <svg
          class="iHR-settings-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path
            d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
          />
          <circle cx="12" cy="12" r="3" />
        </svg>
        <span>设置功能</span>
      </button>

      <!--
        版本号 + 立即更新提示行
        1:1 视觉还原 ihraisaas/src/components/AIAssistant/JobList.tsx 第 178-194 行
        - 版本号：text-[11px] neutral-400 font-bold tracking-tight
        - 有新版：primary-500 text-[11px] font-black + 1.5px 圆点脉冲 + "立即更新 🚀"
        - 无新版：neutral-300 text-[10px] font-medium "最新版本"
        点击 "立即更新" → 打开 UpdateModal（接 main 进程 autoUpdater 真实下载/进度/重启）
      -->
      <div class="iHR-version-row">
        <div class="iHR-version-row-left">
          <span class="iHR-version-text">版本：{{ currentVersionDisplay }}</span>
          <button
            v-if="newVersionAvailable"
            type="button"
            class="iHR-update-btn"
            @click="handleOpenUpdateModal"
          >
            <span class="iHR-update-dot" />
            立即更新 🚀
          </button>
        </div>
        <span v-if="!newVersionAvailable" class="iHR-version-latest">最新版本</span>
      </div>
    </div>

    <!-- 设置功能弹框（渠道启停 + 运行策略配置） -->
    <SettingsModal v-model="settingsVisible" />

    <!--
      自动更新弹框（Electron 客户端唯一更新 UI 入口）
      - 自动弹起：首次检测到更新 / 下载完成时
      - 手动弹起：点上方「立即更新 🚀」按钮
      - 主进程 setupAutoUpdater 已不再用 Electron 原生 dialog
    -->
    <UpdateModal v-model="updateModalOpen" :new-version="newVersionAvailable" />

    <!-- 重命名对话框 -->
    <q-dialog v-model="renameDialogVisible">
      <q-card style="min-width: 400px">
        <q-card-section>
          <div class="text-h6 text-grey-8">重命名</div>
        </q-card-section>

        <q-card-section>
          <q-input v-model="newName" label="请输入名称" autofocus @keyup.enter="handleRename" />
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat label="取消" color="primary" v-close-popup />
          <q-btn flat label="确定" color="primary" @click="handleRename" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, nextTick, watch } from "vue";
import { useQuasar } from "quasar";
import { useStore } from "vuex";
import {
  getChatList,
  deleteChat,
  renameChat,
  getChatHistory,
  createChat
} from "src/api/chat/ChatApi";
import { isElectronClient } from "src/util/openChannelLoginUrl";
import { generateJobPostingFromResume } from "src/util/jobPostingGenerator";
import { isFromMenu, isVisibleThirdA, usePlanVisibility } from "src/hooks/usePlanVisibility";
import notify from "src/util/notify";
import { ensureClientAuthority } from "src/util/checkClientAuthority";
import SettingsModal from "src/components/clients/SettingsModal.vue";
import UpdateModal from "src/components/clients/UpdateModal.vue";

const $q = useQuasar();
const store = useStore();

// 默认planA企业可使用， 无plan或plan不匹配时默认不可见
const { isVisible } = usePlanVisibility({
  visibleForPlans: ["PlanA"],
  defaultVisible: false
});

const planInfo = computed(() => {
  return store.getters.getUserInfo?.extendData;
});

//三方显示隐藏控制开关
let visibleThirdSwitch = computed(() => {
  return store.getters.getUserInfo?.extendData || "";
});
let headcountId = computed(() => {
  return store.getters.getUserInfo?.extendData?.headcountId || "";
});
let visibleThirdSwitchPlus = computed(() => {
  return ["PlanA"].includes(visibleThirdSwitch.value?.plan || "");
});
//是否来自于菜单
const isFromThirdMenu = computed(() => {
  return visibleThirdSwitch.value?.from === "recruit-assistant";
});
//是否来自于候选人详情页
const isFromCandidateList = computed(() => {
  return visibleThirdSwitch.value?.from === "recruit-workflow";
});

const userInfo = computed(() => store.getters.getUserInfo);

// 状态变量
const loading = ref(false);
const tipsStatus = ref(true);
const chatList = computed(() => store.getters.getChatList); // 使用Vuex中的聊天列表

/* ===== 置顶 & 排序（1:1 对照 ihraisaas JobList.tsx 第 24-29 行 sortedJobs） ===== */
const pinnedJobIds = computed(() => store.getters.getPinnedJobIds || []);

// 用户点击过的「已完成」职位 id —— 点过之后就不再显示"已完成"标记（点击即清除标记）。
const acknowledgedCompletedIds = ref([]);

/**
 * 给某个 chat（职位）行算任务聚合 UI 状态。结构：
 *   { status: 'idle' | 'processing' | 'queued' | 'resting' | 'stopped' | 'completed',
 *     queuePosition: number  // 排队中时 1-based 位置；否则 0
 *     task: <task obj> | null }
 *
 * 数据来源：SearchTasks store getter（已包装了"队列位置 + taskStatus → UI 状态"）
 * 详见 src/store/modules/SearchTasks.js 顶部注释。
 */
function jobAggregateStatus(chatId) {
  const getter = store.getters["SearchTasks/getJobAggregateStatus"];
  if (typeof getter !== "function") {
    return { status: "idle", queuePosition: 0, task: null };
  }
  return getter(chatId);
}

// ★ 一旦某职位「离开已完成态」（开始了新一轮任务 / 变 idle 等）→ 清掉它的「已读」标记。
//   这样该职位下次任务完成（且未被选中）时能重新显示「已完成」标记，而不是被上一次的已读永久压住。
watch(
  () => (chatList.value || []).map((c) => `${c.id}:${jobAggregateStatus(c.id).status}`).join(","),
  () => {
    const acked = acknowledgedCompletedIds.value;
    if (!acked.length) return;
    const next = acked.filter((id) => jobAggregateStatus(id).status === "completed");
    if (next.length !== acked.length) acknowledgedCompletedIds.value = next;
  }
);

/**
 * 格式化预计开始时间（来自后端 /search/task/queue items[i].estimatedStartTime）。
 *
 * 1:1 对照 ihraisaas JobList.tsx 第 133-135 行的 isToday + format 'HH:mm' / 'MM-dd HH:mm' 逻辑。
 * 自己实现而不引入 date-fns（项目没装，引入只为这一个函数不划算）。
 *
 * @param {string} iso  ISO 8601 字符串，如 "2026-05-26T14:25:18"
 * @returns {string}    今天 → "14:25"；其它 → "05-26 14:25"；非法 → ""
 */
function formatEstimatedTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const HH = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (isToday) return `${HH}:${mm}`;
  const MM = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${MM}-${dd} ${HH}:${mm}`;
}

/**
 * 按 chat 当前聚合状态返回"预计 X 开始/结束"标签文案；状态对不上 / 时间字段为空 → 返回空串
 * 调用方按 v-if="estimateLabelFor(id)" 决定显不显示
 *
 *   - queued     → 预计 HH:mm 开始 （拿 estimatedStartTime；用户在等开始，关心还要等多久）
 *   - processing → 预计 HH:mm 结束 （拿 estimatedEndTime；任务已开始，关心还要多久结束）
 *   - resting    → 预计 HH:mm 结束 （同上）
 *   - 其它       → ''
 */
function estimateLabelFor(chatId) {
  const info = jobAggregateStatus(chatId);
  const task = info?.task;
  if (!task) return "";
  if (info.status === "queued") {
    const t = formatEstimatedTime(task.estimatedStartTime);
    return t ? `预计 ${t} 开始` : "";
  }
  if (info.status === "processing" || info.status === "resting") {
    const t = formatEstimatedTime(task.estimatedEndTime);
    return t ? `预计 ${t} 结束` : "";
  }
  return "";
}

/** 列表渲染时用：置顶项排在前面 */
const sortedChatList = computed(() => {
  const all = Array.isArray(chatList.value) ? chatList.value : [];
  const pinSet = new Set(pinnedJobIds.value);
  return [...all].sort((a, b) => {
    const aP = pinSet.has(a?.id);
    const bP = pinSet.has(b?.id);
    if (aP && !bP) return -1;
    if (!aP && bP) return 1;
    return 0;
  });
});

/** 该 chat 当前是否置顶 */
function isItemPinned(id) {
  return pinnedJobIds.value.includes(id);
}

/** 切换置顶（事件 stopPropagation 防止冒泡触发选中） */
function togglePin(id, ev) {
  if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
  store.commit("togglePinJob", id);
}

/** 解析 chat.name 形如 "研发 (10001)" → { title: '研发', code: '10001' }；解析失败时 title=整 name */
function parseJobName(name) {
  const raw = String(name || "").trim();
  const m = raw.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (m) return { title: m[1].trim(), code: m[2].trim() };
  return { title: raw, code: "" };
}

/** 职位画像是否开启：契约类型仅允许 boolean | null，只有 true 代表开启。 */
function isJobProfileEnabled(item) {
  return item?.jobProfileEnabled === true;
}

/** 职位画像是否明确未开启；null 表示状态未知。 */
function isJobProfileOff(item) {
  return item?.jobProfileEnabled === false;
}
const currentChatId = computed(() => store.getters.getLatestChatId || "");
const renameDialogVisible = ref(false);
const newName = ref("");
const currentItem = ref(null);
//jobSearchFilterRef
const jobSearchFilterRef = computed(() => store.getters.getJobSearchFilterRefValue);
//ChatCardRef
const chatCardRef = computed(() => store.getters.getChatCardRefValue);

// 加载聊天列表
/**
 * 取 i 人事「在招职位」白名单：noauth/application/position 返回的职位 id 集合。
 *
 * 用途：左边职位列表数据仍来自 chatList，但用这个集合过滤 —— chatList 里 positionId
 * 不在该集合中的（职位已关闭 / 移除）就隐藏。
 *
 * 关联键用 positionId（用户指定）；同时把 headcountId 也并进集合做兜底，
 * 因为本项目部分链路把 headcountId 当 positionId 用（见 SSOLogin.rebuildPositionList），
 * chatList.positionId 实际可能存的是 headcountId 值。
 *
 * 返回 null 表示「拿不到/接口失败」→ 调用方不过滤（不会误把全部职位隐藏）。
 */
async function getActiveApplicationPositions() {
  try {
    console.log("[LeftMenu] getActiveApplicationPositions 请求在招职位");
    // 跟 noauth/addPools 一样直接调 i人事 noauth 接口（client 模式经 ihrBridge 自动拼 accessToken）。
    const resp = await window?.api?.ihrBridge?.getApplicationPosition?.();
    console.log(
      "[API-TRACE] GET /candidate/AiManager/client/noauth/application/position 返回值:",
      resp
    );
    // 接口不可用（非客户端 / 旧 preload）→ 返回 null，不过滤
    if (resp == null) {
      console.warn("[LeftMenu] getActiveApplicationPositions 跳过: ihrBridge 不可用");
      return null;
    }
    if (resp.success === false) {
      console.warn("[LeftMenu] getActiveApplicationPositions 失败:", {
        code: resp.code,
        errorCode: resp.errorCode,
        message: resp.message,
        httpStatus: resp.httpStatus
      });
      return null;
    }
    // 响应形态跟 SSOLogin.rebuildPositionList 一致：resp.data 直接是职位数组
    const positions = Array.isArray(resp.data) ? resp.data : [];
    const positionIds = positions
      .map((item) => item?.headcountId ?? item?.positionId)
      .filter((id) => id != null && id !== "");
    console.log(
      `[LeftMenu] getActiveApplicationPositions 成功: count=${positions.length}` +
        (positionIds.length ? ` ids=${JSON.stringify(positionIds)}` : "")
    );
    if (!Array.isArray(resp.data)) {
      console.warn("[LeftMenu] getActiveApplicationPositions 响应 data 不是数组:", resp.data);
    }
    return positions;
  } catch (e) {
    console.warn("[LeftMenu] getApplicationPosition 失败，跳过职位过滤/同步:", e?.message || e);
    return null;
  }
}

/** 职位画像字段快照签名：用于 diff，避免每次刷新都调 createChatPlus 写库。 */
function buildProfileSyncKey(item) {
  return JSON.stringify([
    item?.positionId ?? "",
    item?.name ?? "",
    item?.positionName ?? "",
    item?.jd ?? "",
    item?.jobProfileEnabled ?? null,
    item?.positionHarnessProfileStatus ?? null,
    item?.positionHarnessProfileId ?? null
  ]);
}

/** 最近一次成功同步到 createChatPlus 的职位画像快照（positionId -> 签名）。 */
const lastPositionProfileSyncSnapshot = new Map();

/**
 * 客户端模式：批量拉职位详情，返回 { [headcountId]: {...} }。
 *
 * 一次请求同时服务两件事，避免 JD 回填和画像字段各自再拉一遍：
 *   - 用 headcountBasic 生成 JD 文本（并 patch 到 store 的 positionJdCache）
 *   - 取 positionHarnessSwitch 里的 aiEvaluationEnabled / positionHarnessProfileStatus
 *
 * @returns {Promise<Record<string, object>|null>} null = 接口不可用/失败（调用方应跳过 createChatPlus 同步）
 */
async function fetchPositionDetailMap(positionIds) {
  const ihrBridge = window?.api?.ihrBridge;
  if (!ihrBridge || typeof ihrBridge.batchGetPositionDetailByIds !== "function") return null;
  const ids = Array.from(
    new Set((positionIds || []).filter((id) => id != null && id !== "").map((id) => String(id)))
  );
  if (ids.length === 0) return {};
  try {
    const res = await ihrBridge.batchGetPositionDetailByIds(ids);
    console.log(
      "[API-TRACE] POST /candidate/AiManager/client/noauth/headcount/v2/batch/getDetailByIds 返回值:",
      res
    );
    if (!res?.success || !Array.isArray(res.data)) {
      console.warn("[LeftMenu] batchGetPositionDetailByIds 失败:", res?.errorCode, res?.message);
      return null;
    }
    const map = {};
    for (const item of res.data) {
      // 匹配键：application.headcountId。优先 headcountBasic.headcountId，兜底平铺字段。
      const pid = item?.headcountBasic?.headcountId ?? item?.headcountId ?? item?.positionId;
      if (pid == null || pid === "") continue;

      const sw = item?.positionHarnessSwitch || {};
      let jd = "";
      try {
        if (item?.headcountBasic) {
          jd =
            generateJobPostingFromResume(item.headcountBasic, {
              salaryTypes: item?.salaryTypes || [],
              workYears: item?.workYears || [],
              positionTypes: item?.positionTypes || [],
              diplomaTypes: item?.diplomaTypes || []
            }) || "";
          if (jd) {
            store.commit("PATCH_POSITION_JD_CACHE", { positionId: String(pid), jd });
          }
        }
      } catch (e) {
        console.warn("[LeftMenu] generateJobPostingFromResume 失败:", e?.message || e);
      }

      map[String(pid)] = {
        jd,
        jobProfileEnabled: sw.jobProfileEnabled,
        aiEvaluationEnabled: sw.aiEvaluationEnabled,
        // 真实返回可能嵌在 positionHarnessSwitch，也可能平铺在详情根上，两种都兼容
        positionHarnessProfileStatus:
          item?.positionHarnessProfileStatus ?? sw.positionHarnessProfileStatus
      };
    }
    console.log(
      `[LeftMenu] batchGetPositionDetailByIds 返回 ${res.data.length} 条，命中 ${Object.keys(map).length} 个职位`
    );
    return map;
  } catch (e) {
    console.warn("[LeftMenu] batchGetPositionDetailByIds 异常:", e?.message || e);
    return null;
  }
}

/**
 * 把职位级画像字段合并到 chat items。
 *
 * 优先级（前面覆盖后面）：
 *   - jobProfileEnabled / positionHarnessProfileStatus：详情接口 > application/position > chatList
 *   - positionHarnessProfileId：application/position > chatList（详情接口不返）
 *   - aiEvaluationEnabled：详情接口 > chatList（chatList 不返）
 *
 * 匹配键：chatList.positionId === application.headcountId（客户端约定），
 * 同时把 application.positionId 也放进 map 兜底。
 */
function mergePositionProfileFields(chatList, positions, detailMap) {
  if (!Array.isArray(chatList)) return [];
  const positionMap = new Map();
  for (const p of positions || []) {
    if (!p) continue;
    const info = {
      jobProfileEnabled: p.jobProfileEnabled,
      positionHarnessProfileStatus: p.positionHarnessProfileStatus,
      positionHarnessProfileId: p.positionHarnessProfileId
    };
    if (p.headcountId != null && p.headcountId !== "") positionMap.set(String(p.headcountId), info);
    if (p.positionId != null && p.positionId !== "" && !positionMap.has(String(p.positionId))) {
      positionMap.set(String(p.positionId), info);
    }
  }
  return chatList.map((c) => {
    const key = c?.positionId != null ? String(c.positionId) : "";
    const pos = key ? positionMap.get(key) : null;
    const detail = key && detailMap ? detailMap[key] : null;
    return {
      ...c,
      jobProfileEnabled: detail?.jobProfileEnabled ?? pos?.jobProfileEnabled ?? c.jobProfileEnabled,
      positionHarnessProfileStatus:
        detail?.positionHarnessProfileStatus ??
        pos?.positionHarnessProfileStatus ??
        c.positionHarnessProfileStatus,
      positionHarnessProfileId: pos?.positionHarnessProfileId ?? c.positionHarnessProfileId,
      aiEvaluationEnabled: detail?.aiEvaluationEnabled ?? c.aiEvaluationEnabled,
      jd: c.jd || detail?.jd || ""
    };
  });
}

/** 由 application/position 原始列表构造「在招职位 id 集合」（positionId + headcountId 兜底）。 */
function buildActivePositionIdSet(positions) {
  if (!Array.isArray(positions)) return null;
  const set = new Set();
  for (const p of positions) {
    if (!p) continue;
    if (p.positionId != null && p.positionId !== "") set.add(String(p.positionId));
    if (p.headcountId != null && p.headcountId !== "") set.add(String(p.headcountId));
  }
  console.log(`[LeftMenu] application/position 在招职位 id 集合 size=${set.size}`);
  return set;
}

/**
 * 同步职位列表到 createChatPlus（整表同步：没传的 positionId 会被后端删除）。
 *
 * 本次约定：每次刷新都要把 i 人事最新的画像配置带到 chat 上，因此不再只在「缺 chat」时调用：
 *   - payload 覆盖全部职位（老 chat + 新增），且必须带 jobProfileEnabled /
 *     positionHarnessProfileStatus / positionHarnessProfileId
 *   - 只有字段真的变化（或新增职位）才发请求，避免窗口聚焦刷新频繁写库
 *   - 详情接口失败时整轮跳过（避免把已有画像字段写成 null）
 *
 * @returns {Promise<{created: boolean}>} created=true 表示新增了 chat，调用方应重新拉 chatList
 */
async function syncChatPositions(applicationPositions, chatListItems, detailMap) {
  if (!isElectronClient()) return { created: false };
  if (!Array.isArray(applicationPositions) || applicationPositions.length === 0) {
    return { created: false };
  }
  if (!detailMap) {
    console.warn("[LeftMenu] 职位详情不可用，跳过 createChatPlus 同步（避免清空画像字段）");
    return { created: false };
  }

  const existingIds = new Set(
    (chatListItems || [])
      .map((c) => (c?.positionId != null ? String(c.positionId) : ""))
      .filter(Boolean)
  );
  const missing = applicationPositions.filter((p) => {
    const pid = p?.headcountId ?? p?.positionId;
    return pid != null && pid !== "" && !existingIds.has(String(pid));
  });

  const positionNameById = new Map();
  for (const p of applicationPositions) {
    const positionName = String(p?.positionName ?? "").trim();
    if (!positionName) continue;
    if (p?.headcountId != null && p.headcountId !== "") {
      positionNameById.set(String(p.headcountId), positionName);
    }
    if (p?.positionId != null && p.positionId !== "" && !positionNameById.has(String(p.positionId))) {
      positionNameById.set(String(p.positionId), positionName);
    }
  }

  // 老 chat：原样同步（整表语义），但画像字段必须一起带上
  const payload = (chatListItems || []).map((c) => ({
    positionId: c.positionId,
    name: c.name,
    positionName:
      positionNameById.get(String(c.positionId)) ||
      c.positionName ||
      parseJobName(c.name).title ||
      "",
    jd: c.jd || "",
    jobProfileEnabled: c.jobProfileEnabled,
    positionHarnessProfileStatus: c.positionHarnessProfileStatus,
    positionHarnessProfileId: c.positionHarnessProfileId
  }));

  // 新增职位：从详情接口 + application/position 补齐
  const newPayload = missing.map((item) => {
    const pid = item.headcountId ?? item.positionId;
    const detail = detailMap[String(pid)] || {};
    return {
      positionId: pid,
      name: `${item.positionName ?? ""} (${item.headcountCode ?? ""})`,
      positionName: item.positionName ?? "",
      jd: detail.jd || store.getters.getJdByPositionId?.(pid) || item.jd || "",
      jobProfileEnabled: detail.jobProfileEnabled ?? item.jobProfileEnabled ?? null,
      positionHarnessProfileStatus:
        detail.positionHarnessProfileStatus ?? item.positionHarnessProfileStatus ?? null,
      positionHarnessProfileId: item.positionHarnessProfileId ?? null
    };
  });

  const chatData = [...payload, ...newPayload];
  if (chatData.length === 0) return { created: false };

  // diff：字段没变就不发请求（窗口聚焦刷新很频繁）
  const nextSnapshot = new Map();
  for (const item of chatData) {
    nextSnapshot.set(String(item.positionId), buildProfileSyncKey(item));
  }
  const changed =
    missing.length > 0 ||
    nextSnapshot.size !== lastPositionProfileSyncSnapshot.size ||
    Array.from(nextSnapshot.entries()).some(
      ([key, sig]) => lastPositionProfileSyncSnapshot.get(key) !== sig
    );
  if (!changed) {
    console.log("[LeftMenu] 职位画像字段无变化，跳过 createChatPlus");
    return { created: false };
  }

  console.log(
    `[LeftMenu] 同步职位列表到 createChatPlus：老职位${payload.length} + 新增${newPayload.length}`,
    { missing: missing.map((m) => m?.headcountId ?? m?.positionId) }
  );
  try {
    const resp = await createChat(chatData);
    if (resp?.success === "success") {
      lastPositionProfileSyncSnapshot.clear();
      for (const [key, sig] of nextSnapshot) lastPositionProfileSyncSnapshot.set(key, sig);
      return { created: missing.length > 0 };
    }
    console.warn("[LeftMenu] createChatPlus 同步失败:", resp?.errorMessage || resp);
    return { created: false };
  } catch (e) {
    console.warn("[LeftMenu] createChatPlus 同步异常:", e?.message || e);
    return { created: false };
  }
}

const loadChatList = async (opts = {}) => {
  loading.value = true;
  console.log("开始加载聊天列表");

  try {
    const response = await getChatList();
    console.log("获取聊天列表响应:", response);

    if (response.success === "success" && response.data && Array.isArray(response.data)) {
      console.log("原始聊天数据:", response.data);

      // 转换数据格式。
      // 注意 jd 字段后端不返，按 positionId 在 store.positionJdCache 里查（来源：
      //   - 浏览器模式：父页 ihr360-recruit-static iframeMsg.post('init', { positionList }) → SSOLogin 写 cache
      //   - 客户端模式：LeftMenu hydrateJobDescriptionsFromIhr 后调 ihrBridge 拉详情后 patch cache）
      const formattedChatList = response.data
        .filter((item) => {
          if (isVisible.value) {
            return item?.positionId;
          }
          return true;
        })
        .map((item) => {
          const cachedJd = item?.positionId
            ? store.getters.getJdByPositionId?.(item.positionId) || ""
            : "";
          return {
            id: item.chatId,
            name: item.name || `未知对话`,
            createTime: item.updateAt?.slice(0, 16).replace("T", " ") || "未知时间",
            positionId: item.positionId, // 保留positionId
            // 优先 cache（前端积累的 jd），后端 item.jd 兜底
            jd: cachedJd || item.jd || "",
            // 画像字段：后端直连下发时优先，后续会被 application/position + 详情接口覆盖
            jobProfileEnabled: item.jobProfileEnabled,
            positionHarnessProfileStatus: item.positionHarnessProfileStatus,
            positionHarnessProfileId: item.positionHarnessProfileId,
            harnessProfileVersion: item.harnessProfileVersion,
            aiEvaluationEnabled: item.aiEvaluationEnabled
          };
        });

      console.log("格式化后的聊天列表:", formattedChatList);
      console.log("三方企业状态:", {
        visibleThirdSwitchPlus: visibleThirdSwitchPlus.value,
        isFromThirdMenu: isFromThirdMenu.value
      });

      // ★ 拉 i人事在招职位：既做白名单过滤，也提供 jobProfileEnabled / positionHarnessProfileId
      const applicationPositions = await getActiveApplicationPositions();

      // ★ 全量拉职位详情：一次请求同时供 JD 生成 + 画像开关字段（aiEvaluationEnabled / status）
      const detailIds = [
        ...(Array.isArray(applicationPositions) ? applicationPositions : []).map(
          (p) => p?.headcountId ?? p?.positionId
        ),
        ...formattedChatList.map((c) => c?.positionId)
      ];
      const positionDetailMap = await fetchPositionDetailMap(detailIds);

      // ★ 合并职位级画像字段到 chat item（详情 > application/position > chatList）
      const chatListWithProfileFlags = mergePositionProfileFields(
        formattedChatList,
        applicationPositions,
        positionDetailMap
      );

      // ★ 整表同步到 createChatPlus：字段有变化才发；详情不可用时跳过，避免清空画像配置。
      //   skipPositionSync 防止"创建后就重新拉列表"造成无限递归。
      if (!opts.skipPositionSync) {
        const { created } = await syncChatPositions(
          applicationPositions,
          chatListWithProfileFlags,
          positionDetailMap
        );
        if (created) {
          console.log("[LeftMenu] 已为缺失在招职位创建 chat，重新拉取 chatList");
          return loadChatList({ skipPositionSync: true });
        }
      }

      // ★ 用 noauth/application/position 做白名单过滤：chatList 里 positionId 不在
      //   i人事在招职位列表中的（职位已关闭/移除）→ 隐藏。
      //   接口不可用/失败 → activePositionIdSet 为 null → 不过滤（show all），避免误隐藏全部。
      //   chat 没 positionId（理论上少见）→ 无从判定 → 保留。
      const activePositionIdSet = buildActivePositionIdSet(applicationPositions);
      const visibleChatList = activePositionIdSet
        ? chatListWithProfileFlags.filter(
            (item) => !item.positionId || activePositionIdSet.has(String(item.positionId))
          )
        : chatListWithProfileFlags;
      if (activePositionIdSet) {
        console.log(
          `[LeftMenu] 职位列表过滤：${formattedChatList.length} → ${visibleChatList.length}（按 application/position 在招职位）`
        );
      }

      // 将格式化后的聊天列表保存到Vuex中
      store.dispatch("updateChatList", visibleChatList);
      console.log("聊天列表已保存到Vuex");

      // 客户端模式下：chatList 接口没返 jd 字段（注释 SSOLogin.vue L226），
      // 在后台异步批量调 ihrBridge.batchGetPositionDetailByIds 拉职位详情，
      // 用 generateJobPostingFromResume 算 JD 文本回填到 chatList。
      // 这步不阻塞 loadChatList 主流程，失败也不影响其它功能（jd 仍为空时，手动发送 JD 按钮不可用）。
      void hydrateJobDescriptionsFromIhr(visibleChatList);

      // 在数据更新到Vuex后，使用nextTick确保DOM已更新
      // 然后再处理三方企业的选择逻辑
      await nextTick();

      // 列表加载后的精确分支处理（不再自动选第一个）：
      //   - 从 i 人事 "招聘助理" 菜单进来（isFromThirdMenu）：以前会自动选第一个，
      //     现已改成依赖用户主动选 / vuex-persistedstate 恢复的 selectPositionId
      //   - 从候选人详情 "招聘工作流" 跳来（isFromCandidateList）：仍然按 headcountId 精确定位，
      //     这是业务跳转携带的明确意图，不属于"默认选第一个"
      if (
        formattedChatList.length > 0 &&
        visibleThirdSwitchPlus.value &&
        isFromCandidateList.value
      ) {
        const filteredList = [
          visibleChatList.find((item) => item.positionId === headcountId.value)
        ].filter(Boolean);
        if (Array.isArray(filteredList) && filteredList.length === 1) {
          // 仅定位到候选详情所属职位；切换职位时不自动填充 JD。
          handleRecruitAction(filteredList[0], false);
        }
        console.log(headcountId.value, "三方企业，候选人列表跳转定位职位:", filteredList[0]);
      }
    } else {
      console.error("加载聊天列表失败, 响应不符合预期:", response);
      notify.error("加载聊天列表失败");
    }
  } catch (e) {
    console.error("加载聊天列表失败:", e);
    notify.error("加载聊天列表失败，请稍后重试");
  } finally {
    loading.value = false;
    console.log("聊天列表加载完成");
  }
};

/**
 * 设置功能按钮点击（iHR / 客户端模式底部固定）。
 *
 * 打开 SettingsModal（渠道启停 + 运行策略设置）：
 *   - 当前仅 workPeriods 可编辑（GET/PUT /ai/runtimePolicy/config）
 *   - 其它策略字段（allowWeekend / strategy.* / stopConditions）由后端硬编码，只读展示
 *   - 接口契约：docs/05-api-contract.md §「查询/保存运行策略配置」(line 334-410)
 */
const settingsVisible = ref(false);
const handleOpenSettings = () => {
  settingsVisible.value = true;
};

/* ===========================================================================
 * Electron 自动更新（1:1 ihraisaas JobList 底部 currentVersion / newVersionAvailable）
 *
 * 流程：
 *   1. mount 时调一次 window.api.appUpdater.getStatus() hydrate 当前状态
 *      （处理"主进程已 emit 过 available 事件、但 LeftMenu 还没 ready"的竞态）
 *   2. 持续订阅 available / downloaded / not-available / error 事件刷新状态
 *   3. 首次发现可用更新或下载完成 → 自动弹一次 UpdateModal（替代原 Electron dialog 行为）
 *   4. 之后用户可随时点 "立即更新 🚀" 再次打开 UpdateModal
 *
 * 非 Electron 环境（浏览器 / 插件）：currentVersion 写一个占位 v1.0.0，
 * newVersionAvailable 永远空，整个区块表现为"已是最新"。
 * ========================================================================== */
const currentVersionDisplay = ref("v1.0.0");
const newVersionAvailable = ref(""); // 空串 → 显示"最新版本"；有值 → 显示"立即更新 🚀"
const updateModalOpen = ref(false);
// 记录"已自动弹过"的版本号：同一个新版本只主动弹一次，避免后台 4h 周期 check 反复弹打扰用户。
let _autoPoppedVersion = "";
const _appUpdaterOffs = [];

function _stripVPrefix(v) {
  return v ? String(v).replace(/^v/i, "") : "";
}
function _formatVersion(v) {
  if (!v) return "";
  return "v" + _stripVPrefix(v);
}

function handleOpenUpdateModal() {
  updateModalOpen.value = true;
}

// 只要左下角出现"立即更新"提示（newVersionAvailable 非空）→ 主动弹一次更新框。
// 每个版本只弹一次（_autoPoppedVersion 去重）；已经开着则不重复触发。
function _maybeAutoPopUpdateModal() {
  const ver = newVersionAvailable.value;
  if (!ver) return; // 左下角是"最新版本" → 不弹
  if (updateModalOpen.value) return; // 已打开，别重复
  if (_autoPoppedVersion === ver) return; // 同版本已弹过，不再打扰
  _autoPoppedVersion = ver;
  updateModalOpen.value = true;
}

// 兜底：任何路径（事件 / checkUpdate / hydrate）把 newVersionAvailable 从空变为有值，
// 都自动弹一次更新框——保证"左下角有更新提示时主动弹框"这条需求恒成立。
watch(newVersionAvailable, (ver) => {
  if (ver) _maybeAutoPopUpdateModal();
});

/**
 * 启动序列（清晰的两步）：
 *   1) getCurrentVersion()   —— 立即拿到客户端版本号显示
 *   2) checkUpdate()         —— 主动检查是否有更新，决定显示"立即更新"或"最新版本"
 * 期间订阅 main 进程后续事件，让"后台周期 check（4h）"也能更新到 UI。
 */
async function _setupAppUpdater() {
  const updater = typeof window !== "undefined" ? window.api?.appUpdater : null;
  if (!updater) {
    // 非 Electron 环境：保持默认版本号显示"最新版本"
    return;
  }

  // === Step 1: 启动立即获取客户端版本号（不发网络请求，立刻返回）===
  try {
    const ver = await updater.getCurrentVersion();
    currentVersionDisplay.value = _formatVersion(ver);
    console.log("[LeftMenu] getCurrentVersion →", ver);
  } catch (e) {
    console.warn("[LeftMenu] getCurrentVersion 失败:", e?.message || e);
  }

  // === Step 2: 订阅 main 进程后续事件（4h 定时 check / 下载完成 等）===
  _appUpdaterOffs.push(
    updater.on("available", (p) => {
      console.log("[LeftMenu] event available:", p);
      newVersionAvailable.value = _formatVersion(p?.version);
      _maybeAutoPopUpdateModal();
    })
  );
  _appUpdaterOffs.push(
    updater.on("not-available", () => {
      console.log("[LeftMenu] event not-available");
      newVersionAvailable.value = "";
    })
  );
  _appUpdaterOffs.push(
    updater.on("downloaded", (p) => {
      console.log("[LeftMenu] event downloaded:", p);
      if (p?.version) newVersionAvailable.value = _formatVersion(p.version);
      _autoPoppedVersion = ""; // 下载完成必弹一次让用户确认重启（清掉去重标记）
      _maybeAutoPopUpdateModal();
    })
  );

  // === Step 3: 主动 checkUpdate 决定 UI（立即更新 vs 最新版本）===
  //   IPC invoke 是 request/response 模型，绝对可靠，避免依赖主进程
  //   setTimeout 5s 的 webContents.send race（dev 模式 renderer 还在 bundle 时事件会丢）
  try {
    const r = await updater.checkUpdate();
    console.log("[LeftMenu] checkUpdate →", r);
    if (r?.hasUpdate && r?.newVersion) {
      newVersionAvailable.value = _formatVersion(r.newVersion);
      _maybeAutoPopUpdateModal();
    } else {
      newVersionAvailable.value = "";
    }
  } catch (e) {
    console.warn("[LeftMenu] checkUpdate 失败:", e?.message || e);
  }
}

// 创建新聊天
const handleNewChat = async () => {
  try {
    // 调用chatCardRef中的handleNewChat方法创建新聊天
    if (chatCardRef.value && typeof chatCardRef.value.handleNewChat === "function") {
      const newChatInfo = await chatCardRef.value.handleNewChat();

      // 如果返回了新聊天信息，添加到Vuex
      if (newChatInfo && newChatInfo.id) {
        // 添加到Vuex中（如果chatCardRef.handleNewChat方法中没有自动添加）
        // store.dispatch('addChat', newChatInfo);
      }
    } else {
      console.warn("chatCardRef或其handleNewChat方法不可用");
    }
  } catch (error) {
    console.error("创建新聊天失败:", error);
    notify.error("创建新聊天失败，请稍后重试");
  }
};

const setVuexData = (item) => {
  // 设置聊天ID
  store.commit("SET_LATEST_CHAT_ID", item.id);
  console.log("已设置最新聊天ID:", item.id);

  // 设置职位ID
  if (item.positionId) {
    store.commit("SET_LATEST_POSITION_ID", item.positionId);
    console.log("已设置最新职位ID:", item.positionId);
  } else {
    store.commit("SET_LATEST_POSITION_ID", "");
    console.log("职位ID为空，已清除");
  }

  // 设置 UI 用的"用户主动选中职位 id"（独立持久化，跟 latestChatId 解耦）
  // 用 item.positionId 优先；缺失时退回 item.id 兜底（保证有值）
  const chosenId = item.positionId || item.id || "";
  store.commit("SET_CHOSEN_JOB_ID", chosenId);
  console.log("已设置用户选中职位 ID (chosenJobId):", chosenId);
};

// 选择聊天
const selectChat = (item) => {
  if (!item || !item.id) {
    console.error("尝试选择无效的聊天项", item);
    return;
  }

  console.log("选择聊天:", item);

  // 选择职位 → 校验使用权限（无权限会清登录态 + 弹登录框）。不阻塞选择本身，弹框会盖在上层。
  ensureClientAuthority(store, { reason: "select_job" });

  // 点击「已完成」的职位 → 清除其已完成标记（之后切到别的职位再回来也不再显示）。
  // ★ 只在该职位**当前确为已完成态**时才记录已读：避免选中一个待运行/进行中的职位也被
  //   误标已读，导致它之后真正完成（且未选中）时不显示「已完成」标记。
  if (
    jobAggregateStatus(item.id).status === "completed" &&
    !acknowledgedCompletedIds.value.includes(item.id)
  ) {
    acknowledgedCompletedIds.value.push(item.id);
  }

  try {
    // 刷新搜索条件（嵌入式模式下 JobSearchFilter 只在 results 视图渲染，
    // chat 视图时 ref 可能为 null —— 防御性判空，不抛异常）
    if (
      jobSearchFilterRef.value &&
      typeof jobSearchFilterRef.value.refreshSearchCondition === "function"
    ) {
      jobSearchFilterRef.value.refreshSearchCondition(item.id);
    } else {
      console.warn("jobSearchFilterRef 不可用，跳过 refreshSearchCondition");
    }

    // 清空 AI 输入框（同上，嵌入式 ChatCard ref 可能为 null）
    if (chatCardRef.value && typeof chatCardRef.value.fillMessageToInput === "function") {
      chatCardRef.value.fillMessageToInput("");
    } else {
      console.warn("chatCardRef 不可用，跳过 fillMessageToInput");
    }

    // 清空聚合渠道数据 —— 但如果**任意一个**职位有正在跑的任务，不清空。
    //
    // 背景：runTask 末尾会从 ALL.data 收集本任务的搜索结果落库。如果用户在任务
    // 跑的过程中切到其它职位 → selectChat 清掉 ALL.data → runTask 拿到 0 条 →
    // 后端报错 'search_result_set_id doesn't have a default value' → 任务异常停止。
    //
    // 用 SearchTasks.runningTaskId 判定：只要 store 里有 runningTaskId，
    // 说明有任务正在跑，不要动 ALL.data（让任务跑完再切）。
    const runningTaskId = store.state?.SearchTasks?.runningTaskId;
    if (!runningTaskId) {
      store.commit("changeChannelConfData", { key: "ALL", value: [] });
    } else {
      console.log("[LeftMenu] selectChat 跳过清 ALL.data —— 有任务 " + runningTaskId + " 正在跑");
    }

    setVuexData(item);
  } catch (error) {
    console.error("选择聊天时发生错误:", error);
  }
};

/**
 * 客户端模式下批量从 i 人事拉职位详情，把 JD 文本回填到 chatList 各项的 `jd` 字段。
 *
 * 背景：i 快招后端 chatList 接口 **不返 jd 字段**（JD 数据归 i 人事招聘工作台管）。
 *      浏览器模式下 JD 通过 iframeMsg.post('init', { positionList: [...] }) 由父页推过来，
 *      客户端模式下没父页，需要主动调 `ihrBridge.batchGetPositionDetailByIds` 拉。
 *
 * 流程：
 *   1. 过滤出有 positionId 且 jd 为空的项
 *   2. 调 ihrBridge.batchGetPositionDetailByIds(positionIds)
 *   3. 对每个返回项用 generateJobPostingFromResume(headcountBasic, enums) 算 JD 文本
 *   4. dispatch updateChatList 用补齐 jd 的新数组覆盖
 *
 * 静默条件（不阻塞 / 不打扰用户）：
 *   - 非 Electron 客户端（ihrBridge 不存在） → skip
 *   - 没有 positionId 需要补 → skip
 *   - ihrBridge.batchGetPositionDetailByIds 失败 / 返回非数组 → 跳过本次回填
 */
async function hydrateJobDescriptionsFromIhr(chatListItems) {
  const ihrBridge = window?.api?.ihrBridge;
  if (!ihrBridge || typeof ihrBridge.batchGetPositionDetailByIds !== "function") {
    // 浏览器模式 / preload 旧版本：JD 走父页 iframeMsg 路径，本函数不参与
    return;
  }
  if (!Array.isArray(chatListItems) || chatListItems.length === 0) return;
  const needsJd = chatListItems.filter(
    (item) => item?.positionId && (!item.jd || typeof item.jd !== "string" || item.jd.trim() === "")
  );
  if (needsJd.length === 0) {
    console.log("[LeftMenu] hydrateJobDescriptions: 全部职位都已有 jd，跳过");
    return;
  }
  const positionIds = needsJd.map((item) => item.positionId);
  console.log(`[LeftMenu] hydrateJobDescriptions: 批量拉 ${positionIds.length} 个职位 JD`);
  try {
    const res = await ihrBridge.batchGetPositionDetailByIds(positionIds);
    if (!res?.success) {
      console.warn("[LeftMenu] batchGetPositionDetailByIds 失败:", res?.errorCode, res?.message);
      return;
    }
    const list = Array.isArray(res.data) ? res.data : [];
    console.log(`[LeftMenu] batchGetPositionDetailByIds 返回 ${list.length} 条职位详情`);
    if (list.length === 0) {
      console.log("[LeftMenu] batchGetPositionDetailByIds 返回空");
      return;
    }
    // i 人事返回结构：每条 item 含 headcountBasic + salaryTypes/workYears/positionTypes/diplomaTypes
    // 按 headcountId 索引（== chatList.positionId）算 JD 文本
    const jdByPositionId = {};
    for (const item of list) {
      const headcountBasic = item?.headcountBasic;
      if (!headcountBasic?.headcountId) continue;
      const enums = {
        salaryTypes: item?.salaryTypes || [],
        workYears: item?.workYears || [],
        positionTypes: item?.positionTypes || [],
        diplomaTypes: item?.diplomaTypes || []
      };
      try {
        const aiText = generateJobPostingFromResume(headcountBasic, enums);
        if (aiText) {
          const pid = String(headcountBasic.headcountId);
          jdByPositionId[pid] = aiText;
          // 顺手 patch 到 store cache，下次进同一职位（或别处取 jd）直接命中
          store.commit("PATCH_POSITION_JD_CACHE", { positionId: pid, jd: aiText });
        }
      } catch (e) {
        console.warn("[LeftMenu] generateJobPostingFromResume 失败:", e?.message || e);
      }
    }
    if (Object.keys(jdByPositionId).length === 0) {
      console.warn("[LeftMenu] 没有任何 JD 被生成（headcountBasic 字段都不完整？）");
      return;
    }
    // 用新数组覆盖 chatList（仅补 jd，不动其它字段）
    const currentList = store.getters.getChatList || [];
    const merged = currentList.map((item) => {
      const newJd = item?.positionId ? jdByPositionId[String(item.positionId)] : undefined;
      if (newJd && (!item.jd || item.jd.trim() === "")) {
        return { ...item, jd: newJd };
      }
      return item;
    });
    store.dispatch("updateChatList", merged);
    console.log(
      `[LeftMenu] hydrateJobDescriptions: 已回填 ${
        Object.keys(jdByPositionId).length
      } 个职位 JD 到 chatList`
    );
  } catch (e) {
    console.warn("[LeftMenu] hydrateJobDescriptions 异常:", e?.message || e);
  }
}

// 打开重命名对话框
const openRenameDialog = (item) => {
  currentItem.value = item;
  newName.value = item.name;
  renameDialogVisible.value = true;
};

// 处理重命名
const handleRename = async () => {
  if (!newName.value.trim()) {
    notify.warning("名称不能为空");
    return;
  }

  try {
    const res = await renameChat(currentItem.value.id, newName.value.trim());
    if (res.success === "success") {
      // 更新Vuex中的聊天名称
      store.dispatch("renameChatAction", {
        chatId: currentItem.value.id,
        newName: newName.value.trim()
      });
      notify.success("重命名成功");
      renameDialogVisible.value = false;
    } else {
      notify.error(res.errorMessage || "重命名失败");
    }
  } catch (e) {
    console.error("重命名失败:", e);
    notify.error("重命名失败，请稍后重试");
  }
};

// 处理删除
const handleDelete = async (item) => {
  try {
    // 使用Quasar的Dialog进行确认
    $q.dialog({
      title: '<div class="text-grey-8">警告</div>',
      message:
        '<i class="material-icons text-negative q-mr-sm" style="vertical-align: middle;">warning</i> 确定要删除这个对话吗？',
      html: true,
      cancel: true,
      persistent: true
    }).onOk(async () => {
      try {
        const res = await deleteChat(item.id);
        if (res.success === "success") {
          // 从Vuex中删除聊天
          store.dispatch("deleteChatAction", item.id);
          notify.success("删除成功");

          // 如果删除的是当前选中的聊天，则自动创建新的聊天
          if (currentChatId.value === item.id) {
            store.commit("clearSearchConditionId");
            handleNewChat();
          }
        } else {
          notify.error(res.errorMessage || "删除失败");
        }
      } catch (e) {
        console.error("删除聊天失败:", e);
        notify.error("删除失败，请稍后重试");
      }
    });
  } catch (e) {
    console.error("显示确认对话框失败:", e);
  }
};

// 组件挂载时加载数据
onMounted(() => {
  loadChatList();

  // 不再无脑选第一个 —— 用户上次选中的职位由 vuex-persistedstate 自动从 localStorage
  // 恢复（chatList.latestChatId 已在 store/index.js paths 持久化）。
  // 如果 localStorage 没记录，currentChatId 保持空，右侧显示 ChatEmptyState 引导用户手动选。

  // Electron 自动更新接入（仅 client 模式有效）
  _setupAppUpdater();

  // ★ 客户端窗口重新聚焦 → 重新拉一次职位列表，及时反映 i人事侧新增/关闭的职位
  //   （按 application/position 白名单过滤）。节流 5s，避免频繁触发。
  //   优先用「客户端窗口聚焦」(main 进程 BrowserWindow 'focus')，比网页 window 'focus' 可靠
  //   —— 即使当前停在 BOSS tab，app 一回到前台也会触发；浏览器模式回退到网页 focus/visibility。
  if (window?.api?.appWindow?.onFocus) {
    _unbindAppFocus = window.api.appWindow.onFocus(_refreshChatListOnFocus);
  } else {
    window.addEventListener("focus", _refreshChatListOnFocus);
    document.addEventListener("visibilitychange", _onVisibilityChange);
  }
});

/**
 * 监听全局"职位列表静默刷新"信号：MainLayout 接到同用户 deep link 时
 * commit('triggerChatListRefresh') 把它自增 → 本组件 watch 触发 loadChatList。
 *
 * 跟 onMounted 里的 loadChatList 共用同一份逻辑，loading 态 / 异常处理一致；
 * UI 无感（不刷新整页）。
 */
const _chatListRefreshSignal = computed(() => store.getters.getChatListRefreshSignal);
watch(_chatListRefreshSignal, (nv, ov) => {
  if (nv === ov) return;
  console.log("[LeftMenu] 收到 chatListRefreshSignal", { from: ov, to: nv });
  loadChatList();
});

/**
 * 窗口聚焦 / 页面变可见时重新拉职位列表（及时获取要隐藏 / 新增的职位）。
 * 节流：两次刷新至少间隔 5s，避免频繁切焦点时狂刷。
 */
const FOCUS_REFRESH_THROTTLE_MS = 5000;
let _lastFocusRefreshAt = 0;
let _unbindAppFocus = null;
function _refreshChatListOnFocus() {
  const now = Date.now();
  if (now - _lastFocusRefreshAt < FOCUS_REFRESH_THROTTLE_MS) return;
  _lastFocusRefreshAt = now;
  console.log("[LeftMenu] 窗口聚焦/可见 → 刷新职位列表 + 校验使用权限");
  // 客户端聚焦 → 校验使用权限（无权限会清登录态 + 弹登录框）
  ensureClientAuthority(store, { reason: "window_focus" });
  loadChatList();
}
function _onVisibilityChange() {
  if (document.visibilityState === "visible") _refreshChatListOnFocus();
}

onUnmounted(() => {
  _appUpdaterOffs.forEach((off) => {
    try {
      off && off();
    } catch (e) {
      console.warn("[LeftMenu] unsubscribe appUpdater failed:", e?.message || e);
    }
  });
  _appUpdaterOffs.length = 0;
  if (_unbindAppFocus) {
    _unbindAppFocus();
    _unbindAppFocus = null;
  } else {
    window.removeEventListener("focus", _refreshChatListOnFocus);
    document.removeEventListener("visibilitychange", _onVisibilityChange);
  }
});

// 处理招聘操作
const handleRecruitAction = (item, isFill = true) => {
  console.log("招聘操作按钮被点击，聊天ID:", item);
  // 设置聊天ID
  // store.commit('SET_LATEST_CHAT_ID', item.id);
  // console.log('已设置最新聊天ID:', item.id);
  //
  // // 设置职位ID
  // if (item.positionId) {
  //   store.commit('SET_LATEST_POSITION_ID', item.positionId);
  //   console.log('已设置最新职位ID:', item.positionId);
  // } else {
  //   store.commit('SET_LATEST_POSITION_ID', '');
  //   console.log('职位ID为空，已清除');
  // }
  setVuexData(item);
  nextTick(() => {
    // isFill为true表示需要填充JD
    isFill && chatCardRef.value.insertMessageToInput(item.jd);
  });
};

const closeTips = () => {
  tipsStatus.value = false;
};

/**
 * chatList 加载完后：按持久化的 chosenJobId 自动恢复选中
 *
 *   - chosenJobId 为空 → 不选 → 右侧显示 ChatEmptyState 引导用户手动选
 *   - chosenJobId 有值 且能在 chatList 找到匹配 chat → 自动 selectChat（同步设 latestChatId）
 *   - chosenJobId 有值 但找不到（chat 已被删除）→ 清空 chosenJobId → ChatEmptyState
 *
 * 不再"无脑选第一个"。
 */
watch(
  chatList,
  (newChatList) => {
    if (!newChatList || newChatList.length === 0) return;
    if (currentChatId.value) return;
    if (!visibleThirdSwitchPlus.value) return;

    const chosenId = store.getters.getChosenJobId;
    if (!chosenId) return; // 没记录 → 让 currentChatId 保持空，触发 ChatEmptyState

    const found = newChatList.find((c) => c && (c.positionId === chosenId || c.id === chosenId));
    if (found) {
      console.log("[LeftMenu] 按 chosenJobId 自动恢复上次选中职位:", found);
      selectChat(found);
    } else {
      console.log("[LeftMenu] chosenJobId 对应职位已不存在，清空 → 显示空状态");
      store.commit("SET_CHOSEN_JOB_ID", "");
    }
  },
  { immediate: true }
);

// 监听 vuex 中的刷新状态
watch(
  () => store.getters.getNeedRefreshList,
  async (needRefresh) => {
    if (needRefresh) {
      await new Promise((resolve) => setTimeout(resolve, 3500));
      await loadChatList();
      store.commit("SET_NEED_REFRESH_LIST", false);
    }
  }
);
</script>

<style scoped>
.q-item.q-router-link--active,
.q-item--active {
  font-weight: bold;
}
</style>
<style lang="sass">
.my-menu-link
  background: var(--q-primary-20)

.iHR-style
  padding: 0
  background: #fff
  // ★ flex column 让 .iHR-job-list 占满中间区域，.iHR-bottom-actions 钉在底部
  // 配合根容器 inline style 的 height: 100% / min-height: 100vh 撑满 viewport
  display: flex
  flex-direction: column
  height: 100%

  // 列表 header（1:1 对照 ihraisaas JobList.tsx 第 38-42 行）
  .iHR-list-header
    display: flex
    align-items: center
    justify-content: space-between
    padding: 16px // p-4
    border-bottom: 1px solid #f5f5f5 // border-neutral-100

  .iHR-list-title
    margin: 0
    font-size: 14px // text-sm
    font-weight: 600 // font-semibold
    color: #262626 // text-neutral-800
    letter-spacing: -0.005em

  .iHR-list-count
    font-size: 10px // text-[10px]
    background: #f5f5f5 // bg-neutral-100
    padding: 2px 8px // px-2 py-0.5
    border-radius: 9999px // rounded-full
    color: #737373 // text-neutral-500
    font-weight: 500 // font-medium
    line-height: 1.4

  .iHR-menu-tips
    margin: 12px 12px 8px 12px
    border-radius: 10px
    line-height: 22px
    background-color: var(--q-primary-10)
    padding-right: 23px

  // ===== 新版职位列表（1:1 ihraisaas JobList.tsx 第 50-130 行）=====
  .iHR-job-list
    padding: 4px 12px 8px 12px
    display: flex
    flex-direction: column
    gap: 2px // 紧凑：列表项之间几乎无 gap
    overflow-y: auto
    flex: 1 1 auto // 占满中间空间，让底部 .iHR-bottom-actions 钉底
    min-height: 0  // flex item 默认 min-height: auto 会撑爆容器，强制 0 让 overflow 生效

  // ★ 底部固定操作区（设置功能等）
  // 1:1 对照 ihraisaas JobList.tsx 第 151 行：
  //   p-3 border-t border-neutral-100 flex-shrink-0 space-y-2
  .iHR-bottom-actions
    flex-shrink: 0
    padding: 12px // p-3
    border-top: 1px solid #f5f5f5 // border-neutral-100
    display: flex
    flex-direction: column
    gap: 8px // space-y-2

  // 1:1 对照 ihraisaas JobList.tsx 第 162-168 行：
  //   w-full flex items-center justify-center space-x-2 py-2.5 rounded-xl
  //   border border-neutral-200 text-neutral-500
  //   hover:text-primary-500 hover:border-primary-200 hover:bg-primary-50
  //   transition-all font-bold text-sm
  .iHR-settings-btn
    width: 100%
    display: flex
    align-items: center
    justify-content: center
    gap: 8px // space-x-2
    padding: 10px 0 // py-2.5
    border-radius: 12px // rounded-xl
    border: 1px solid #e5e5e5 // neutral-200
    background: #ffffff
    color: #737373 // neutral-500
    font-size: 14px // text-sm
    font-weight: 700 // font-bold
    cursor: pointer
    transition: color 0.15s, border-color 0.15s, background 0.15s
    line-height: 1.2

    &:hover
      color: #15B8A6 // primary-500
      border-color: #99F6E4 // primary-200
      background: #F0FDFA // primary-50

  .iHR-settings-icon
    width: 16px // w-4
    height: 16px // h-4
    flex-shrink: 0

  // ===== 版本号 / 立即更新提示行 =====
  // 1:1 对照 ihraisaas JobList.tsx 第 178-194 行
  //   pt-2 flex items-center justify-between px-2 pb-1 border-t border-neutral-50/50
  .iHR-version-row
    display: flex
    align-items: center
    justify-content: space-between
    padding: 8px 8px 4px // pt-2 px-2 pb-1
    border-top: 1px solid rgba(245, 245, 245, 0.5) // border-neutral-50/50

  .iHR-version-row-left
    display: flex
    align-items: center
    gap: 8px // space-x-2

  // 11px neutral-400 font-bold tracking-tight
  .iHR-version-text
    font-size: 11px
    color: #a3a3a3 // neutral-400
    font-weight: 700 // font-bold
    letter-spacing: -0.025em

  // 11px primary-500 font-black hover:underline + 圆点脉冲
  .iHR-update-btn
    display: inline-flex
    align-items: center
    border: none
    background: transparent
    padding: 0
    font-size: 11px
    font-weight: 900 // font-black
    color: #15B8A6 // primary-500
    cursor: pointer
    animation: lm-update-pulse 2s ease-in-out infinite
    line-height: 1.2

    &:hover
      text-decoration: underline
      text-underline-offset: 2px

  .iHR-update-dot
    display: inline-block
    width: 6px
    height: 6px
    border-radius: 999px
    background: #15B8A6 // primary-500
    margin-right: 4px

  .iHR-version-latest
    font-size: 10px
    color: #d4d4d4 // neutral-300
    font-weight: 500

  @keyframes lm-update-pulse
    0%, 100%
      opacity: 1
    50%
      opacity: 0.5

  // 1:1 对照 ihraisaas JobList.tsx 第 51-149 行
  .job-item
    width: 100%
    text-align: left
    background: #fff
    border: 1px solid #e5e7eb // border-neutral-200
    border-radius: 8px // rounded-lg
    padding: 12px // p-3（与 ihraisaas 一致）
    cursor: pointer
    transition: all 0.2s
    // 左右两列布局：content 占主体，status 在右
    display: flex
    align-items: center

    &:hover:not(.active)
      border-color: #99f6e4 // hover:border-primary-200
      background: #fafafa // hover:bg-neutral-50

    &.active
      border-color: #14b8a6 // border-primary-500
      background: #f0fdfa // bg-primary-50
      box-shadow: 0 0 0 1px rgba(20, 184, 166, 0.1)

    &.pinned:not(.active)
      border-color: #ccfbf1 // border-primary-200
      background: rgba(240, 253, 250, 0.125) // bg-primary-50/20

    // 任务状态背景色（对照 ihraisaas JobList.tsx 第 59-62 行）
    &.status-processing:not(.active)
      border-color: #14b8a6 // border-primary-500
      background: rgba(240, 253, 250, 0.3) // bg-primary-50/30

    &.status-queued:not(.active)
      border-color: #fde68a // border-amber-200
      background: rgba(254, 252, 232, 0.3) // bg-amber-50/30

    &.status-resting:not(.active)
      border-color: #f59e0b // border-amber-500
      background: rgba(254, 252, 232, 0.2) // bg-amber-50/20
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.06) // shadow-inner

    &.status-stopped:not(.active)
      border-color: #fecaca // border-red-200
      background: rgba(254, 242, 242, 0.3) // bg-red-50/30

  .job-item-content
    flex: 1
    min-width: 0
    padding-right: 4px // pr-1

  // 行布局：第一行 pin+title；第二行 code+briefcase
  .job-item-row
    display: flex
    align-items: center
    justify-content: space-between
    gap: 4px

  // 第二行（编号 + briefcase）：margin-top 用 title 的 mb-0.5 替代
  .job-item-row-bottom
    margin-top: 0 // title 的 mb-0.5 已经提供间距

  .pin-btn
    display: inline-flex
    align-items: center
    justify-content: center
    margin-right: 6px // mr-1.5
    padding: 2px // p-0.5
    border: 0
    background: transparent
    border-radius: 4px // rounded
    color: #d4d4d8 // 默认 text-neutral-300
    cursor: pointer
    transition: all 0.15s
    flex-shrink: 0

    &:hover
      color: #2dd4bf // hover:text-primary-400
      background: #f5f5f5 // hover:bg-neutral-100

    &.active
      color: #14b8a6 // text-primary-500
      background: #f0fdfa // bg-primary-50

  // 标题 + 画像 tag 的横向容器（避免 space-between 把 tag 推到状态列旁边）
  .job-title-wrap
    display: flex
    align-items: center
    min-width: 0
    flex: 1

  // 1:1 对照 h4 className="text-sm font-medium truncate mb-0.5"
  .job-title
    margin: 0 0 2px 0 // mb-0.5
    font-size: 14px // text-sm
    font-weight: 500 // font-medium
    color: #262626 // text-neutral-800
    white-space: nowrap
    overflow: hidden
    text-overflow: ellipsis
    line-height: 1.5
    min-width: 0
    flex: 1

  .job-item.active .job-title
    color: #14b8a6 // text-primary-500

  // 职位画像未开启 tag：仅按 jobProfileEnabled 判定
  .job-profile-off-tag
    flex-shrink: 0
    margin-left: 4px
    padding: 0 4px
    font-size: 10px
    line-height: 16px
    color: #a1a1aa
    background: #f4f4f5
    border: 1px solid #e4e4e7
    border-radius: 3px

  // 1:1 对照 p className="text-xs text-neutral-500 font-mono"
  .job-code
    margin: 0
    font-size: 12px // text-xs
    color: #737373 // text-neutral-500
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace
    line-height: 1.4

  // briefcase 按钮：1:1 对照 ihraisaas idle 时的 Briefcase className="w-3 h-3 text-neutral-300"
  .recruit-btn
    display: inline-flex
    align-items: center
    justify-content: center
    padding: 0
    border: 0
    background: transparent
    color: #d4d4d8 // text-neutral-300
    cursor: pointer
    transition: color 0.15s
    flex-shrink: 0

    &:hover
      color: #14b8a6 // primary-500

  .job-item.active .recruit-btn
    color: #2dd4bf // selected 时变 primary-400（跟 ihraisaas line 134 一致）

  // ===== 任务状态列（右侧）1:1 对照 ihraisaas JobList.tsx 第 92-141 行 =====
  .job-item-status
    flex-shrink: 0
    min-width: 60px // min-w-[60px]
    padding-left: 8px // pl-2
    display: flex
    flex-direction: column
    align-items: flex-end
    justify-content: center

  .status-icons
    display: flex
    align-items: center
    gap: 4px
    margin-bottom: 4px // mb-1

  .status-label
    display: flex
    flex-direction: column
    align-items: flex-end

  // 文字基础样式（1:1 对照 ihraisaas text-[8px] font-black uppercase tracking-tighter）
  .status-label-text
    font-size: 9px
    font-weight: 900
    text-transform: uppercase
    letter-spacing: -0.025em
    line-height: 1.2

    &.processing
      color: #0d9488 // text-primary-600
      animation: pulse 1.6s ease-in-out infinite

    &.queued
      color: #d97706 // text-amber-600

    &.stopped
      color: #dc2626 // text-red-600
      animation: pulse 1.6s ease-in-out infinite

    &.completed
      color: #059669 // text-emerald-600
      font-size: 10px // [10px]
      font-weight: 700
      letter-spacing: -0.01em
      margin-top: 2px

  // ★ 预计开始时间（1:1 对照 ihraisaas text-[8px] text-neutral-400 font-bold mt-0.5 whitespace-nowrap）
  .status-estimated
    font-size: 8px
    font-weight: 700
    color: #a3a3a3 // text-neutral-400
    margin-top: 2px // mt-0.5
    white-space: nowrap
    line-height: 1.2

  // icon 颜色
  .status-icon-spinner
    color: #14b8a6 // text-primary-500
    animation: spin 0.9s linear infinite

  .status-icon-clock
    color: #f59e0b // text-amber-500

  .status-icon-alert
    color: #ef4444 // text-red-500
    animation: pulse 1.6s ease-in-out infinite

  // "已完成" 圆形 check（对照 ihraisaas line 94-99）
  .status-completed-circle
    width: 22px
    height: 22px
    border-radius: 50%
    border: 1.5px solid #10b981 // border-emerald-500
    background: #fff
    display: flex
    align-items: center
    justify-content: center
    color: #10b981 // text-emerald-500
    margin-bottom: 4px

  @keyframes spin
    to
      transform: rotate(360deg)

  @keyframes pulse
    0%, 100%
      opacity: 1
    50%
      opacity: 0.5

  .job-empty
    padding: 16px
    text-align: center
    color: #a3a3a3
    font-size: 12px

  // 老 q-item 样式保留（非客户端模式仍可能用到）
  .iHR-item-style
    border: 1px solid rgba(0, 0, 0, 0.12)
    border-radius: 6px

  .iHR-menu-link
    border-color: var(--q-primary-90) !important
</style>
