<!--
  AI 职位画像深度解析 - 卡片

  与 AI 对话交互时，AI 生成的职位画像包含两种状态：
    1. 展示态（读模式）：基本信息（每项带权重类型标签）+ 三组标签 + 底部动作面板
    2. 编辑态（写模式）：每个字段可选权重类型（硬性要求/一票否决/权重评分/加分项/减分项/仅展示）
       + 字段值控件（下拉 / 数值区间）+ 三组标签（逗号分隔）。取消 / 保存修改。

  入参 profile 形态见 src/util/parseAISearchJD.js 返回值（缺失字段按"不限"展示）。
-->
<template>
  <div class="ai-profile-card">
    <!-- Header：标题 + 复制 / 编辑（展示态）；取消 / 保存修改（编辑态） -->
    <div class="profile-header">
      <div class="header-title">
        <svg
          class="header-icon"
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.582a.5.5 0 0 1 0 .962L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
          <path d="M20 3v4" />
          <path d="M22 5h-4" />
          <path d="M4 17v2" />
          <path d="M5 18H3" />
        </svg>
        <span class="header-text">AI 职位画像深度解析</span>
      </div>
      <div class="header-actions">
        <template v-if="isEditing">
          <button class="hdr-btn" type="button" @click="cancelEdit">
            <span>取消</span>
          </button>
          <button class="hdr-save" type="button" @click="saveEdit">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
              <path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" />
              <path d="M7 3v4a1 1 0 0 0 1 1h7" />
            </svg>
            <span>保存修改</span>
          </button>
        </template>
        <template v-else>
          <button class="hdr-btn" type="button" :disabled="!enabled" @click="handleCopy">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
              <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
            </svg>
            <span>复制</span>
          </button>
          <button class="hdr-btn" type="button" :disabled="!enabled" @click="startEdit">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            </svg>
            <span>编辑</span>
          </button>
        </template>
      </div>
    </div>

    <!-- ================= 编辑态 ================= -->
    <div v-if="isEditing && enabled" class="edit-grid">
      <div v-for="f in fieldDefs" :key="f.key" class="edit-field">
        <label class="edit-label">{{ f.label }}</label>
        <div class="edit-control-row">
          <div v-if="f.weight" class="select-wrap">
            <select v-model="editForm.weights[f.key]" class="native-select weight-select">
              <option v-for="w in weightOptions" :key="w.value" :value="w.value">{{ w.label }}</option>
            </select>
            <svg class="select-caret" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </div>

          <template v-if="f.type === 'select'">
            <div class="select-wrap" :class="{ 'select-wrap--flex': true }">
              <select v-model="editForm.values[f.key]" class="native-select">
                <option v-for="o in f.options" :key="o" :value="o">{{ o }}</option>
              </select>
              <svg class="select-caret" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </div>
          </template>

          <template v-else-if="f.type === 'text'">
            <input v-model="editForm.values[f.key]" class="native-input" :class="{ 'native-input--flex': f.weight }" type="text" />
          </template>

          <template v-else-if="f.type === 'age-range'">
            <!-- 滑动条区间；最左端点(0)为「不限」，右侧实时展示当前区间 -->
            <div class="edit-age">
              <q-range
                v-model="ageModel"
                :min="0"
                :max="65"
                :step="1"
                class="edit-age__slider"
                color="teal"
                track-size="2px"
                thumb-size="16px"
              />
              <span class="edit-age__value">{{ ageText }}</span>
            </div>
          </template>

          <template v-else-if="f.type === 'range'">
            <div class="edit-range">
              <input v-model="editForm.values[f.minKey]" class="edit-range-input" type="number" min="0" placeholder="不限" />
              <span class="edit-range-sep">–</span>
              <input v-model="editForm.values[f.maxKey]" class="edit-range-input" type="number" min="0" placeholder="不限" />
              <span v-if="f.unit" class="edit-range-unit">{{ f.unit }}</span>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- 编辑态：三组标签（逗号分隔） -->
    <template v-if="isEditing && enabled">
      <div class="edit-field">
        <label class="edit-label">专业技能（逗号分隔）</label>
        <textarea v-model="editForm.skills" class="edit-textarea" rows="2"></textarea>
      </div>
      <div class="edit-field">
        <label class="edit-label">软实力要求（逗号分隔）</label>
        <textarea v-model="editForm.softSkills" class="edit-textarea" rows="2"></textarea>
      </div>
      <div class="edit-field">
        <label class="edit-label">相关经历（逗号分隔）</label>
        <textarea v-model="editForm.relatedExperience" class="edit-textarea" rows="2"></textarea>
      </div>
    </template>

    <!-- ============ 未开启：锁定占位（不可查看 / 复制 / 编辑 / 发起聚合搜索） ============ -->
    <div v-if="!enabled" class="profile-locked">
      <div class="profile-locked__icon">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>
      <p class="profile-locked__title">AI 职位画像功能未开启</p>
      <p class="profile-locked__desc">
        当前职位的 AI 职位画像功能尚未开启，暂不支持查看画像、复制、编辑与发起聚合搜索。如需使用，请先开启职位画像功能。
      </p>
    </div>

    <!-- ================= 展示态 ================= -->
    <template v-else-if="enabled">
      <!-- 基本信息 -->
      <div class="basic-section">
        <div class="section-title">
          <svg class="section-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
            <path d="M8 13h8" />
            <path d="M8 17h5" />
          </svg>
          <span>基本信息</span>
        </div>
        <div class="basic-grid">
          <div v-for="f in displayFields" :key="f.key" class="basic-item">
            <p class="basic-label">{{ f.label }}</p>
            <div class="basic-value-row">
              <span v-if="f.weight && f.weightType" class="weight-badge" :class="`weight-badge--${f.weightType}`">
                {{ weightLabel(f.weightType) }}
              </span>
              <span class="basic-value">{{ f.value || '不限' }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 标签三组 -->
      <div class="tags-section">
        <div class="tag-group">
          <p class="tag-label">
            <svg class="tag-label-icon tag-icon-blue" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
              <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
              <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
            </svg>
            专业技能
          </p>
          <div class="tag-list">
            <span v-for="(s, i) in display.skills" :key="`sk-${i}`" class="tag-chip tag-chip-blue">{{ s }}</span>
          </div>
        </div>

        <div class="tag-group">
          <p class="tag-label">
            <svg class="tag-label-icon tag-icon-emerald" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.801 10A10 10 0 1 1 17 3.335" />
              <path d="m9 11 3 3L22 4" />
            </svg>
            软实力要求
          </p>
          <div class="tag-list">
            <span v-for="(s, i) in display.softSkills || []" :key="`ss-${i}`" class="tag-chip tag-chip-emerald">{{ s }}</span>
          </div>
        </div>

        <div class="tag-group">
          <p class="tag-label">
            <svg class="tag-label-icon tag-icon-amber" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect width="20" height="14" x="2" y="7" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
            工作经历
          </p>
          <div class="tag-list">
            <span v-for="(s, i) in display.relatedExperience || []" :key="`re-${i}`" class="tag-chip tag-chip-amber">{{ s }}</span>
          </div>
        </div>
      </div>

      <!-- ActionPanel slot：搜索牛人 / 推荐牛人 + 配置卡片 -->
      <slot name="action" />
    </template>
  </div>
</template>

<script setup>
import { ref, reactive, watch, computed } from "vue";

const props = defineProps({
  /** parseAISearchJD 的返回值 */
  profile: {
    type: Object,
    required: true
  },
  /**
   * 是否已开启「AI 职位画像」功能。
   * false → 渲染"未开启"锁定占位，并禁用复制 / 编辑（也不渲染底部聚合搜索动作面板）。
   * 由父组件（ChatCard）按当前职位的 jobProfileEnabled / positionHarnessProfileStatus 传入。
   */
  enabled: {
    type: Boolean,
    default: true
  }
});
// edit → 保存修改后把**整份编辑后的画像**抛给父组件（持久化 / 同步搜索条件）
const emit = defineEmits(["copy", "edit", "save"]);

/** 复制按钮：未开启画像时禁止复制 */
function handleCopy() {
  if (!props.enabled) return;
  emit("copy");
}

/* ===== 权重类型 ===== */
const weightOptions = [
  { value: "hard", label: "硬性要求" },
  { value: "veto", label: "一票否决" },
  { value: "weight", label: "权重评分" },
  { value: "bonus", label: "加分项" },
  { value: "deduction", label: "减分项" },
  { value: "display", label: "仅展示" }
];
const WEIGHT_LABELS = weightOptions.reduce((acc, w) => {
  acc[w.value] = w.label;
  return acc;
}, {});
function weightLabel(v) {
  return WEIGHT_LABELS[v] || "";
}

// 各字段默认权重（缺省时按此展示，对齐画像深度解析的默认规则）
const DEFAULT_WEIGHTS = {
  location: "veto",
  experience: "weight",
  education: "bonus",
  salary: "bonus",
  age: "weight",
  activityLevel: "weight",
  school: "deduction",
  notViewedRecently: "display",
  gender: "weight",
  swapResume: "weight",
  major: "weight",
  jobStability: "weight",
  jobStatus: "weight"
};

const UNLIMITED = "不限";

/* ===== 字段定义 ===== */
const fieldDefs = [
  { key: "position", label: "职位", type: "text", weight: false },
  {
    key: "location",
    label: "工作地点",
    type: "select",
    weight: true,
    options: [UNLIMITED, "北京", "上海", "广州", "深圳", "杭州", "成都", "武汉", "南京", "苏州", "西安"]
  },
  {
    key: "experience",
    label: "经验要求",
    type: "select",
    weight: true,
    options: [UNLIMITED, "应届生", "1年以内", "1-3年", "3-5年", "5-10年", "10年以上"]
  },
  {
    key: "education",
    label: "学历要求",
    type: "select",
    weight: true,
    options: [UNLIMITED, "初中及以下", "中专/中技", "高中", "大专", "本科", "硕士", "博士"]
  },
  { key: "salary", label: "薪资范围", type: "range", weight: true, minKey: "salaryMin", maxKey: "salaryMax", unit: "k" },
  { key: "age", label: "年龄", type: "age-range", weight: true },
  {
    key: "activityLevel",
    label: "活跃度",
    type: "select",
    weight: true,
    options: [UNLIMITED, "刚刚活跃", "今日活跃", "3日内活跃", "本周活跃", "本月活跃", "近半年活跃"]
  },
  {
    key: "school",
    label: "院校",
    type: "select",
    weight: true,
    options: [UNLIMITED, "985", "211", "双一流", "海外院校"]
  },
  {
    key: "notViewedRecently",
    label: "近期没有看过",
    type: "select",
    weight: true,
    options: [UNLIMITED, "是", "否"]
  },
  { key: "gender", label: "性别", type: "select", weight: true, options: [UNLIMITED, "男", "女"] },
  {
    key: "swapResume",
    label: "是否与同事交换简历",
    type: "select",
    weight: true,
    options: [UNLIMITED, "是", "否"]
  },
  {
    key: "major",
    label: "专业",
    type: "select",
    weight: true,
    options: [UNLIMITED, "计算机", "软件工程", "电子信息", "机械", "市场营销", "其他"]
  },
  {
    key: "jobStability",
    label: "跳槽频率",
    type: "select",
    weight: true,
    options: [UNLIMITED, "低", "中", "高"]
  },
  {
    key: "jobStatus",
    label: "求职状态",
    type: "select",
    weight: true,
    options: [UNLIMITED, "离职-随时到岗", "在职-考虑机会", "在职-暂不考虑"]
  }
];

/* ===== 画像归一化 ===== */
function normText(v) {
  return v === undefined || v === null || String(v).trim() === "" ? UNLIMITED : String(v);
}
function cloneProfile(p) {
  const weights = Object.assign({}, DEFAULT_WEIGHTS, p?.weights || {});
  return {
    position: p?.position || "",
    location: normText(p?.location),
    experience: normText(p?.experience),
    education: normText(p?.education),
    salary: normText(p?.salary),
    age: normText(p?.age),
    activityLevel: normText(p?.activityLevel),
    school: normText(p?.school),
    notViewedRecently: normText(p?.notViewedRecently),
    gender: normText(p?.gender),
    swapResume: normText(p?.swapResume),
    major: normText(p?.major),
    jobStability: normText(p?.jobStability),
    jobStatus: normText(p?.jobStatus),
    skills: [...(p?.skills || [])],
    softSkills: [...(p?.softSkills || [])],
    relatedExperience: [...(p?.relatedExperience || [])],
    weights
  };
}

const display = ref(cloneProfile(props.profile));
// 画像未开启时不允许停留在编辑态（父组件刚把 enabled 置 false 的兜底）
watch(
  () => props.enabled,
  (on) => {
    if (!on) isEditing.value = false;
  }
);
const userEdited = ref(false);
watch(
  () => props.profile,
  (next) => {
    if (!userEdited.value) display.value = cloneProfile(next);
  },
  { deep: true }
);

/* 展示态字段（顺序 = 2 列栅格逐行填充） */
const displayFields = ref([]);
watch(
  display,
  (d) => {
    displayFields.value = fieldDefs.map((f) => ({
      key: f.key,
      label: f.label,
      weight: !!f.weight,
      weightType: f.weight ? d.weights?.[f.key] : "",
      value: d[f.key]
    }));
  },
  { immediate: true, deep: true }
);

/* ===== 编辑态 ===== */
const isEditing = ref(false);
const editForm = reactive({
  values: {},
  weights: {},
  skills: "",
  softSkills: "",
  relatedExperience: ""
});

// "20k-35k" / "20-35" / "不限" → { min, max }
function parseRange(val) {
  const m = String(val || "").match(/(\d+)\s*[kK]?\s*[-~—至]\s*(\d+)/);
  if (m) return { min: m[1], max: m[2] };
  return { min: "", max: "" };
}

// 年龄：滑动条轨道上第一个端点是「不限」(值为 0)，其后是 17~65
const AGE_MIN = 17;
const AGE_MAX = 65;
function clampAge(n) {
  const v = parseInt(n, 10);
  if (Number.isNaN(v)) return AGE_MIN;
  return Math.min(AGE_MAX, Math.max(AGE_MIN, v));
}
function parseAge(val) {
  const s = String(val == null ? "" : val).trim();
  if (!s || s === UNLIMITED) return { min: 0, max: AGE_MAX };
  const m = s.match(/(\d+)\D+?(\d+)/);
  if (m) {
    const a = clampAge(m[1]);
    const b = clampAge(m[2]);
    return { min: Math.min(a, b), max: Math.max(a, b) };
  }
  const single = s.match(/(\d+)/);
  if (single) return { min: clampAge(single[1]), max: AGE_MAX };
  return { min: 0, max: AGE_MAX };
}

// 滑块模型：处理「不限」端点(0)与 17~65 之间的吸附，避免出现 1~16 的无意义年龄
const ageModel = computed({
  get() {
    return editForm.values.ageRange || { min: 0, max: AGE_MAX };
  },
  set(val) {
    let min = Number(val.min);
    let max = Number(val.max);
    if (min > 0 && min < AGE_MIN) min = min >= 9 ? AGE_MIN : 0;
    if (max > 0 && max < AGE_MIN) max = AGE_MIN;
    if (min > max) min = max;
    editForm.values.ageRange = { min, max };
  }
});

// 右侧文案：左端点归零即「不限」，否则展示 min-max岁
const ageText = computed(() => {
  const r = ageModel.value;
  if (!r || r.min === 0) return UNLIMITED;
  return `${r.min}-${r.max}岁`;
});
function formatRange(min, max, unit = "") {
  const lo = String(min ?? "").trim();
  const hi = String(max ?? "").trim();
  if (!lo && !hi) return UNLIMITED;
  if (lo && hi) return `${lo}${unit}-${hi}${unit}`;
  return `${lo || hi}${unit}以上`;
}
function splitChips(s) {
  return String(s || "")
    .split(/[,，]/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

function startEdit() {
  if (!props.enabled) return;
  const d = display.value;
  const salary = parseRange(d.salary);
  const age = parseAge(d.age);
  editForm.values = {
    position: d.position === UNLIMITED ? "" : d.position,
    location: d.location,
    experience: d.experience,
    education: d.education,
    salaryMin: salary.min,
    salaryMax: salary.max,
    ageRange: { min: age.min, max: age.max },
    activityLevel: d.activityLevel,
    school: d.school,
    notViewedRecently: d.notViewedRecently,
    gender: d.gender,
    swapResume: d.swapResume,
    major: d.major,
    jobStability: d.jobStability,
    jobStatus: d.jobStatus
  };
  editForm.weights = Object.assign({}, d.weights);
  editForm.skills = (d.skills || []).join(", ");
  editForm.softSkills = (d.softSkills || []).join(", ");
  editForm.relatedExperience = (d.relatedExperience || []).join(", ");
  isEditing.value = true;
}
function cancelEdit() {
  isEditing.value = false;
}
function saveEdit() {
  const v = editForm.values;
  const ageRange = v.ageRange || { min: 0, max: AGE_MAX };
  const next = {
    position: (v.position || "").trim(),
    location: v.location,
    experience: v.experience,
    education: v.education,
    salary: formatRange(v.salaryMin, v.salaryMax, "k"),
    age: ageRange.min === 0 ? UNLIMITED : `${ageRange.min}-${ageRange.max}`,
    activityLevel: v.activityLevel,
    school: v.school,
    notViewedRecently: v.notViewedRecently,
    gender: v.gender,
    swapResume: v.swapResume,
    major: v.major,
    jobStability: v.jobStability,
    jobStatus: v.jobStatus,
    skills: splitChips(editForm.skills),
    softSkills: splitChips(editForm.softSkills),
    relatedExperience: splitChips(editForm.relatedExperience),
    weights: Object.assign({}, editForm.weights)
  };
  display.value = Object.assign({}, cloneProfile(next), { position: next.position });
  userEdited.value = true;
  isEditing.value = false;
  emit("save", {
    profile: { ...next },
    skills: next.skills,
    softSkills: next.softSkills,
    relatedExperience: next.relatedExperience,
    weights: next.weights
  });
}
</script>

<style scoped lang="scss">
.ai-profile-card {
  width: 100%;
  color: #404040;
  display: flex;
  flex-direction: column;
  gap: 20px;
  font-size: 12px;
  line-height: 1.5;
}

/* ===== Header ===== */
.profile-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #0d9488;
}
.header-icon {
  color: inherit;
  flex-shrink: 0;
}
.header-text {
  font-size: 14px;
  font-weight: 900;
  letter-spacing: -0.025em;
  font-style: italic;
  color: inherit;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.hdr-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 0;
  background: transparent;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  color: #737373;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  line-height: 1;
}
.hdr-btn:hover {
  background: #f0fdfa;
  color: #14b8a6;
}
.hdr-btn svg {
  flex-shrink: 0;
}
.hdr-btn:disabled {
  color: #cbd5e1;
  cursor: not-allowed;
}
.hdr-btn:disabled:hover {
  background: transparent;
  color: #cbd5e1;
}

/* ===== 未开启：锁定占位 ===== */
.profile-locked {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
  padding: 44px 24px;
  border: 1px solid #f1f5f9;
  border-radius: 16px;
  background: #fff;
}
.profile-locked__icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f1f5f9;
  color: #64748b;
}
.profile-locked__title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: #334155;
}
.profile-locked__desc {
  margin: 0;
  max-width: 460px;
  font-size: 12px;
  line-height: 1.7;
  color: #94a3b8;
}
.hdr-save {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border: 0;
  border-radius: 8px;
  background: #14b8a6;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  transition: background 0.15s;
}
.hdr-save:hover {
  background: #0d9488;
}

