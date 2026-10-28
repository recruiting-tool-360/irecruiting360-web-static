<!--
  AI 人才评估报告（新版 AI 评分详情）

  数据源：POST /web-manage-api/resume/queryEvaluationReport
  入参：{ taskResumeId }
-->
<template>
  <q-dialog v-model="open" transition-show="scale" transition-hide="scale">
    <q-card class="aer-card">
      <div class="aer-page" @scroll.capture.passive="handleReportScroll">
        <!-- 顶部标题栏 -->
        <header class="aer-header">
          <div class="aer-header-title">
            <h1>AI人才评估报告</h1>
            <p>基于当前生效职位画像与候选人最新简历生成</p>
          </div>
          <div class="aer-header-actions">
            <button class="aer-close-btn" type="button" @click="open = false">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        </header>

        <main class="aer-main">
          <div v-if="loading" class="aer-loading">
            <q-spinner color="primary" size="28px" />
            <span>正在加载 AI 匹配详情…</span>
          </div>

          <div v-else-if="loadError" class="aer-empty">
            <div class="aer-empty__title">AI 匹配详情加载失败</div>
            <div class="aer-empty__desc">{{ loadError }}</div>
            <button class="aer-retry-btn" type="button" @click="loadReport">重新加载</button>
          </div>

          <template v-else>
            <!-- 左侧：候选人信息 -->
            <aside class="aer-sidebar">
              <section class="aer-candidate-card">
                <div class="aer-candidate-heading">
                  <q-avatar size="80px" class="aer-avatar">
                    <img :src="avatarSrc" />
                  </q-avatar>
                  <div class="aer-total-score">
                    <span>综合评分</span>
                    <strong>{{ totalScoreText }}<small v-if="totalScoreText !== '-'">分</small></strong>
                  </div>
                </div>
                <h1>{{ candidateName }}</h1>

                <div class="aer-stage-tags">
                  <span v-if="positionName" class="aer-tag aer-tag--position">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect width="18" height="18" x="3" y="4" rx="2" />
                      <circle cx="9" cy="10" r="2" />
                      <path d="M15 8h3" />
                      <path d="M15 12h3" />
                      <path d="M7 16h10" />
                    </svg>
                    <span>{{ positionName }}</span>
                  </span>
                  <span v-if="channelName" class="aer-tag aer-tag--channel">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M2 12h20" />
                      <path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20" />
                    </svg>
                    <span>{{ channelName }}</span>
                  </span>
                  <span v-if="stageName" class="aer-tag aer-tag--cyan">{{ stageName }}</span>
                </div>

                <div class="aer-score-metrics">
                  <div>
                    <span>基础分</span>
                    <strong>{{ baseScoreText }}<small v-if="baseScoreText !== '-'">分</small></strong>
                  </div>
                  <div>
                    <span>加分项</span>
                    <strong>{{ bonusScoreText }}</strong>
                  </div>
                  <div>
                    <span>减分项</span>
                    <strong>{{ deductionScoreText }}</strong>
                  </div>
                  <div>
                    <span>无法判断</span>
                    <strong>{{ pendingCountText }}<small>项</small></strong>
                  </div>
                </div>

                <div v-if="basicInfoText || mobileNo || email" class="aer-candidate-contact">
                  <div v-if="basicInfoText">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    <span>{{ basicInfoText }}</span>
                  </div>
                  <div v-if="mobileNo">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                    </svg>
                    <span>+86 {{ formatPhone(mobileNo) }}</span>
                  </div>
                  <div v-if="email">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect width="20" height="16" x="2" y="4" rx="2" />
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                    </svg>
                    <span>{{ email }}</span>
                  </div>
                </div>

                <div v-if="candidateTags.length" class="aer-candidate-tags">
                  <span v-for="(t, i) in candidateTags" :key="`ct-${i}`" class="aer-chip">{{ t }}</span>
                </div>

                <div v-if="workExperiences.length || educationExperiences.length" class="aer-candidate-history">
                  <div v-if="workExperiences.length">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M2 20h20" />
                      <path d="M4 20V8l8-6 8 6v12" />
                    </svg>
                    <span>{{ workExperiences.join('  |  ') }}</span>
                  </div>
                  <div v-if="educationExperiences.length">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                      <path d="M6 12v5c3 3 9 3 12 0v-5" />
                    </svg>
                    <span>{{ educationExperiences.join('  |  ') }}</span>
                  </div>
                </div>
              </section>

              <section v-if="highlights.length || advice.length" class="aer-insight-card">
                <div v-if="highlights.length" class="aer-insight aer-insight--highlight">
                  <strong>候选人亮点</strong>
                  <ul>
                    <li v-for="(h, i) in highlights" :key="`hl-${i}`">{{ h }}</li>
                  </ul>
                </div>
                <div v-if="advice.length" class="aer-insight aer-insight--advice">
                  <strong>注意事项</strong>
                  <ul>
                    <li v-for="(a, i) in advice" :key="`ad-${i}`">{{ a }}</li>
                  </ul>
                </div>
              </section>

              <section class="aer-meta-card">
                <div class="aer-meta-panel">
                  <dl>
                    <div>
                      <dt>画像版本</dt>
                      <dd>{{ versionText }}</dd>
                    </div>
                    <div>
                      <dt>评估依据</dt>
                      <dd>{{ evaluationBasisText }}</dd>
                    </div>
                    <div>
                      <dt>评估时间</dt>
                      <dd>{{ evaluatedAtText }}</dd>
                    </div>
                  </dl>
                  <p>本报告由 AI 自动生成，仅作为招聘决策的辅助参考。</p>
                </div>
              </section>
            </aside>

            <!-- 右侧：评估报告 -->
            <section class="aer-report-card">
              <div class="aer-conclusion">
                <div class="aer-conclusion-title">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="url(#aer-grad)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <defs>
                      <linearGradient id="aer-grad" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stop-color="#7B9CFF" />
                        <stop offset="100%" stop-color="#B07BFF" />
                      </linearGradient>
                    </defs>
                    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.582a.5.5 0 0 1 0 .962L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
                  </svg>
                  <strong>AI综合结论</strong>
                </div>
                <p>{{ conclusionText }}</p>
              </div>

              <div v-if="groups.length" class="aer-groups">
                <div v-for="group in groups" :key="group.id" class="aer-group">
                  <div class="aer-group-title">
                    <span class="aer-group-bar" :class="`aer-group-bar--${group.bar || 'weight'}`"></span>
                    <strong>{{ group.title }}({{ group.items.length }})</strong>
                    <span v-if="group.tip" class="aer-group-tip">{{ group.tip }}</span>
                  </div>
                  <div class="aer-table-scroll">
                    <table class="aer-table">
                      <thead>
                        <tr>
                          <th class="aer-col-dimension">评估维度</th>
                          <th class="aer-col-standard">评估标准</th>
                          <th v-if="group.hasScore" class="aer-col-score">
                            {{ group.scoreColumnTitle }}
                          </th>
                          <th class="aer-col-result">评估结果</th>
                          <th class="aer-col-evidence">依据来源</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="(item, idx) in group.items" :key="`${group.id}-${idx}`">
                          <td>
                            <div
                              class="aer-clamp-text"
                              @mouseenter="showTextPopover($event, item.dimension)"
                              @mouseleave="hideTextPopover"
                            >{{ item.dimension }}</div>
                          </td>
                          <td>
                            <div
                              class="aer-clamp-text"
                              @mouseenter="showTextPopover($event, item.standard)"
                              @mouseleave="hideTextPopover"
                            >{{ item.standard }}</div>
                          </td>
                          <td v-if="group.hasScore">
                            <span
                              class="aer-tag-score"
                              :class="{
                                'aer-tag-score--bonus': group.ruleType === 'BONUS',
                                'aer-tag-score--deduction': group.ruleType === 'DEDUCTION'
                              }"
                            >{{ item.scoreText }}</span>
                          </td>
                          <td>
                            <span class="aer-result-tag" :class="`aer-result-tag--${item.result}`">
                              <svg v-if="item.result === 'failed'" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                              <svg v-else-if="item.result === 'partial' || item.result === 'notTriggered'" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
                              <svg v-else viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                              {{ item.resultText }}
                            </span>
                          </td>
                          <td class="aer-evidence">
                            <div class="aer-evidence-content">
                              <div
                                class="aer-clamp-text"
                                @mouseenter="showTextPopover($event, item.evidence)"
                                @mouseleave="hideTextPopover"
                              >{{ item.evidence }}</div>
                              <span v-if="item.sensitive" class="aer-sensitive-tag">敏感</span>
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div v-else class="aer-groups-empty">暂无评估维度数据</div>

              <q-popup-proxy
                v-model="textPopoverVisible"
                :target="textPopoverTarget"
                anchor="bottom middle"
                self="top middle"
                :offset="[0, 8]"
              >
                <div class="aer-overflow-popover">{{ textPopoverContent }}</div>
              </q-popup-proxy>
            </section>
          </template>
        </main>
      </div>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { queryEvaluationReport } from "src/api/jobList/JobListApi";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /** ResumeCard 传入的候选人数据 */
  resumeData: { type: Object, default: () => ({}) },
  /** 任务简历 ID；不传时从 resumeData.taskResumeId 兜底 */
  taskResumeId: { type: [String, Number], default: "" }
});
const emit = defineEmits(["update:modelValue"]);

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit("update:modelValue", v)
});

