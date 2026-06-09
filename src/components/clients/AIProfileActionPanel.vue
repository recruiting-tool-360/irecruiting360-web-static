<!--
  AI 职位画像深度解析 - 动作面板

  跟随每条带 [&AI_SEARCH&] 标记的 bot 消息渲染在气泡下方，提供：
    1. 顶部一行：搜索牛人 / 推荐牛人 两个圆形对勾（默认都选中）+ 右侧"配置已自动锁定"
    2. 选中"推荐牛人"时展开青色配置卡片：
       - 匹配 Boss 直聘职位（下拉，数据来自 store.getters.getBossJobList）
       - 本次期望最大搜索"简历数"（数字输入 + "份"）

  视觉 1:1 参考 ihraisaas/src/components/AIAssistant/ChatPanel.tsx 第 926-1042 行：
    - 主色 #15B8A6 / 浅青底 #f0fcfc / 浅青边 #CCFBF1
    - 用原生 select / input 而非 Quasar 组件，避免 Quasar 默认重样式破坏视觉

  数据过滤：
    - BossData.jobList 里只展示 jobStatus === 0（招聘中）的职位，3=已关闭 直接过滤
-->
<template>
  <div class="ai-panel">
    <!--
      模块勾选 + 锁定提示

      显示逻辑（设置里 BOSS 未启用时简化 UI）：
        - bossEnabled=true（默认 / 设置里启用了 BOSS）：显示「搜索牛人」+「推荐牛人」两个勾选框
        - bossEnabled=false（设置里禁用了 BOSS）：
            · 「推荐牛人」依赖 BOSS 渠道，无意义
            · 只剩「搜索牛人」一个选项，让用户勾选也无意义
            · 「配置已自动锁定」单独留着也没意义
            → 整行隐藏，直接进配置卡片 / 启动按钮区
            （selectedModules 由 watch(bossEnabled) 自动改为 { search:true, recommend:false }）

      数据来源：store.getters.getUserChannelConfig → [{ key:'BOSS', enableConfig: bool }, ...]
    -->
    <div v-if="bossEnabled" class="modules-row">
      <div class="modules-left">
        <!--
          模块勾选项（1:1 对照 ihraisaas ChatPanel.tsx 929-953）：
            - w-6 h-6 rounded-lg border shadow-sm（24×24 方框圆角 8px + 浅阴影）
            - active：bg-primary-500 + border-primary-500 + ring-4 ring-primary-50
            - 勾：w-4 h-4 text-white（16×16 白色 Check）
            - 文字：text-xs font-black tracking-tight；active text-primary-600 / inactive text-neutral-500
        -->
        <span
          class="module-item"
          :class="{ active: selectedModules.search }"
          @click="toggleModule('search')"
        >
          <span class="check-box">
            <svg
              v-if="selectedModules.search"
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </span>
          <span class="module-text">搜索牛人</span>
        </span>
        <span
          class="module-item"
          :class="{ active: selectedModules.recommend }"
          @click="toggleModule('recommend')"
        >
          <span class="check-box">
            <svg
              v-if="selectedModules.recommend"
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </span>
          <span class="module-text">推荐牛人</span>
        </span>
      </div>
      <span class="lock-hint">配置已自动锁定</span>
    </div>

    <!--
      推荐牛人配置区域：
        外层 .recommend-section 提供 dotted 顶部分隔线（跟上面"模块勾选行"分开）
        内层 .config-card 才是真正的青色背景卡片
      用 <Transition> 让展开/收起平滑（透明度 + 高度 + 顶部 padding/border）
    -->
    <Transition name="rec-slide">
      <div v-if="selectedModules.recommend" class="recommend-section">
        <div class="config-card">
          <!-- 行 1：匹配 Boss 直聘职位 -->
          <div class="config-row">
            <div class="config-left">
              <svg
                class="row-icon"
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="12" cy="12" r="10"></circle>
                <circle cx="12" cy="12" r="6"></circle>
                <circle cx="12" cy="12" r="2"></circle>
              </svg>
              <span class="row-label">匹配 Boss 直聘职位</span>
            </div>
            <div class="select-wrap">
              <select
                v-model="matchedBossJobId"
                class="native-select"
                :class="{ 'native-select--unset': matchedBossJobId === null }"
                :disabled="bossJobOptions.length === 0"
                @change="onBossJobManualChange"
              >
                <option v-if="bossJobOptions.length === 0" :value="null">暂无 BOSS 我的职位</option>
                <!-- 占位项：未匹配/未选中时显示，避免原生 select 默认显示成第一项（看起来像已选中） -->
                <option v-else-if="matchedBossJobId === null" :value="null" disabled>
                  {{ bossMatchState === "matching" ? "正在匹配职位…" : "请选择匹配的 BOSS 职位" }}
                </option>
                <option v-for="opt in bossJobOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
              <svg
                class="select-caret"
                viewBox="0 0 24 24"
                width="12"
                height="12"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </div>
          </div>

          <!-- 无匹配提示：当前招聘职位在 BOSS「我的职位」里没有合适的对应职位，
               不自动选中，提示用户手动选择（或去 BOSS 完善职位）。 -->
          <div v-if="bossMatchState === 'no-match'" class="boss-match-hint">
            <svg
              class="boss-match-hint-icon"
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span class="boss-match-hint-text">
              未找到与当前招聘职位匹配的 BOSS 职位{{ bossMatchReason ? `（${bossMatchReason}）` : "" }}，请手动选择，或在 BOSS 直聘完善对应职位后重试。
            </span>
          </div>

          <!-- 行 2：本次期望最大搜索"简历数" -->
          <div class="config-row">
            <div class="config-left">
              <svg
                class="row-icon"
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
              <span class="row-label">本次期望最大推荐牛人"简历数"</span>
            </div>
            <div class="config-right">
              <input
                v-model="resumeCountInput"
                class="native-input"
                type="text"
                inputmode="numeric"
                maxlength="4"
                @input="onResumeCountInput"
              />
              <span class="config-unit">份</span>
            </div>
          </div>

          <!-- 行 3：输入简历数后展开 Schedule Info（参考 ihraisaas predictSchedule 简化版）
               ★ 启动搜索后（disabled=true）只保留「预计本次时长」，隐藏「预计开始/结束时间」：
                 开始/结束时间随排队动态变化，启动后再显示静态预估值会误导用户，仅在设置阶段展示。 -->
          <div v-if="resumeCountNum > 0" class="schedule-info">
            <div class="schedule-row">
              <span class="schedule-label">预计本次时长:</span>
              <span class="schedule-value">{{ estimatedDurationDisplay }}</span>
            </div>
            <template v-if="!disabled">
              <div class="schedule-row">
                <span class="schedule-label">预计开始时间:</span>
                <span class="schedule-value">{{ scheduledStartDisplay }}</span>
              </div>
              <div class="schedule-row">
                <span class="schedule-label">预计结束时间:</span>
                <span class="schedule-value">{{ scheduledEndDisplay }}</span>
              </div>
            </template>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 底部 CTA -->
    <div class="bottom-action">
      <p class="bottom-hint">基于深度画像准备搜索策略</p>
      <!--
        retryMode（消息带 previousSearchTaskId + searchConditionId）：
          隐藏「启动聚合搜索」，改显示「清空重新搜索 / 保留增量搜索」两个按钮，
          功能与「查看结果完成卡」的同名按钮一致（RESTART / CONTINUE）。
      -->
      <div v-if="isRetryMode" class="bottom-action-buttons">
        <button
          type="button"
          class="retry-btn restart"
          :disabled="aggregateDisabled"
          @click="lockMatchAndEmit('clear-and-restart')"
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
            <path d="M3 3v5h5"></path>
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path>
            <path d="M16 16h5v5"></path>
          </svg>
          <span>清空重新搜索</span>
        </button>
        <button
          type="button"
          class="retry-btn increment"
          :disabled="aggregateDisabled"
          @click="lockMatchAndEmit('keep-and-increment')"
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"
            ></path>
          </svg>
          <span>保留增量搜索</span>
        </button>
      </div>
      <div v-else class="bottom-action-buttons">
        <button
          type="button"
          class="aggregate-btn"
          :disabled="aggregateDisabled"
          @click="lockMatchAndEmit('aggregate')"
        >
          <svg
            class="aggregate-icon"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"
            />
            <path
              d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"
            />
          </svg>
          <span>启动聚合搜索</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onBeforeUnmount } from "vue";