/* ===== 编辑态 ===== */
.edit-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 32px;
}
.edit-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.edit-label {
  font-size: 12px;
  font-weight: 500;
  color: #525252;
}
.edit-control-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.select-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  min-width: 0;
  flex: 0 0 auto;
}
.select-wrap--flex {
  flex: 1 1 0;
}
.native-select,
.native-input {
  width: 100%;
  box-sizing: border-box;
  appearance: none;
  background: #fff;
  border: 1px solid #e5e5e5;
  border-radius: 6px;
  padding: 7px 26px 7px 10px;
  font-size: 12px;
  color: #404040;
  outline: none;
  line-height: 1.4;
  transition: box-shadow 0.15s, border-color 0.15s;
}
.native-input {
  padding-right: 10px;
}
.native-input--flex {
  flex: 1 1 0;
}
.native-select:focus,
.native-input:focus {
  border-color: #99f6e4;
  box-shadow: 0 0 0 2px #ccfbf1;
}
.weight-select {
  width: 112px;
  color: #0d9488;
}
.select-caret {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  color: #a3a3a3;
  pointer-events: none;
}
.edit-range {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1 1 0;
  min-width: 0;
}
.edit-range-input {
  flex: 1 1 0;
  width: auto;
  min-width: 48px;
  box-sizing: border-box;
  border: 1px solid #e5e5e5;
  border-radius: 6px;
  padding: 7px 8px;
  font-size: 12px;
  color: #404040;
  outline: none;
  transition: box-shadow 0.15s, border-color 0.15s;
}
.edit-range-input:focus {
  border-color: #99f6e4;
  box-shadow: 0 0 0 2px #ccfbf1;
}
.edit-range-sep {
  flex: 0 0 auto;
  color: #a3a3a3;
}
.edit-range-unit {
  flex: 0 0 auto;
  color: #737373;
}
.edit-age {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 0;
  min-width: 0;
  padding: 0 4px;
}
.edit-age__slider {
  flex: 1 1 0;
  min-width: 0;
}
.edit-age__value {
  flex: 0 0 auto;
  color: #404040;
  font-size: 12px;
  line-height: 1.2;
  text-align: right;
  white-space: nowrap;
}
.edit-textarea {
  width: 100%;
  box-sizing: border-box;
  background: #fff;
  border: 1px solid #e5e5e5;
  border-radius: 8px;
  padding: 8px;
  font-size: 12px;
  color: #404040;
  outline: none;
  resize: vertical;
  line-height: 1.5;
  transition: box-shadow 0.15s, border-color 0.15s;
}
.edit-textarea:focus {
  border-color: #99f6e4;
  box-shadow: 0 0 0 2px #ccfbf1;
}
/* ===== 展示态 ===== */
.basic-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  color: #0d9488;
}
.section-icon {
  flex-shrink: 0;
  color: #14b8a6;
}
.basic-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  row-gap: 18px;
  column-gap: 40px;
}
.basic-item {
  min-width: 0;
}
.basic-label {
  margin: 0 0 6px 0;
  font-size: 14px;
  font-weight: 600;
  color: #262626;
}
.basic-value-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 22px;
}
.basic-value {
  font-size: 13px;
  color: #525252;
  word-break: break-word;
}
.weight-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  line-height: 18px;
  white-space: nowrap;
}
.weight-badge--hard {
  color: #1677ff;
  background: #e8f1ff;
}
.weight-badge--veto {
  color: #ff4d4f;
  background: #ffeded;
}
.weight-badge--weight {
  color: #6d5bf6;
  background: #eeedff;
}
.weight-badge--bonus {
  color: #20b26b;
  background: #e8f8ef;
}
.weight-badge--deduction {
  color: #ff8b33;
  background: #fff2e8;
}
.weight-badge--display {
  color: #8e929b;
  background: #f2f3f5;
}

/* ===== 标签 ===== */
.tags-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.tag-group {
  min-width: 0;
}
.tag-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: #404040;
  margin: 0 0 8px 0;
}
.tag-label-icon {
  flex-shrink: 0;
}
.tag-icon-blue {
  color: #3b82f6;
}
.tag-icon-emerald {
  color: #10b981;
}
.tag-icon-amber {
  color: #f59e0b;
}
.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.tag-chip {
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.4;
  white-space: normal;
  word-break: break-word;
}
.tag-chip-blue {
  background: #eff6ff;
  border: 1px solid #dbeafe;
  color: #2563eb;
}
.tag-chip-emerald {
  background: #ecfdf5;
  border: 1px solid #d1fae5;
  color: #059669;
}
.tag-chip-amber {
  background: #fffbeb;
  border: 1px solid #fef3c7;
  color: #d97706;
}
</style>