const report = ref(null);
const loading = ref(false);
const loadError = ref("");
const textPopoverVisible = ref(false);
const textPopoverTarget = ref(null);
const textPopoverContent = ref("");
let requestSeq = 0;
const scrollbarHideTimers = new WeakMap();

const REPORT_SCROLL_SELECTOR = ".aer-main, .aer-sidebar, .aer-table-scroll";

function hideTextPopover() {
  textPopoverVisible.value = false;
  textPopoverTarget.value = null;
  textPopoverContent.value = "";
}

function showTextPopover(event, text) {
  const target = event?.currentTarget;
  if (!(target instanceof HTMLElement)) return;

  hideTextPopover();
  if (target.scrollHeight <= target.clientHeight + 1) return;

  textPopoverTarget.value = target;
  textPopoverContent.value = String(text || "");
  textPopoverVisible.value = true;
}

/** 仅在实际滚动时短暂显示滚动条，停止后恢复透明。 */
function handleReportScroll(event) {
  const target = event?.target;
  if (!target?.matches || !target.matches(REPORT_SCROLL_SELECTOR)) return;
  hideTextPopover();
  target.classList.add("is-scrolling");
  const previousTimer = scrollbarHideTimers.get(target);
  if (previousTimer) clearTimeout(previousTimer);
  const timer = setTimeout(() => {
    target.classList.remove("is-scrolling");
    scrollbarHideTimers.delete(target);
  }, 700);
  scrollbarHideTimers.set(target, timer);
}

