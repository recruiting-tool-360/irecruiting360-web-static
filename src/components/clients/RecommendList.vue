<template>
  <div class="recommend-list">
    <!-- loading 状态：抓取中 + 还没数据 -->
    <div v-if="loading && (!bucket || bucket.geekList.length === 0)" class="rl-state rl-state-loading">
      <div class="rl-spinner" />
      <p class="rl-state-title">正在抓取 BOSS 推荐牛人...</p>
      <p class="rl-state-sub">已为你打开 BOSS 推荐页面（用户可见），同源 fetch 拉取列表</p>
    </div>

    <!-- 错误态：未拿到 token / 接口失败 / 登录过期 -->
    <div v-else-if="errorVisible" class="rl-state rl-state-error">
      <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round" class="rl-error-icon">
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
        <line x1="12" x2="12" y1="9" y2="13" /><line x1="12" x2="12.01" y1="17" y2="17" />
      </svg>
      <p class="rl-state-title">推荐牛人拉取失败</p>
      <p class="rl-state-sub">{{ errorMessage }}</p>
      <div class="rl-state-actions">
        <button class="rl-btn-primary" type="button" :disabled="loading" @click="$emit('retry')">
          {{ loading ? '重试中...' : '重试' }}
        </button>
      </div>
    </div>

    <!-- 空态：没有 jobId / 没拉过 -->
    <div v-else-if="!bucket || bucket.geekList.length === 0" class="rl-state rl-state-empty">
      <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round" class="rl-empty-icon">
        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
      </svg>
      <p class="rl-state-title">{{ jobId ? '暂无推荐牛人' : '请先选择一个 BOSS 职位' }}</p>
      <p class="rl-state-sub" v-if="jobId">在 ChatPanel 勾选「推荐牛人」并启动聚合搜索后会自动拉取</p>
    </div>

    <!-- 列表 -->
    <template v-else>
      <div class="rl-toolbar">
        <!--
          ⚠️ 这里显示的是"已抓到的实际人数"，必须用 bucket.geekList.length。
          bucket.totalSize 是 BOSS 首屏响应里的 totalSize 字段（BOSS 给的"理论"总数，
          通常是首屏的 15），如果用 totalSize 会出现「已抓 60 条但 header 只显示 15」的 bug。
          —— 实际累计抓取数量 = geekList 数组长度。
        -->
        <span class="rl-count">
          共 <strong>{{ bucket.geekList.length }}</strong> 人
        </span>
        <span class="rl-meta" v-if="bucket.fetchedAt">
          抓取于 {{ formatTime(bucket.fetchedAt) }}
        </span>
        <span class="rl-spacer" />
      </div>

      <!--
        视觉 1:1 复用搜索 tab 的 ResumeCard 组件：
          - BOSS 推荐 API 返回的 geek 数据通过 mapBossGeekToResume() 适配成 ResumeCard 期望的 resume shape
          - BOSS 推荐没有的字段（简要描述 / 工作经历 / 教育经历 / AI 评分 / 性别 / 年龄 ...）留空，
            ResumeCard 内部已有空态处理（暂无工作经历 / AI 分析中 / 无 badge 等）
          - 推荐数据直接复用搜索结果卡片的业务操作，立即沟通走
            「查询详情 → 收藏 → 互动消息页」流程。
      -->
      <div class="rl-resume-list">
        <ResumeCard
          v-for="(geek, idx) in bucket.geekList"
          :key="geek.encryptGeekId || geek.geekId || geek.resumeBlindId || idx"
          :resume="mapBossGeekToResume(geek)"
          :is-read="false"
          tab-str="推荐牛人"
          :search-condition-id-override="geek.searchConditionId || null"
          @detail="() => onCardClick(geek)"
        />
      </div>
    </template>
  </div>
</template>