import { useStore } from "vuex";
import { estimateSearchTask, matchBestPosition } from "src/api/searchTaskApi";
import { buildEstimatePayload } from "src/util/searchTaskPayloadBuilder";
import notify from "src/util/notify";

const props = defineProps({
  message: {
    type: Object,
    required: true
  },
  /**
   * 禁用所有操作按钮（启动聚合 / 清空重新 / 保留增量）。
   * 由 ChatCard 在"这张画像卡后面已经有结果卡片"时传 true —— 该画像卡已发起过搜索，
   * 不允许再次发起。
   */
  disabled: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits([
  "change",
  "aggregate",
  "view-results",
  "clear-and-restart",
  "keep-and-increment"
]);

const store = useStore();

/**
 * retryMode：消息带 previousSearchTaskId + searchConditionId（streamChat 新增字段）时，
 * 说明该职位已有上一次搜索任务 → 底部按钮从「启动聚合搜索」切成
 * 「清空重新搜索 / 保留增量搜索」（功能对应 RESTART / CONTINUE）。
 */
const isRetryMode = computed(
  () => !!(props.message?.previousSearchTaskId && props.message?.searchConditionId)
);

/**
 * 设置里"BOSS 渠道"是否启用 —— 决定整个推荐牛人 UI 是否可用。
 *
 * 数据来源：store.getters.getUserChannelConfig 返回数组 [{ key:'BOSS', enableConfig:bool }, ...]
 * （注：项目里 getChannelDisable() 函数名反语义，实际 enableConfig=true 表示启用）
 *
 * 联动效果（详见 template 的 v-if）：
 *   - bossEnabled=true：显示"搜索牛人 / 推荐牛人"两个勾选框（默认都勾）
 *   - bossEnabled=false：两个勾选框都隐藏；selectedModules 强制为 { search:true, recommend:false }
 */
const userChannelConfig = computed(() => store.getters.getUserChannelConfig || []);
const bossEnabled = computed(() => {
  const cfg = userChannelConfig.value.find((c) => c?.key === "BOSS");
  // 兼容：cfg 缺失时默认启用（避免 store 还没 hydrate 完时整块 UI 闪烁消失）
  if (!cfg) return true;
  return cfg.enableConfig !== false;
});

/**
 * 初始勾选从 store 的"用户上次偏好"读取（永久缓存，详见 AiSerachConfig.lastSelectedModules）
 * —— 新的 AIProfileActionPanel 实例化时自动套用上次的勾选状态，
 * 避免每次都强制回默认 { search:true, recommend:true }。
 *
 * 写回时机仅在 toggleModule（用户主动）；下方 watch(bossEnabled) 的强制收敛不写回，
 * 让 BOSS 重启时仍能从 lastSelectedModules 恢复用户真实偏好。
 */
const lastSelectedModules = computed(() => store.getters.getLastSelectedModules);
const selectedModules = ref({
  search: !!lastSelectedModules.value?.search,
  recommend: !!lastSelectedModules.value?.recommend
});

/**
 * BOSS 切到禁用时：自动收敛 selectedModules 到 { search:true, recommend:false }
 *   —— 仅 UI 层强制，不写 lastSelectedModules，下次 BOSS 启用时恢复用户真实偏好
 * BOSS 切到启用时：从 lastSelectedModules 恢复用户偏好（兜底全勾）
 *
 * 用 watch immediate:true 保证初次挂载时立刻同步，避免出现"BOSS 禁用 + recommend=true"
 * 的非法组合传给 aggregate 事件。
 */
watch(
  bossEnabled,
  (enabled) => {
    if (!enabled) {
      // BOSS 关了：只能搜索；推荐自动收起（仅运行态，不写 lastSelectedModules）
      if (selectedModules.value.recommend || !selectedModules.value.search) {
        selectedModules.value = { search: true, recommend: false };
      }
    } else {
      // BOSS 开了：从用户偏好恢复（偏好全 false 才兜底默认仅勾搜索，跟 AiSerachConfig
      // state 默认值 { search:true, recommend:false } 保持一致；推荐由用户明确勾选才走）
      const pref = lastSelectedModules.value || {};
      if (!pref.search && !pref.recommend) {
        selectedModules.value = { search: true, recommend: false };
      } else {
        selectedModules.value = {
          search: !!pref.search,
          recommend: !!pref.recommend
        };
      }
    }
  },
  { immediate: true }
);

function toggleModule(key) {
  // BOSS 禁用时 UI 上根本看不到勾选框（v-if 隐藏），点击不可达；
  // 但万一上层用 ref 强调 toggleModule 时也得防御一下，禁止打开 recommend
  if (key === "recommend" && !bossEnabled.value) return;
  const next = {
    ...selectedModules.value,
    [key]: !selectedModules.value[key]
  };
  selectedModules.value = next;
  // ★ 写回 lastSelectedModules（永久缓存）—— 下次新卡片用这个初始值
  store.commit("setLastSelectedModules", next);
}

// BOSS 职位下拉：仅展示开放（jobStatus === 0）的职位
const bossJobList = computed(() => store.getters.getBossJobList || []);
const bossJobOptions = computed(() =>
  bossJobList.value
    .filter((job) => Number(job.jobStatus) === 0) // 0 = 招聘中；3 = 已关闭
    .map((job) => ({
      value:
        job.encryptJobId || job.encryptId || String(job.jobId || job.positionName || job.jobName),
      label: `${job.jobName || job.positionName || "未命名职位"}${
        job.salaryDesc ? ` (${job.salaryDesc})` : ""
      }`,
      raw: job
    }))
);

// 推荐牛人匹配到的 BOSS 职位 encryptJobId。
//   - 自动匹配：勾选推荐时调 /search/matchBestPosition 把当前 i人事职位匹配到最合适的 BOSS 职位；
//     未命中 → null（不自动选中任何职位）。
//   - 手动覆盖：用户在下拉里选过后 _userPickedBoss=true，不再被自动匹配覆盖（换职位会话时重置）。
//   （自动匹配逻辑 autoMatchBossPosition 定义在 latestChatId/latestPositionId 之后）
const matchedBossJobId = ref(null);
let _userPickedBoss = false;
// 本卡片是否已发起过搜索（用户点过启动/重搜/增量）→ 锁定匹配职位，不再自动匹配
const searchLocked = ref(false);
// BOSS 职位匹配状态：'idle' 未匹配 / 'matching' 匹配中 / 'matched' 已命中 / 'no-match' 无匹配
const bossMatchState = ref("idle");
const bossMatchReason = ref(""); // 无匹配时后端给的原因，用于提示
function onBossJobManualChange() {
  _userPickedBoss = true;
  // 用户手动选了 → 视为已选定，清掉"无匹配"提示
  bossMatchState.value = "matched";
}

// 初始默认值：本 chatId 上次填写过的简历份数（持久化在 AiSerachConfig.lastResumeCountByChatId）
const resumeCountInput = ref("");
{
  const lastCount = store.getters.getLastResumeCountForChat(store.getters.getLatestChatId || "");
  if (lastCount) resumeCountInput.value = String(lastCount);
}
function onResumeCountInput(e) {
  // 限制只能输入数字
  const v = String(e.target.value || "").replace(/[^\d]/g, "");
  resumeCountInput.value = v;
  // 持久化本 chatId 的简历份数（仅非空时写，避免临时清空把记忆抹掉）→ 下次新卡片默认上次值
  if (v !== "") {
    store.commit("setLastResumeCount", {
      chatId: store.getters.getLatestChatId || "",
      count: v
    });
  }
}

const resumeCountNum = computed(() => {
  const n = Number(resumeCountInput.value);
  return Number.isFinite(n) && n > 0 ? n : 0;
});

/* ===========================================================================
 * 预估时长 / 开始时间 / 结束时间 —— 全部通过 POST /search/task/estimate 接口拉取
 *
 * 旧版本是本地公式硬算（resumeCount × perSec / 3600），跟后端实际排队 / 工作时段
 * 都没关系，用户看到的"预计开始时间"永远是"现在"，体感很奇怪。
 *
 * 新版本：
 *   - watch [resumeCountNum, selectedModules, matchedBossJobId] → debounce 300ms 调 estimate
 *   - 接口返回 estimatedDurationMinutes / estimatedStartTime / estimatedEndTime 直接展示
 *   - 接口失败 / 还在加载 → 回落本地公式兜底（不让 UI 空白）
 *   - resumeCount 为 0 或 channels 为空 → 不调接口，显示 '--'
 *
 * 接口约定见 src/api/searchTaskApi.js estimateSearchTask 注释
 * payload 组装见 src/util/searchTaskPayloadBuilder.js buildEstimatePayload
 * ========================================================================== */

const cfgList = computed(() => store.getters.getUserChannelConfig || []);
const latestChatId = computed(() => store.getters.getLatestChatId || "");
const latestPositionId = computed(() => store.getters.getLatestPositionId || "");

/* ===========================================================================
 * 推荐牛人：自动把「当前 i人事 职位」匹配到 BOSS「我的职位」里最合适的一个
 *   接口：POST /search/matchBestPosition（后端按当前登录用户 + positionId/chatId 取当前职位名，
 *        与候选 BOSS 职位列表做语义匹配）。命中 → 选中；明显无关（matched=false）→ 不自动选中。
 * 触发：勾选推荐 / BOSS 职位列表就绪 / 切换职位会话。用户手动选过后不再自动覆盖。
 * ========================================================================== */
let _matchSeq = 0; // 防 race：晚返回的旧匹配请求丢弃
async function autoMatchBossPosition() {
  // ★ 搜索已启动（点过启动/重搜/增量，或卡片 disabled）→ 配置已锁定提交给后端，绝不再调匹配接口/改动选中职位。
  //   否则任务执行期间 latestChatId/latestPositionId/bossJobOptions 变化会重新匹配，
  //   匹配不中时把已选中的 BOSS 职位重置成 null（用户反馈：搜索后匹配职位丢失）。
  if (props.disabled || searchLocked.value) return;
  if (_userPickedBoss) return; // 用户手动选过 → 尊重用户选择
  const opts = bossJobOptions.value;
  if (!opts.length) {
    matchedBossJobId.value = null;
    bossMatchState.value = "idle";
    return;
  }
  // 至少要有 positionId 或 chatId 才能让后端取到"当前职位名"
  if (!latestPositionId.value && !latestChatId.value) return;

  const positions = opts.map((o) => ({
    positionId: o.value,
    positionName: o.raw?.jobName || o.raw?.positionName || "",
    positionDesc: o.raw?.jobDesc || o.raw?.positionDesc || "",
    salary: o.raw?.salaryDesc || o.raw?.salary || "",
    city: o.raw?.cityName || o.raw?.city || ""
  }));

  const seq = ++_matchSeq;
  bossMatchState.value = "matching";
  bossMatchReason.value = "";
  try {
    const res = await matchBestPosition({
      positionId: latestPositionId.value || undefined,
      chatId: latestChatId.value || undefined,
      positions,
      minScore: 60
    });
    if (seq !== _matchSeq || _userPickedBoss) return; // 已被新匹配覆盖 / 用户手动选了
    const data = res?.data;
    if (res?.success === "success" && data?.matched && data.matchedPosition) {
      const id = data.matchedPosition.positionId;
      if (opts.some((o) => o.value === id)) {
        matchedBossJobId.value = id; // 命中且在当前选项里 → 选中
        bossMatchState.value = "matched";
        console.log(
          `[AIProfileActionPanel] matchBestPosition 命中：${id} score=${data.score} reason=${data.reason}`
        );
        return;
      }
    }
    // 未命中 / 命中项不在当前列表 → 不自动选中任何职位（用户需手动选），并提示
    matchedBossJobId.value = null;
    bossMatchState.value = "no-match";
    bossMatchReason.value = data?.reason || "";
    console.log(
      `[AIProfileActionPanel] matchBestPosition 无匹配 → 不自动选中（score=${data?.score} reason=${data?.reason}）`
    );
  } catch (e) {
    if (seq !== _matchSeq) return;
    // 接口异常：保持现状不强行选中，避免误选不相关职位
    bossMatchState.value = "idle";
    console.warn("[AIProfileActionPanel] matchBestPosition 失败:", e?.message || e);
  }
}

// 切换职位会话 → 允许重新自动匹配（清掉手动覆盖标记）。
//   ★ 搜索已启动（disabled）时不重置：此卡片配置已锁定，不该再被自动匹配影响。
watch(latestChatId, () => {
  if (props.disabled || searchLocked.value) return;
  _userPickedBoss = false;
});

// 勾选推荐 / BOSS 职位列表就绪 / 职位上下文变化 → 触发自动匹配
watch(
  [bossJobOptions, () => selectedModules.value.recommend, latestChatId, latestPositionId],
  ([opts, recommend]) => {
    // ★ 搜索已启动 → 卡片只读，保持已选匹配职位不动（不清空、不重新匹配）
    if (props.disabled || searchLocked.value) return;
    if (!recommend) {
      bossMatchState.value = "idle"; // 取消推荐 → 清掉匹配提示
      return;
    }
    if (!opts.length) {
      matchedBossJobId.value = null;
      bossMatchState.value = "idle";
      return;
    }
    // 当前选中已不在选项里 → 先清掉，交给 autoMatch 重选
    if (!_userPickedBoss && !opts.some((o) => o.value === matchedBossJobId.value)) {
      matchedBossJobId.value = null;
    }
    autoMatchBossPosition();
  },
  { immediate: true }
);

/** 接口返回的预估结果（命中时优先于本地兜底） */
const estimateRemote = ref(null); // { durationMin, startISO, endISO } | null
const estimateLoading = ref(false);

/** debounce 调 estimate 接口 */
let _estimateTimer = null;
let _estimateSeq = 0; // 防 race：晚返回的旧请求丢弃
function scheduleEstimate() {
  if (_estimateTimer) clearTimeout(_estimateTimer);
  // 立刻进入"计算中"态：debounce 窗口内也显示占位，避免先闪本地默认值（如 0.1h）
  // 再被接口结果覆盖。只展示接口返回值，不做本地兜底。
  if (resumeCountNum.value > 0) {
    estimateRemote.value = null;
    estimateLoading.value = true;
  }
  _estimateTimer = setTimeout(runEstimate, 300);
}
async function runEstimate() {
  // 简历数为 0（用户没填）→ 不调接口；UI 自然显示 '--'
  if (resumeCountNum.value <= 0) {
    estimateRemote.value = null;
    estimateLoading.value = false;
    return;
  }
  const payload = buildEstimatePayload({
    chatId: latestChatId.value,
    positionId: latestPositionId.value,
    cfgList: cfgList.value,
    selectedModules: selectedModules.value,
    matchedBossJobId: matchedBossJobId.value,
    resumeCount: resumeCountNum.value,
    taskType: "INITIAL"
  });
  if (!payload) {
    estimateRemote.value = null; // 没有启用渠道
    estimateLoading.value = false;
    return;
  }
  const seq = ++_estimateSeq;
  estimateLoading.value = true;
  try {
    const res = await estimateSearchTask(payload);
    if (seq !== _estimateSeq) return; // 已被新请求覆盖
    // 接口业务失败（如"最大简历数请填写 0-100 之间的整数"）→ 显示后端 errorMessage + 清空预估
    if (!res || res.success !== "success") {
      const msg = res?.errorMessage || res?.message || "预估失败";
      notify.warning(msg, { group: "estimate-error" });
      estimateRemote.value = null;
      return;
    }
    const data = res?.data || {};
    estimateRemote.value = {
      durationMin: Number(data.estimatedDurationMinutes) || 0,
      startISO: data.estimatedStartTime || null,
      endISO: data.estimatedEndTime || null
    };
  } catch (e) {
    if (seq !== _estimateSeq) return;
    console.warn("[AIProfileActionPanel] estimate 接口失败，回落本地公式:", e?.message || e);
    estimateRemote.value = null; // fallback 走本地公式
  } finally {
    if (seq === _estimateSeq) estimateLoading.value = false;
  }
}

// 任何会影响 channels / resumeCount 的变化都 trigger 一次（debounce 300ms）
watch(
  [resumeCountNum, selectedModules, matchedBossJobId, cfgList, latestChatId],
  scheduleEstimate,
  { immediate: true, deep: true }
);

/**
 * 预估时长 / 开始 / 结束时间 —— **只展示接口（/search/task/estimate）返回值**。
 *
 * 不再用本地公式兜底：之前本地兜底会在输入瞬间先算出一个值（如 0.1h）显示出来，
 * 等接口返回再被覆盖，体验上"先闪一个本地默认值再跳成接口值"很奇怪（用户反馈）。
 * 现在接口结果没回来之前统一显示占位：
 *   - 正在请求 / debounce 中 → "计算中…"
 *   - 接口失败 / 无数据      → "--"
 */
const SCHEDULE_PENDING = "计算中…";
const SCHEDULE_EMPTY = "--";

function pad2(n) {
  return String(n).padStart(2, "0");
}
function formatMMddHHmm(date) {
  return `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(
    date.getMinutes()
  )}`;
}

/** 接口结果还没就绪时的占位文案：加载中显示"计算中…"，否则"--" */
const schedulePlaceholder = computed(() =>
  estimateLoading.value ? SCHEDULE_PENDING : SCHEDULE_EMPTY
);

const estimatedDurationDisplay = computed(() => {
  if (estimateRemote.value?.durationMin) {
    // 按分钟展示（向上取整，至少 1 分钟）
    const min = Math.max(1, Math.ceil(estimateRemote.value.durationMin));
    return `${min}分钟`;
  }
  return schedulePlaceholder.value;
});

const scheduledStartDisplay = computed(() => {
  if (estimateRemote.value?.startISO) {
    const d = new Date(estimateRemote.value.startISO);
    if (!Number.isNaN(d.getTime())) return formatMMddHHmm(d);
  }
  return schedulePlaceholder.value;
});
const scheduledEndDisplay = computed(() => {
  if (estimateRemote.value?.endISO) {
    const d = new Date(estimateRemote.value.endISO);
    if (!Number.isNaN(d.getTime())) return formatMMddHHmm(d);
  }
  return schedulePlaceholder.value;
});

onBeforeUnmount(() => {
  if (_estimateTimer) clearTimeout(_estimateTimer);
});

function getState() {
  return {
    selectedModules: selectedModules.value,
    matchedBossJobId: matchedBossJobId.value,
    resumeCount: resumeCountInput.value === "" ? null : Number(resumeCountInput.value)
  };
}

/**
 * 用户点击「启动聚合搜索 / 清空重新搜索 / 保留增量搜索」→ 锁定本卡片的匹配职位。
 * 之后哪怕 latestChatId/latestPositionId/bossJobOptions 再变（任务执行期间切会话、
 * 重新拉 BOSS 职位列表等）都不再调匹配接口、不动已选中的 BOSS 职位。
 * （用户反馈：匹配过职位、点搜索后又被重新匹配，匹配不中就把已选职位丢了）
 */
function lockMatchAndEmit(eventName) {
  searchLocked.value = true;
  emit(eventName, getState());
}

/**
 * **immediate: true** —— mount 时也 emit 一次。
 *
 * 必要性：ChatCard 用 actionPanelStateByMsgId[msg.id] 记录每条 AI_SEARCH 消息的勾选状态。
 *        AIProfileActionPanel 挂载时如果 BOSS 禁用，watch(bossEnabled) 会立刻把
 *        selectedModules 改成 { search:true, recommend:false }；但若不 immediate,
 *        ChatCard 那边 state 一直是 undefined，handleSearch 走 fallback
 *        { search:true, recommend:true } —— 会触发推荐牛人进度卡片误显示。
 */
watch(getState, (val) => emit("change", val), { deep: true, immediate: true });

/** 启动按钮禁用条件：两个模块都没勾 / 勾了推荐牛人但没填简历数 */
const aggregateDisabled = computed(() => {
  // 该画像卡后面已有结果卡片（已发起过搜索）→ 全部按钮禁用
  if (props.disabled) return true;
  if (!selectedModules.value.search && !selectedModules.value.recommend) return true;
  if (selectedModules.value.recommend && resumeCountNum.value <= 0) return true;
  return false;
});

defineExpose({ getState });

void props;
</script>

<style scoped lang="scss">
$accent: #15b8a6;
$accent-hover: #0d9488;
$accent-bg: #f0fcfc;
$accent-border: #ccfbf1;

/*
  ActionPanel 整体结构（参考 ihraisaas ChatPanel.tsx 926-1075）：
    1. 顶部 dotted 分隔线 + 模块勾选行
    2. 仅 recommend=true 时插入 .recommend-section（自带 dotted 顶部分隔线）
    3. .bottom-action（自带 dotted 顶部分隔线）+ "启动聚合搜索"
  即三段全部用 dotted 顶部分隔线，统一颜色 #e5e7eb (neutral-200)
*/
.ai-panel {
  padding-top: 16px;
  border-top: 1px dotted #e5e7eb;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 16px; /* space-y-4 */
}

/* ===== 模块勾选行 ===== */
.modules-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.modules-left {
  display: flex;
  align-items: center;
  gap: 24px; /* space-x-6 */
}
.module-item {
  display: inline-flex;
  align-items: center;
  gap: 10px; /* space-x-2.5 */
  cursor: pointer;
  user-select: none;

  /* 1:1 对照 ihraisaas: w-6 h-6 rounded-lg border shadow-sm */
  .check-box {
    width: 24px;
    height: 24px;
    border-radius: 8px; /* rounded-lg */
    border: 1px solid #d4d4d8; /* border-neutral-300 */
    background: #fff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
    color: #fff;
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05); /* shadow-sm */
    flex-shrink: 0;
  }
  .module-text {
    font-size: 12px; /* text-xs */
    font-weight: 900; /* font-black */
    color: #737373; /* text-neutral-500 */
    letter-spacing: -0.025em; /* tracking-tight */
    transition: color 0.15s;
  }

  &.active {
    .check-box {
      background: $accent; /* bg-primary-500 */
      border-color: $accent; /* border-primary-500 */
      /* ring-4 ring-primary-50 */
      box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05), 0 0 0 4px #f0fdfa;
    }
    .module-text {
      color: #0d9488; /* text-primary-600 */
    }
  }
  &:hover:not(.active) .check-box {
    border-color: #2dd4bf; /* group-hover:border-primary-400 */
  }
}
.lock-hint {
  font-size: 10px; /* text-[10px] */
  font-style: italic;
  font-weight: 500;
  color: #a3a3a3; /* text-neutral-400 */
}