const hasValue = (value) => value !== undefined && value !== null && String(value).trim() !== "";
const asText = (value, fallback = "-") => (hasValue(value) ? String(value) : fallback);

const reportTaskResumeId = computed(() => {
  const direct =
    props.taskResumeId ||
    props.resumeData?.taskResumeId ||
    props.resumeData?.taskResumeID ||
    props.resumeData?._raw?.taskResumeId;
  return hasValue(direct) ? String(direct) : "";
});

const reportData = computed(() => report.value || {});
const header = computed(() => {
  if (reportData.value.header && typeof reportData.value.header === "object") {
    return reportData.value.header;
  }
  return {
    candidateName: reportData.value.candidateName,
    positionName: reportData.value.positionName,
    currentStageName: reportData.value.currentStageName
  };
});
const candidateProfile = computed(() =>
  reportData.value.candidateProfile && typeof reportData.value.candidateProfile === "object"
    ? reportData.value.candidateProfile
    : reportData.value.candidate || {}
);
const scoreSummary = computed(() =>
  reportData.value.scoreSummary && typeof reportData.value.scoreSummary === "object"
    ? reportData.value.scoreSummary
    : reportData.value.score || {}
);
const evaluationStatus = computed(() =>
  reportData.value.evaluationStatus && typeof reportData.value.evaluationStatus === "object"
    ? reportData.value.evaluationStatus
    : {}
);
const versionInfo = computed(() => reportData.value.versionInfo || {});
const aiConclusion = computed(() =>
  reportData.value.aiConclusion && typeof reportData.value.aiConclusion === "object"
    ? reportData.value.aiConclusion
    : {}
);

const candidateName = computed(() => asText(header.value.candidateName || props.resumeData?.name, "候选人"));
const positionName = computed(() => {
  const direct = header.value.positionName;
  if (hasValue(direct)) return String(direct);
  const intention = props.resumeData?.intention;
  if (!hasValue(intention)) return "";
  return String(intention).split(/[·|]/)[0].trim();
});
const channelName = computed(() => asText(candidateProfile.value.resumeSource || props.resumeData?.channel, ""));
const stageName = computed(() => asText(header.value.currentStageName, ""));
const avatarSrc = computed(() =>
  props.resumeData?.gender === 1
    ? "/index/header/icons/geekMan.svg"
    : "/index/header/icons/geekWoman.svg"
);