<script setup>
/**
 * RecommendList.vue
 *
 * BOSS 推荐牛人列表展示组件（embedded 模式 results 视图的 "推荐牛人" tab）。
 *
 * Props:
 *   - jobId      : 当前选中的 BOSS encryptJobId
 *   - bucket     : { jobId, geekList, totalSize, hasMore, fetchedAt, fetching, error }
 *                  通常通过 props 传 store.getters.getBossRecommendByJobId(jobId)
 *   - loading    : 外部 fetching 状态（兼容父组件传 bucket.fetching 或自己维护的状态）
 *
 * Emits:
 *   - refresh    : 用户点工具栏"刷新"按钮
 *   - retry      : 错误态下点"重试"
 *   - open-geek  : 用户点某个候选人卡片，payload 是 geek 原始对象
 */
import { computed } from 'vue';
import ResumeCard from 'src/components/resume/ResumeCard.vue';

/**
 * BOSS 推荐 API（`/wapi/zpjob/rec/geek/list`）真实返回结构：
 *   {
 *     encryptGeekId, blur, isFriend, ...,           ← 顶层只放元数据
 *     geekCard: {                                    ← ★★ 所有展示字段都嵌在这里
 *       geekName, geekGender(0/1), ageDesc, geekDegree, geekWorkYear,
 *       expectPositionName, expectLocationName, salary,
 *       geekDesc: { content },
 *       geekEdu: { school, major, degreeName, startDate, endDate },
 *       geekEdus: [...], geekWorks: [...],
 *       matches: ["专业前10%"]
 *     }
 *   }
 * 详细样本见 docs/boss地址资料.md L588-714。
 *
 * 之前 adapter 错误地从 g.geekName / g.workYears 顶层取——全是 undefined，
 * 卡片整片显示"匿名候选人"+"暂无...". 改成 g.geekCard.* 取真实字段。
 */