/* ===== 推荐牛人 配置区域：外层提供 dotted 顶部分隔线（跟"模块勾选行"分开） ===== */
.recommend-section {
  padding-top: 16px;
  border-top: 1px dotted #e5e7eb;
  overflow: hidden; /* 收起时 max-height 配合 overflow 才能裁剪内部 config-card */
}

/*
  <Transition name="rec-slide"> 的进入/离开动画
    收起：opacity → 0，max-height → 0，padding-top → 0，border 消失
    展开：反之
  max-height 给 600px 足够容纳 config-card（行 1 + 行 2 + schedule-info）
*/
.rec-slide-enter-active,
.rec-slide-leave-active {
  transition: opacity 0.22s ease, max-height 0.28s cubic-bezier(0.2, 0.8, 0.4, 1),
    padding-top 0.22s ease, border-top-color 0.18s ease, transform 0.22s ease;
  will-change: opacity, max-height, padding-top, transform;
}
.rec-slide-enter-from,
.rec-slide-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  border-top-color: transparent;
  transform: translateY(-4px);
}
.rec-slide-enter-to,
.rec-slide-leave-from {
  opacity: 1;
  max-height: 600px;
  padding-top: 16px;
  border-top-color: #e5e7eb;
  transform: translateY(0);
}

/* ===== 推荐牛人 配置卡片（青色背景，外层 recommend-section 已经提供分隔线） ===== */
.config-card {
  background: $accent-bg;
  border: 1px solid $accent-border;
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.config-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.config-left {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: $accent;
}
.row-icon {
  flex-shrink: 0;
  color: $accent;
}
.row-label {
  font-size: 13px;
  font-weight: 600;
  color: #3f3f46;
}
.config-right {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* select */
.select-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}
.native-select {
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  background: #fff;
  border: 1px solid #e4e4e7;
  border-radius: 6px;
  padding: 6px 26px 6px 10px;
  font-size: 12px;
  font-weight: 600;
  color: #52525b;
  cursor: pointer;
  outline: none;
  min-width: 200px;
  max-width: 280px;
  transition: border-color 0.15s, box-shadow 0.15s;

  &:hover:not(:disabled) {
    border-color: #2dd4bf; /* teal-400，与 $accent 浅 10% 等价；避免用已弃用的 lighten() */
  }
  &:focus {
    border-color: $accent;
    box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.12);
  }
  &:disabled {
    background: #f4f4f5;
    color: #a1a1aa;
    cursor: not-allowed;
  }
}
/* 未选中/未匹配：占位项用灰色文字（区别于已选中的深色），且边框给个浅警示色 */
.native-select--unset {
  color: #a1a1aa;
  border-color: #fcd34d; /* amber-300：提示尚未选定 */
}
.select-caret {
  position: absolute;
  right: 8px;
  pointer-events: none;
  color: #71717a;
}