function stripScoreUnit(value) {
  return String(value).replace(/\s*分\s*$/, "").trim();
}
function roundScore(value) {
  const n = Number(stripScoreUnit(value));
  return Number.isFinite(n) ? Math.round(n) : value;
}
function formatScore(value) {
  if (!hasValue(value)) return "-";
  if (Number(stripScoreUnit(value)) < 0) return "-";
  return String(roundScore(value));
}
function formatNumber(value) {
  return hasValue(value) ? String(roundScore(value)) : "-";
}
function formatSigned(value, sign) {
  if (!hasValue(value)) return "-";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  const rounded = Math.round(n);
  if (rounded === 0) return `${sign}0`;
  if (sign === "-") return `-${Math.abs(rounded)}`;
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

const totalScoreText = computed(() =>
  formatScore(
    evaluationStatus.value.scoreDisplay ??
      evaluationStatus.value.finalScore ??
      scoreSummary.value.finalScore ??
      props.resumeData?.score
  )
);
const baseScoreText = computed(() => formatNumber(scoreSummary.value.baseScore));
const bonusScoreText = computed(() => formatSigned(scoreSummary.value.bonusScore, "+"));
const deductionScoreText = computed(() => formatSigned(scoreSummary.value.deductionScore, "-"));
const pendingCountText = computed(() =>
  hasValue(scoreSummary.value.pendingCount) ? String(scoreSummary.value.pendingCount) : "0"
);

const sexText = computed(() => {
  const sex = candidateProfile.value.sex;
  return hasValue(sex) ? String(sex) : "";
});
const portraitAgeOption = computed(() => {
  const age = candidateProfile.value.age;
  if (!hasValue(age)) return "";
  const text = String(age).trim();
  return /岁$/.test(text) ? text : `${text}岁`;
});
const workYearsText = computed(() => {
  const value = candidateProfile.value.workYears;
  if (!hasValue(value)) return "";
  const text = String(value).trim();
  return /^\d+(?:\.\d+)?$/.test(text) ? `${text}年` : text;
});
const basicInfoText = computed(() =>
  [
    sexText.value,
    portraitAgeOption.value,
    candidateProfile.value.highestEducation,
    workYearsText.value
  ]
    .filter(hasValue)
    .join(" · ")
);
const mobileNo = computed(() => asText(candidateProfile.value.mobileNo, ""));
const email = computed(() => asText(candidateProfile.value.email, ""));
function formatPhone(phone) {
  const raw = String(phone || "").replace(/^\+?86\s*/, "").replace(/\s+/g, "");
  return raw.replace(/(\d{3})(\d{4})(\d{4})/, "$1 $2 $3");
}

const candidateTags = computed(() =>
  Array.isArray(candidateProfile.value.tags)
    ? candidateProfile.value.tags
        .map((tag) => (typeof tag === "string" ? tag : tag?.tagName || tag?.name))
        .filter(hasValue)
    : []
);

const workExperiences = computed(() => {
  const list = candidateProfile.value.workExperiences;
  if (Array.isArray(list) && list.length) {
    return list
      .map((item) =>
        [item.companyName, item.jobTitle, item.jobDuration].filter(hasValue).join(" · ")
      )
      .filter(Boolean);
  }
  const work = props.resumeData?.workExp;
  if (work && typeof work === "object") {
    const range =
      work.workStartTime && work.workEndTime
        ? `${work.workStartTime} - ${work.workEndTime}`
        : work.workStartTime || work.workEndTime || "";
    const text = [work.companyName, work.role, range].filter(hasValue).join(" · ");
    return text ? [text] : [];
  }
  return [];
});

const educationExperiences = computed(() => {
  const list = candidateProfile.value.schools;
  if (Array.isArray(list) && list.length) {
    return list
      .map((item) => [item.schoolName, item.major, item.diplomaType].filter(hasValue).join(" · "))
      .filter(Boolean);
  }
  const edu = props.resumeData?.eduExp;
  if (edu && typeof edu === "object") {
    const text = [edu.schoolName, edu.major, edu.degree].filter(hasValue).join(" · ");
    return text ? [text] : [];
  }
  return [];
});

const highlights = computed(() =>
  Array.isArray(aiConclusion.value.candidateHighlights)
    ? aiConclusion.value.candidateHighlights
        .map((item) => (typeof item === "string" ? item : item?.text || item?.content))
        .filter(hasValue)
    : []
);
const advice = computed(() =>
  Array.isArray(aiConclusion.value.interviewVerificationSuggestions)
    ? aiConclusion.value.interviewVerificationSuggestions
        .map((item) =>
          typeof item === "string" ? item : item?.suggestion || item?.dimension || ""
        )
        .filter(hasValue)
    : []
);

const versionText = computed(() =>
  asText(versionInfo.value.profileVersionId ?? versionInfo.value.snapshotId, "-")
);
const evaluationBasisText = computed(() =>
  asText(reportData.value.evaluationBasis, "职位画像 + 候选人最新简历")
);
const evaluatedAtText = computed(() => {
  const value = versionInfo.value.evaluatedAt;
  if (!hasValue(value)) return "-";
  return String(value).replace("T", " ").replace(/\.\d+Z?$/, "");
});
const conclusionText = computed(() =>
  asText(
    typeof reportData.value.aiConclusion === "string"
      ? reportData.value.aiConclusion
      : reportData.value.conclusion || aiConclusion.value.conclusion,
    "-"
  )
);

const SCORE_COLUMN_TITLE_MAP = {
  WEIGHTED: "得分/总分",
  BONUS: "加分/加分上限",
  DEDUCTION: "减分/减分上限"
};

const RULE_META = {
  HARD_REQUIREMENT: {
    title: "硬性要求",
    bar: "hard",
    tip: "候选人进入初筛后自动评分"
  },
  VETO: {
    title: "一票否决",
    bar: "veto",
    tip: "不得命中；明确命中时最终 AI 评估分归零"
  },
  WEIGHTED: {
    title: "权重评分",
    bar: "weight",
    tip: "参与 90 分基础分计算，按匹配档位获得分值"
  },
  BONUS: {
    title: "加分项",
    bar: "bonus",
    tip: "命中后额外加分，设有上限"
  },
  DEDUCTION: {
    title: "减分项",
    bar: "deduction",
    tip: "命中后额外减分，设有上限"
  },
  DISPLAY: {
    title: "仅展示",
    bar: "display",
    tip: "不参与评分，仅作为画像补充信息展示"
  }
};

const RESULT_CLASS_MAP = {
  FULL_MATCH: "passed",
  BASIC_MATCH: "passed",
  MATCHED: "passed",
  MATCH: "passed",
  PASSED: "passed",
  PARTIAL_MATCH: "partial",
  WEAK_MATCH: "partial",
  PENDING_VERIFY: "partial",
  UNKNOWN: "partial",
  NO_MATCH: "failed",
  NOT_MATCH: "failed",
  NOT_MATCHED: "failed",
  FAILED: "failed",
  VETO_HIT: "failed",
  MISSING: "failed",
  RESUME_INFO_MISSING: "failed",
  NOT_TRIGGERED: "notTriggered"
};

const RESULT_TEXT_MAP = {
  FULL_MATCH: "满足",
  BASIC_MATCH: "满足",
  MATCHED: "匹配",
  MATCH: "匹配",
  PASSED: "满足",
  PARTIAL_MATCH: "部分匹配",
  WEAK_MATCH: "部分匹配",
  PENDING_VERIFY: "待核验",
  UNKNOWN: "待核验",
  NO_MATCH: "未匹配",
  NOT_MATCH: "未匹配",
  NOT_MATCHED: "未匹配",
  FAILED: "未命中",
  VETO_HIT: "一票否决",
  MISSING: "简历信息缺失",
  RESUME_INFO_MISSING: "简历信息缺失",
  NOT_TRIGGERED: "未触发"
};

function normalizeRuleType(value) {
  const type = String(value || "").toUpperCase();
  if (type === "DISPLAY_ONLY" || type === "TAG") return "DISPLAY";
  if (type === "WEIGHT_SCORE") return "WEIGHTED";
  return type;
}

function applyScorePairSign(value, sign) {
  const text = String(value).trim();
  if (!sign) return text;
  return text
    .split("/")
    .map((part) => {
      const score = part.trim();
      return score && score !== "-" ? `${sign}${score.replace(/^[+-]/, "")}` : score;
    })
    .join("/");
}

function formatItemScore(item, ruleType) {
  const sign = ruleType === "BONUS" ? "+" : ruleType === "DEDUCTION" ? "-" : "";
  if (hasValue(item?.scoreDisplay)) {
    return applyScorePairSign(item.scoreDisplay, sign);
  }
  const actual = item?.actualScore ?? item?.weightedScore ?? item?.rawScore;
  const max = item?.maxScore ?? item?.weight;
  if (!hasValue(actual) && !hasValue(max)) return "-";
  const scorePair = `${hasValue(actual) ? roundScore(actual) : "-"}/${hasValue(max) ? roundScore(max) : "-"}`;
  return applyScorePairSign(scorePair, sign);
}

function normalizeReportItem(item, ruleType) {
  const code = String(item?.matchResult || item?.matchStatus || "").toUpperCase();
  let evidenceList = [];
  if (Array.isArray(item?.evidence)) {
    evidenceList = item.evidence
      .map((entry) => (typeof entry === "string" ? entry : entry?.content))
      .filter(hasValue);
  } else if (item?.evidence && typeof item.evidence === "object") {
    evidenceList = [item.evidence.content].filter(hasValue);
  } else if (hasValue(item?.evidence)) {
    evidenceList = [String(item.evidence)];
  }
  const rawResultText = asText(
    item?.matchResultText || item?.matchStatusText || item?.resultText || RESULT_TEXT_MAP[code],
    "-"
  );
  let result = RESULT_CLASS_MAP[code] || "partial";
  if (!RESULT_CLASS_MAP[code]) {
    if (/未|不匹配|否决|失败|缺失/.test(rawResultText)) result = "failed";
    else if (/满足|匹配|通过/.test(rawResultText)) result = "passed";
  }
  return {
    dimension: asText(item?.dimension, "-"),
    standard: asText(item?.standard, "-"),
    scoreText: formatItemScore(item, ruleType),
    result,
    resultText: rawResultText,
    evidence: evidenceList.length
      ? evidenceList.join("；")
      : asText(item?.aiExplanation || item?.calculationBasis, "-"),
    sensitive: item?.sensitive === true
  };
}

const rawGroups = computed(() => {
  const groups =
    reportData.value.groups ||
    reportData.value.ruleGroups ||
    reportData.value.evaluationGroups;
  if (Array.isArray(groups)) return groups;
  if (groups && typeof groups === "object") {
    return Object.entries(groups).map(([ruleType, items]) => ({
      ruleType,
      items: Array.isArray(items) ? items : []
    }));
  }
  return [];
});

const groups = computed(() =>
  rawGroups.value
    .map((group, index) => {
      const ruleType = normalizeRuleType(group?.ruleType);
      const meta = RULE_META[ruleType] || {};
      const items = Array.isArray(group?.items)
        ? group.items.map((item) => normalizeReportItem(item, ruleType))
        : [];
      return {
        id: `${ruleType || "group"}-${index}`,
        ruleType,
        title: group?.ruleTypeName || meta.title || ruleType || "评估维度",
        bar: meta.bar || "weight",
        tip: meta.tip || "",
        hasScore: ["WEIGHTED", "BONUS", "DEDUCTION"].includes(ruleType),
        scoreColumnTitle: SCORE_COLUMN_TITLE_MAP[ruleType] || "",
        items
      };
    })
    .filter((group) => group.items.length > 0)
);

function unwrapEvaluationReport(response) {
  let data = response?.data ?? response;
  if (data?.report) data = data.report;
  if (data?.evaluationReport) data = data.evaluationReport;
  if (data?.data && !data.header && !data.groups) data = data.data;
  return data && typeof data === "object" ? data : null;
}

async function loadReport() {
  const taskResumeId = reportTaskResumeId.value;
  if (!taskResumeId) {
    report.value = null;
    loading.value = false;
    loadError.value = "未获取到 taskResumeId，无法查询 AI 匹配详情";
    return;
  }

  const seq = ++requestSeq;
  loading.value = true;
  loadError.value = "";
  try {
    const response = await queryEvaluationReport({ taskResumeId });
    if (seq !== requestSeq) return;
    const data = unwrapEvaluationReport(response);
    if (!data) throw new Error("接口未返回评估报告数据");
    report.value = data;
    console.log("[AIEvaluationReport] queryEvaluationReport <<< ok", {
      taskResumeId,
      groups: Array.isArray(data.groups) ? data.groups.length : 0
    });
  } catch (error) {
    if (seq !== requestSeq) return;
    report.value = null;
    loadError.value = error?.message || "AI 匹配详情加载失败";
    console.warn("[AIEvaluationReport] queryEvaluationReport failed", {
      taskResumeId,
      error: error?.message || error
    });
  } finally {
    if (seq === requestSeq) loading.value = false;
  }
}

watch(
  () => [props.modelValue, reportTaskResumeId.value],
  ([isOpen]) => {
    if (!isOpen) {
      requestSeq += 1;
      hideTextPopover();
      return;
    }
    loadReport();
  },
  { immediate: true }
);
</script>

<style scoped lang="scss">
.aer-card {
  display: flex;
  width: 92vw;
  max-width: 1280px;
  height: 92vh;
  max-height: 92vh;
  padding: 0;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.18);
}
.aer-page {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  color: #434343;
  background: #f5f6f7;
}