function mapBossGeekToResume(geek) {
  const g = geek || {};
  // ★ 兼容两种数据源：
  //   (a) BOSS 推荐 API 原生 geek 结构（含 geek.geekCard.geekName/geekGender/...）
  //       → 走下面整段 mapping
  //   (b) 后端任务结果接口返回的标准化 resume（含 r.name / r.id / r.gender，无 geekCard）
  //       → 已经是 ResumeCard 期望的形态，直接返回。
  //   handleViewResults 把 RECOMMEND 数据灌进 BossRecommendData.geekList 时就是 (b)，
  //   不需要额外转一次。
  if (!g.geekCard && (g.name || g.resumeBlindId)) {
    return g;
  }
  const c = g.geekCard || {};
  // BOSS geekGender：1=男 0=女（跟 ResumeCard 期望一致，直接透传）
  let gender = null;
  if (typeof c.geekGender === 'number') gender = c.geekGender;
  // 兼容个别 geek 顶层也有性别字段的老数据
  else if (typeof g.gender === 'number') gender = g.gender;
  // 经验年限：BOSS 给的是文本 "5年" / "应届生" / "26年应届生"，提取数字
  let experienceYear = null;
  if (typeof c.geekWorkYear === 'string') {
    if (/应届/.test(c.geekWorkYear)) experienceYear = -1;
    else {
      const m = c.geekWorkYear.match(/^(\d+)\s*年/);
      if (m) experienceYear = parseInt(m[1], 10);
    }
  }
  // 简要描述：BOSS 推荐有 geekDesc.content / middleContent.content 两个文本字段，
  // 优先 desc（自我介绍），fallback middleContent（自动生成的"毕业于 XX·XX"）
  const description =
    (c.geekDesc && c.geekDesc.content) ||
    (c.middleContent && c.middleContent.content) ||
    '';
  // 工作经历：取第一段（ResumeCard 只显示一段）
  const firstWork =
    Array.isArray(c.geekWorks) && c.geekWorks.length > 0
      ? c.geekWorks[0]
      : null;
  const workExp = firstWork
    ? {
        companyName: firstWork.company || firstWork.companyName || '',
        role: firstWork.positionName || firstWork.position || firstWork.role || '',
        workStartTime: firstWork.startDate || firstWork.start || '',
        workEndTime: firstWork.endDate || firstWork.end || ''
      }
    : null;
  // 教育经历：取最高学历 / 第一段
  const firstEdu =
    c.geekEdu ||
    (Array.isArray(c.geekEdus) && c.geekEdus.length > 0 ? c.geekEdus[0] : null);
  const eduExp = firstEdu
    ? {
        schoolName: firstEdu.school || firstEdu.schoolName || '',
        major: firstEdu.major || '',
        degree: firstEdu.degreeName || ''
      }
    : null;
  // BOSS "期望/薪资" 拼成 ResumeCard.intention 的文本
  const intentionParts = [];
  if (c.expectPositionName) intentionParts.push(c.expectPositionName);
  if (c.expectLocationName) intentionParts.push(c.expectLocationName);
  if (c.salary) intentionParts.push(c.salary);
  const intention = intentionParts.join(' · ');

  return {
    // id 优先用 resumeBlindId（patchBossRecommendGeek 在 /results 之后回填进来）：
    //   - AIResumeEvaluation 弹框查分用 resumeBlindIds=[resume.id] 调 getScoreListDetailedPlus，
    //     如果给 encryptGeekId 后端找不到 → 弹"未找到该简历的评估数据"
    //   - "分配职位 / 加入人才库" 等业务仍按 resumeBlindId 走；推荐结果落库后会回填该字段。
    //   - 没有 resumeBlindId 时降级到 encryptGeekId（/results 落库前的瞬时态）
    id: g.resumeBlindId || g.encryptGeekId || c.encGeekId || c.geekId || `geek_${Math.random().toString(36).slice(2)}`,
    name: c.geekName || g.geekName || '匿名候选人',
    gender,
    ageDesc: c.ageDesc || '',
    experienceYear,
    degree: c.geekDegree || (firstEdu && firstEdu.degreeName) || '',
    status: '', // BOSS 推荐 API 不返回入职状态
    intention,
    channel: 'boss直聘',
    description,
    // score 来自 patchBossRecommendGeek 回填（scoreAutoUpdater 回调写入）。
    // 没回填前 null → ResumeCard 显示 "AI 分析中"；回填后显示具体分数 / "评分失败"
    score: typeof g.score === 'number' ? g.score : (g.score ?? null),
    scoreStatus: g.scoreStatus || null,
    workExp,
    eduExp,
    isRead: false,
    inCollection: false,
    resumeThirdPartyInfo: null,
    // ⚠️ originalResumeUrlInfo 必须是合法 JSON 字符串，且 .request.securityId 可读，
    // 否则下游 bossUrl()（src/pluginSrc/util/ChannelUrlUtil.js）会 JSON.parse 后访问
    // .request.securityId 报 TypeError → handleResume 异常退出 → importResume / 加入人才库
    // / 分配职位 / 立即沟通 整条流程都 break。
    //
    // BOSS 推荐 API 的 securityId/lid 在 geekCard 中，
    // expectPositionName 对应搜索流程里的 lidTag。
    // 拼成跟搜索通道相同的 originalResumeUrlInfo，供「立即沟通」复用：
    // {"request":{"securityId":"...","lidTag":"...","lid":"..."}}
    originalResumeUrlInfo: c.securityId
      ? JSON.stringify({
          request: {
            securityId: c.securityId,
            lidTag: c.expectPositionName || '',
            lid: c.lid || ''
          }
        })
      : 'null',
    // 保留原始 BOSS geek，候选人详情抽屉等动作需要时能拿到完整原始数据。
    _raw: g
  };
}

const props = defineProps({
  jobId: { type: String, default: null },
  bucket: { type: Object, default: null },
  loading: { type: Boolean, default: false }
});