/* 无匹配提示行（amber 警示色，与 LoginRequiredPanel 警示风格一致） */
.boss-match-hint {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 2px 0 6px;
  padding: 8px 10px;
  background: #fffbeb; /* amber-50 */
  border: 1px solid #fde68a; /* amber-200 */
  border-radius: 6px;
}
.boss-match-hint-icon {
  flex: none;
  margin-top: 1px;
  color: #d97706; /* amber-600 */
}
.boss-match-hint-text {
  font-size: 12px;
  line-height: 1.5;
  color: #b45309; /* amber-700 */
}

/* input */
.native-input {
  appearance: none;
  background: #fff;
  border: 1px solid #e4e4e7;
  border-radius: 6px;
  padding: 6px 10px;
  width: 64px;
  text-align: right;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-weight: 700;
  font-size: 12px;
  color: $accent;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;

  &:focus {
    border-color: $accent;
    box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.12);
  }
}
.config-unit {
  font-size: 12px;
  font-weight: 700;
  color: #a1a1aa;
}

/* ===== 底部 CTA：启动聚合搜索（自带 dotted 顶部分隔线） ===== */
.bottom-action {
  padding-top: 16px;
  border-top: 1px dotted #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.bottom-action-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 调试 / 测试用按钮：查看结果（切到 results 视图） */
.view-results-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px dashed #d4d4d8;
  border-radius: 10px;
  background: #fff;
  color: #737373;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
}
.view-results-btn:hover {
  border-color: $accent;
  color: $accent;
  background: #f0fdfa;
}
.bottom-hint {
  margin: 0;
  font-size: 11px;
  font-style: italic;
  color: #a1a1aa;
}
.aggregate-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 24px;
  border: 0;
  border-radius: 12px;
  background: linear-gradient(90deg, #15b8a6 0%, #2dd4bf 50%, #14b8a6 100%);
  color: #fff;
  font-size: 13px;
  font-weight: 900;
  letter-spacing: -0.01em;
  cursor: pointer;
  box-shadow: 0 8px 16px -4px rgba(20, 184, 166, 0.35);
  transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s;
}
.aggregate-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 10px 20px -4px rgba(20, 184, 166, 0.5);
}
.aggregate-btn:active:not(:disabled) {
  transform: scale(0.97);
}
.aggregate-btn:disabled {
  background: #d4d4d8;
  box-shadow: none;
  cursor: not-allowed;
}
.aggregate-icon {
  flex-shrink: 0;
}

/* retryMode：清空重新搜索 / 保留增量搜索（视觉对照 task-completion-card.html 90-104） */
.retry-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  transition: background 0.15s, transform 0.1s, opacity 0.15s;
}
.retry-btn svg {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
}
.retry-btn:active:not(:disabled) {
  transform: scale(0.95);
}
.retry-btn:disabled {
  opacity: 0.5;
  filter: grayscale(1);
  cursor: not-allowed;
}
.retry-btn.restart {
  background: #fff9f3;
  color: #f59e0b;
  border: 1px solid #fde68a;
}
.retry-btn.restart:hover:not(:disabled) {
  background: #fff4e8;
}
.retry-btn.increment {
  background: #f0fdf4;
  color: #15b8a6;
  border: 1px solid #ccfbf1;
}
.retry-btn.increment:hover:not(:disabled) {
  background: #dcfce7;
}

/* schedule info sub-card（输入简历数后展开） */
.schedule-info {
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid $accent-border;
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.schedule-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
}
.schedule-label {
  color: #71717a;
  font-weight: 500;
}
.schedule-value {
  color: #27272a;
  font-weight: 700;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
</style>