/* Header */
.aer-header {
  display: flex;
  flex: 0 0 72px;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
  height: 72px;
  padding: 0 24px;
  background: #fff;
  border-bottom: 1px solid #eff0f2;
}
.aer-header-title h1 {
  margin: 0;
  color: #262626;
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
}
.aer-header-title p {
  margin: 2px 0 0;
  color: #8e929b;
  font-size: 12px;
  line-height: 18px;
}
.aer-header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.aer-close-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  color: #8e929b;
  border: 0;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
}
.aer-close-btn:hover {
  color: #434343;
  background: #f5f6f7;
}

/* Layout */
.aer-main,
.aer-sidebar,
.aer-table-scroll {
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}
.aer-main::-webkit-scrollbar,
.aer-sidebar::-webkit-scrollbar,
.aer-table-scroll::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.aer-main::-webkit-scrollbar-track,
.aer-sidebar::-webkit-scrollbar-track,
.aer-table-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.aer-main::-webkit-scrollbar-thumb,
.aer-sidebar::-webkit-scrollbar-thumb,
.aer-table-scroll::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 999px;
  background: transparent;
  background-clip: padding-box;
}
.aer-main.is-scrolling,
.aer-sidebar.is-scrolling,
.aer-table-scroll.is-scrolling {
  scrollbar-color: rgba(108, 117, 132, 0.42) transparent;
}
.aer-main.is-scrolling::-webkit-scrollbar-thumb,
.aer-sidebar.is-scrolling::-webkit-scrollbar-thumb,
.aer-table-scroll.is-scrolling::-webkit-scrollbar-thumb {
  background: rgba(108, 117, 132, 0.42);
  background-clip: padding-box;
}