const emit = defineEmits(['refresh', 'retry', 'open-geek']);
void emit;

const errorVisible = computed(() => {
  if (!props.bucket?.error) return false;
  // 有数据时不展示满屏错误，让用户能继续看；只在没数据时展示错误态
  return props.bucket.geekList.length === 0;
});

const errorMessage = computed(() => {
  const e = props.bucket?.error;
  if (!e) return '';
  if (e.code === 'LOGIN_EXPIRED' || /登录|未登录|login/i.test(e.message)) {
    return '请先在 BOSS tab 完成登录后重试';
  }
  if (e.code === 'TIMEOUT') return '抓取超时，可能网络较慢或页面没加载完成';
  if (e.code === 'NOT_ON_BOSS_DOMAIN') return 'BOSS tab 未指向 zhipin.com';
  if (e.code === 'NOT_IN_CLIENT') return '该功能仅在 i 快招客户端可用';
  return e.message || e.code || '未知错误';
});

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatTime(ts) {
  try {
    const d = new Date(ts);
    return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  } catch (_e) {
    return '';
  }
}

function onCardClick(geek) {
  emit('open-geek', geek);
}
</script>

<style scoped lang="scss">
$primary-50: #f0fdfa;
$primary-100: #ccfbf1;
$primary-500: #14b8a6;
$primary-600: #0d9488;
$neutral-50: #fafafa;
$neutral-100: #f5f5f5;
$neutral-200: #e5e5e5;
$neutral-300: #d4d4d4;
$neutral-400: #a3a3a3;
$neutral-500: #737373;
$neutral-600: #525252;
$neutral-700: #404040;
$neutral-800: #262626;
$neutral-900: #171717;

.recommend-list {
  height: 100%;
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', PingFang SC, Microsoft YaHei, sans-serif;
}

.rl-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
  gap: 12px;

  .rl-state-title {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
    color: $neutral-800;
  }
  .rl-state-sub {
    margin: 0;
    font-size: 12px;
    color: $neutral-500;
    line-height: 1.6;
    max-width: 320px;
  }
  .rl-state-actions {
    margin-top: 12px;
  }
}

.rl-state-loading .rl-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid $primary-100;
  border-top-color: $primary-500;
  border-radius: 50%;
  animation: rl-spin 0.9s linear infinite;
}

.rl-state-error .rl-error-icon {
  color: #f59e0b;
}

.rl-state-empty .rl-empty-icon {
  color: $neutral-300;
}

@keyframes rl-spin {
  to { transform: rotate(360deg); }
}

.rl-btn-primary {
  appearance: none;
  border: 0;
  border-radius: 10px;
  background: $primary-500;
  color: #fff;
  font-weight: 700;
  font-size: 13px;
  padding: 8px 20px;
  cursor: pointer;
  transition: background 0.15s, transform 0.1s;
  &:hover:not(:disabled) { background: $primary-600; }
  &:active:not(:disabled) { transform: scale(0.97); }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
}

.rl-btn-secondary {
  appearance: none;
  border: 1px solid $neutral-200;
  background: #fff;
  border-radius: 8px;
  color: $neutral-700;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
  &:hover:not(:disabled) {
    border-color: $primary-500;
    color: $primary-600;
    background: $primary-50;
  }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
}

.rl-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid $neutral-100;
  flex-shrink: 0;

  .rl-count strong {
    color: $primary-600;
    font-weight: 800;
  }
  .rl-meta {
    font-size: 11px;
    color: $neutral-400;
  }
  .rl-spacer { flex: 1; }
}

/**
 * 推荐 tab 复用搜索 tab 的 ResumeCard 组件，跟搜索结果一样的列表布局：
 *   - 单列垂直，每张卡片 100% 宽
 *   - 卡片间 8px 间距（跟搜索 tab 一致）
 *   - 列表外 padding 跟 toolbar 对齐
 */
.rl-resume-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