.aer-main {
  display: grid;
  align-items: start;
  flex: 1 1 auto;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 16px;
  min-height: 0;
  padding: 16px 24px 24px;
  overflow: auto;
}
.aer-sidebar {
  /* 与 recruit 项目报告一致：左侧信息随右侧表格滚动时吸顶；
     左侧内容比弹窗可视区更高时，自身可滚动，避免吸顶后底部留白。
     max-height 需再减去 .aer-main 的上下内边距(16+24)，否则吸顶到底时会被裁掉 */
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  max-height: calc(92vh - 112px);
  overflow-y: auto;
}
.aer-candidate-card,
.aer-insight-card,
.aer-meta-card,
.aer-report-card {
  box-sizing: border-box;
  border-radius: 16px;
  background: #fff;
  box-shadow: 1px 2px 8px 0 rgba(0, 0, 0, 0.05);
}
.aer-candidate-card {
  padding: 20px 24px 24px;
  background:
    radial-gradient(55% 55% at 58% 1%, rgba(248, 173, 255, 0.3) 0%, rgba(249, 216, 255, 0) 100%),
    radial-gradient(50% 50% at 85% -10%, rgba(135, 205, 255, 0.8) 0%, rgba(161, 204, 250, 0) 100%),
    #fff;
}
.aer-candidate-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}
.aer-avatar {
  flex: 0 0 auto;
}
.aer-total-score {
  display: flex;
  align-items: flex-end;
  flex-direction: column;
  gap: 8px;
  padding-top: 7px;
  color: #434343;
  font-size: 14px;
  line-height: 18px;
}
.aer-total-score strong {
  color: #3d3d3d;
  font-size: 36px;
  font-weight: 500;
  line-height: 38px;
}
.aer-total-score small {
  margin-left: 3px;
  font-size: 12px;
  font-weight: 400;
}
.aer-candidate-card h1 {
  margin: 15px 0 8px;
  color: #262626;
  font-size: 20px;
  font-weight: 600;
  line-height: 28px;
}
.aer-stage-tags {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.aer-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px;
  font-size: 12px;
  line-height: 20px;
  border-radius: 4px;
  background: #f5f6f7;
  color: #1f2329;
}
.aer-tag--position {
  color: #1677ff;
  border: 1px solid #1677ff;
  background: #fff;
}
.aer-tag--channel {
  color: #1f2329;
  border: 1px solid #e5e6e8;
  background: #fff;
}
.aer-tag--cyan {
  color: #13c2c2;
  background: #e6fffb;
}
.aer-score-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  column-gap: 6px;
  margin-top: 18px;
  padding-bottom: 16px;
  border-bottom: 1px dashed #e5e6e8;
}
.aer-score-metrics > div {
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.aer-score-metrics span {
  color: #8e929b;
  font-size: 14px;
  line-height: 18px;
  white-space: nowrap;
}
.aer-score-metrics strong {
  color: #3d3d3d;
  font-size: 16px;
  font-weight: 600;
  line-height: 20px;
}
.aer-score-metrics small {
  font-size: 12px;
  font-weight: 400;
}
.aer-candidate-contact,
.aer-candidate-history {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
}
.aer-candidate-contact > div,
.aer-candidate-history > div {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
  color: #434343;
  font-size: 13px;
  line-height: 20px;
}
.aer-candidate-contact svg,
.aer-candidate-history svg {
  flex: 0 0 auto;
  margin-top: 3px;
  color: #8e929b;
}
.aer-candidate-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 16px;
}
.aer-chip {
  padding: 2px 10px;
  color: #616670;
  font-size: 12px;
  line-height: 20px;
  border-radius: 4px;
  background: #f5f6f7;
}
.aer-insight-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 28px 24px 32px;
}
.aer-insight {
  padding: 16px 24px;
  border-radius: 16px;
}
.aer-insight--highlight {
  background: linear-gradient(180deg, #eff6ff -87%, rgba(239, 246, 255, 0) 100%);
}
.aer-insight--advice {
  background: linear-gradient(180deg, #fffbef -87%, rgba(255, 249, 239, 0) 100%);
}
.aer-insight strong {
  color: #262626;
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
}
.aer-insight ul {
  margin: 4px 0 0;
  padding: 0;
  color: #616670;
  font-size: 14px;
  line-height: 24px;
  list-style: none;
}
.aer-insight li {
  position: relative;
  padding-left: 10px;
}
.aer-insight li::before {
  position: absolute;
  top: 10px;
  left: 0;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #616670;
  content: "";
}
.aer-meta-card {
  padding: 28px 24px 32px;
}
.aer-meta-panel {
  padding: 16px 24px;
  border-radius: 16px;
  background: linear-gradient(180deg, #f4f4f4 -87%, rgba(243, 243, 243, 0) 100%);
}
.aer-meta-panel dl {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin: 0;
  padding: 0;
}
.aer-meta-panel dl > div {
  display: grid;
  grid-template-columns: 66px minmax(0, 1fr);
  gap: 14px;
  font-size: 14px;
  line-height: 20px;
}
.aer-meta-panel dt {
  color: #8e929b;
}
.aer-meta-panel dd {
  margin: 0;
  color: #3d3d3d;
}
.aer-meta-panel p {
  margin: 16px 0 0;
  padding-top: 16px;
  border-top: 1px dashed #e5e6e8;
  color: #8e929b;
  font-size: 14px;
  line-height: 20px;
}

/* Report */
.aer-report-card {
  min-width: 0;
  padding: 20px;
}
.aer-conclusion {
  padding: 16px 24px;
  border-radius: 16px;
  background: linear-gradient(95deg, #fdf7fe 19%, rgba(225, 235, 254, 0) 97%);
}
.aer-conclusion-title {
  display: flex;
  align-items: center;
  gap: 6px;
}
.aer-conclusion-title strong {
  color: #262626;
  font-size: 14px;
  font-weight: 600;
  line-height: 22px;
}
.aer-conclusion p {
  margin: 5px 0 0;
  color: #434343;
  font-size: 14px;
  line-height: 20px;
}
.aer-groups {
  display: flex;
  flex-direction: column;
  gap: 24px;
  margin-top: 22px;
}
.aer-group-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.aer-group-bar {
  width: 4px;
  height: 16px;
  border-radius: 2px;
  background: #6d5bf6;
}
.aer-group-bar--hard {
  background: #1677ff;
}
.aer-group-bar--veto {
  background: #ff4d4f;
}
.aer-group-bar--bonus {
  background: #20b26b;
}
.aer-group-bar--deduction {
  background: #ff8b33;
}
.aer-group-bar--display {
  background: #8e929b;
}
.aer-group-title strong {
  color: #262626;
  font-size: 14px;
  font-weight: 600;
}
.aer-group-tip {
  color: #8e929b;
  font-size: 12px;
}
.aer-table-scroll {
  overflow-x: auto;
}
.aer-table {
  width: 100%;
  min-width: 900px;
  border-collapse: collapse;
  font-size: 13px;
}
.aer-table th {
  padding: 10px 12px;
  color: #927fff;
  font-weight: 500;
  text-align: left;
  white-space: nowrap;
  background: #fff;
  border-bottom: 1px solid #eff0f2;
}
.aer-table td {
  padding: 14px 12px;
  color: #434343;
  line-height: 20px;
  vertical-align: middle;
  word-break: break-word;
  border-bottom: 1px solid #eff0f2;
}
.aer-clamp-text {
  display: -webkit-box;
  overflow: hidden;
  max-width: 100%;
  white-space: normal;
  overflow-wrap: anywhere;
  text-overflow: ellipsis;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-clamp: 3;
}
.aer-table tbody tr:hover {
  background: #fafbfc;
}
.aer-col-dimension {
  width: 150px;
}
.aer-col-standard {
  width: 300px;
}
.aer-col-score {
  width: 110px;
}
.aer-col-result {
  width: 120px;
}
.aer-col-evidence {
  width: 260px;
}
.aer-muted {
  color: #8e929b;
}
.aer-tag-score {
  display: inline-flex;
  padding: 1px 8px;
  color: #616670;
  font-size: 12px;
  line-height: 20px;
  border-radius: 4px;
  background: #f5f6f7;
}
.aer-tag-score--bonus {
  color: #20b26b;
  background: #e8f8ef;
}
.aer-tag-score--deduction {
  color: #ff8b33;
  background: #fff2e8;
}
.aer-result-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 8px;
  color: #20b26b;
  font-size: 12px;
  line-height: 20px;
  border-radius: 4px;
  background: #e8f8ef;
}
.aer-result-tag--failed {
  color: #ff4d4f;
  background: #fff0f0;
}
.aer-result-tag--partial {
  color: #d89614;
  background: #fff7d6;
}
.aer-result-tag--notTriggered {
  color: #8e929b;
  background: #f5f6f7;
}
.aer-sensitive-tag {
  flex: 0 0 auto;
  display: inline-flex;
  padding: 1px 8px;
  color: #ff8b33;
  font-size: 12px;
  line-height: 20px;
  border-radius: 4px;
  background: #fff2e8;
}
.aer-evidence {
  color: #616670;
}
.aer-evidence-content {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.aer-evidence-content .aer-clamp-text {
  flex: 1 1 auto;
  min-width: 0;
}
.aer-overflow-popover {
  box-sizing: border-box;
  max-width: min(420px, calc(100vw - 32px));
  padding: 10px 12px;
  color: #434343;
  font-size: 13px;
  line-height: 20px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  border: 1px solid #ebeaf4;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 6px 24px rgba(35, 31, 74, 0.16);
}

.aer-loading,
.aer-empty {
  display: flex;
  grid-column: 1 / -1;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 12px;
  min-height: 420px;
  color: #616670;
  font-size: 14px;
}
.aer-empty__title {
  color: #262626;
  font-size: 16px;
  font-weight: 600;
}
.aer-empty__desc {
  max-width: 520px;
  color: #8e929b;
  text-align: center;
  line-height: 20px;
  word-break: break-word;
}
.aer-retry-btn {
  padding: 8px 16px;
  color: #1677ff;
  font-size: 13px;
  border: 1px solid #91caff;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
}
.aer-retry-btn:hover {
  background: #f0f7ff;
}
.aer-groups-empty {
  padding: 40px 0;
  color: #8e929b;
  font-size: 14px;
  text-align: center;
}
@media print {
  .aer-header-actions {
    display: none;
  }
  .aer-page {
    height: auto;
    overflow: visible;
  }
  .aer-main {
    overflow: visible;
  }
}
</style>
