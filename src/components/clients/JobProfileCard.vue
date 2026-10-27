<!--
  职位画像卡（13 个固定维度）
  - 展示态：基础评估标准 + 规则类型 + 分数
  - 编辑态：左侧规则类型、中间值、右侧权重 / 加减分
  - 编辑只改本地，保存时 emit save；聚合搜索前可调 flushEdit() 自动提交
-->
<template>
  <div class="job-profile-card" :class="{ 'is-editing': isEditing }">
    <div class="profile-header">
      <div class="header-title">
        <q-icon name="auto_awesome" size="18px" class="header-icon" />
        <span class="header-text">AI 职位画像深度解析</span>
      </div>
      <div class="header-actions">
        <template v-if="isEditing">
          <button class="hdr-btn" type="button" @click="cancelEdit">取消</button>
          <button class="hdr-save" type="button" @click="saveEdit">
            <q-icon name="save" size="13px" />
            <span>保存修改</span>
          </button>
        </template>
        <template v-else>
          <button class="hdr-btn" type="button" :disabled="!enabled" @click="handleCopy">
            <q-icon name="content_copy" size="13px" />
            <span>复制</span>
          </button>
          <button class="hdr-btn" type="button" :disabled="!enabled" @click="startEdit">
            <q-icon name="edit" size="13px" />
            <span>编辑</span>
          </button>
        </template>
      </div>
    </div>

    <div v-if="!enabled" class="profile-locked">
      <div class="profile-locked__icon">
        <q-icon name="lock" size="24px" />
      </div>
      <p class="profile-locked__title">{{ lockedText.title }}</p>
      <p class="profile-locked__desc">{{ lockedText.desc }}</p>
    </div>

    <template v-else>
      <div class="profile-body">
        <div class="section-head">
          <div class="section-title">
            <q-icon name="fact_check" size="15px" class="section-icon" />
            <span>基础评估标准</span>
            <q-icon
              name="help_outline"
              size="15px"
              class="section-help"
              aria-label="评估标准说明"
            >
              <q-tooltip :offset="[0, 8]" class="profile-help-tooltip">
                以下评估标准用于筛选候选人过程中给候选人打分
              </q-tooltip>
            </q-icon>
          </div>
          <div class="section-actions">
            <div
              v-if="isEditing"
              class="weight-total"
              :class="{ invalid: !weightValidation.valid }"
            >
              权重合计 {{ weightValidation.sum }}/90
            </div>
            <button type="button" class="collapse-btn" @click="collapsed = !collapsed">
              <span>{{ collapsed ? "展开" : "收起" }}</span>
              <q-icon :name="collapsed ? 'expand_more' : 'expand_less'" size="16px" />
            </button>
          </div>
        </div>

        <div v-show="!collapsed" class="profile-content">
        <!-- ================= 编辑态 ================= -->
        <div v-if="isEditing" class="edit-panel">
          <div class="edit-grid">
            <div v-for="row in structuredRows" :key="row.dimension.key" class="edit-field">
              <div class="field-label">{{ row.dimension.label }}</div>
              <div class="field-controls">
                <q-select
                  v-model="row.item.rule_type"
                  :options="ruleOptions"
                  option-label="label"
                  option-value="value"
                  emit-value
                  map-options
                  dense
                  outlined
                  options-dense
                  hide-bottom-space
                  class="rule-select"
                  @update:model-value="() => onRuleChange(row)"
                />

                <PortraitValueEditor
                  :dimension="row.dimension"
                  :item="row.item"
                  class="value-editor"
                  @change="onValueChange"
                />

                <q-input
                  v-if="row.item.rule_type === 'WEIGHT_SCORE'"
                  v-model.number="row.item.weight"
                  type="number"
                  dense
                  outlined
                  hide-bottom-space
                  :min="0"
                  :max="90"
                  suffix="分"
                  class="score-input"
                  @update:model-value="() => onWeightInput(row)"
                />
                <q-input
                  v-else-if="row.isBonus"
                  v-model.number="row.item.weight"
                  type="number"
                  dense
                  outlined
                  hide-bottom-space
                  :min="1"
                  :max="10"
                  suffix="分"
                  class="score-input"
                  @update:model-value="() => onWeightInput(row)"
                />
              </div>
            </div>
          </div>

          <div class="edit-tag-list">
            <div v-for="row in tagRows" :key="row.dimension.key" class="edit-field edit-field--full">
              <div class="field-label">
                <span>{{ row.dimension.label }}</span>
                <span class="rule-static">仅展示</span>
              </div>
              <PortraitValueEditor
                :dimension="row.dimension"
                :item="row.item"
                class="value-editor value-editor--full"
                @change="onValueChange"
              />
            </div>
          </div>

          <p v-if="!weightValidation.valid" class="weight-error">
            权重评分合计需等于 90 分，当前 {{ weightValidation.sum }} 分
          </p>
        </div>

        <!-- ================= 详情态 ================= -->
        <template v-else>
          <div class="profile-grid">
            <div v-for="row in structuredRows" :key="row.dimension.key" class="profile-item">
              <div class="profile-item__label">{{ row.dimension.label }}</div>
              <div class="profile-item__content">
                <span class="rule-badge" :class="'rule-badge--' + ruleClass(row.item)">
                  {{ ruleLabel(row.item) }}
                </span>
                <span class="profile-item__value">{{ row.display.join("、") }}</span>
                <span v-if="scoreText(row.item)" class="score-text">{{ scoreText(row.item) }}</span>
              </div>
            </div>
          </div>

          <div
            v-for="row in tagRows"
            :key="row.dimension.key"
            class="tag-section"
            :class="'tag-section--' + tagTheme(row)"
          >
            <div class="tag-title">
              <q-icon :name="tagIcon(row)" size="15px" class="tag-icon" />
              <span>{{ row.dimension.label }}</span>
            </div>
            <div class="tag-chips">
              <span
                v-for="(text, idx) in row.display"
                :key="idx"
                class="tag-chip"
                :class="{ 'tag-chip--empty': text === '不限' }"
              >
                {{ text }}
              </span>
            </div>
          </div>
        </template>
        </div>
      </div>
    </template>

    <!-- 编辑态也保留聚合搜索入口：点击时会先自动提交当前编辑态 -->
    <slot v-if="enabled" name="action" />
  </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import PortraitValueEditor from "./PortraitValueEditor.vue";
import {
  BONUS_DEFAULT,
  BONUS_MAX,
  BONUS_MIN,
  cloneItems,
  isBonusRule,
  normalizeProfile,
  redistributeWeights,
  ruleOf,
  setWeight,
  validateWeights,
  weightOf,
  toSaveArrays,
  displayOf
} from "src/util/portrait/profile";
import {
  RULE_LABELS,
  RULE_TYPES,
  UNLIMITED_TEXT,
  getDimension as itemsDimension
} from "src/util/portrait/dimensions";

const props = defineProps({
  /** getChatHistory 消息级 positionProfile（或 harnessPositionProfile.profile / 平铺 profile） */
  profile: {
    type: Object,
    default: null
  },
  enabled: {
    type: Boolean,
    default: true
  },
  /** off | generating | failed | not-configured | evaluation-off | no-permission */
  lockType: {
    type: String,
    default: "off"
  }
});

// 注意：卡片内的「保存修改」只改本地，不调接口；接口在聚合搜索前由父组件统一提交
const emit = defineEmits(["copy"]);

const ruleOptions = RULE_TYPES;
const isEditing = ref(false);
const collapsed = ref(false);
const rows = ref([]);
const structuredRows = computed(() => rows.value.filter((row) => !row.isTag));
const tagRows = computed(() => rows.value.filter((row) => row.isTag));
const TAG_THEME = {
  PROFESSIONAL_SKILLS: "skill",
  SOFT_SKILLS: "soft",
  WORK_EXPERIENCE: "experience"
};
const TAG_ICON = {
  PROFESSIONAL_SKILLS: "build",
  SOFT_SKILLS: "sentiment_satisfied_alt",
  WORK_EXPERIENCE: "work"
};
function tagTheme(row) {
  return TAG_THEME[row.dimension.key] || "default";
}
function tagIcon(row) {
  return TAG_ICON[row.dimension.key] || "label";
}
/** 后端画像快照：用于判断哪些改动还没同步到后端（聚合搜索时决定是否调 updateHarnessProfile） */
let baselineItems = [];
/** 最近一次本地「保存修改」后的快照：再次编辑 / 取消编辑时优先回显 */
let localItems = null;
/** 父组件重复渲染会生成新的 profile 对象，签名相同则不要冲掉本地保存状态 */
let lastProfileSignature = "";

const LOCK_TEXT = {
  off: {
    title: "AI 职位画像功能未开启",
    desc: "当前职位的 AI 职位画像功能尚未开启，暂不支持查看画像、复制、编辑与发起聚合搜索。如需使用，请先开启职位画像功能。"
  },
  generating: {
    title: "AI 职位画像生成中",
    desc: "当前职位的画像正在生成，暂时无法查看与编辑，请稍后再试。"
  },
  failed: {
    title: "AI 职位画像生成失败",
    desc: "当前职位的画像生成失败，暂不支持查看、编辑与发起聚合搜索。请重新生成职位画像后再试。"
  },
  "not-configured": {
    title: "AI 职位画像未配置",
    desc: "当前职位尚未配置画像内容，暂不支持查看、编辑与发起聚合搜索。请先完成职位画像配置。"
  },
  "evaluation-off": {
    title: "AI 评估未开启",
    desc: "当前职位已开启画像，但未开启 AI 评估，无法按画像评分筛选候选人。请先开启 AI 评估。"
  },
  "no-permission": {
    title: "暂无职位画像权限",
    desc: "当前账号没有使用 AI 职位画像的权限，如需使用请联系管理员开通。"
  }
};

const lockedText = computed(() => LOCK_TEXT[props.lockType] || LOCK_TEXT.off);

function buildRows(items) {
  return items
    .map((item) => {
      const dimension = itemsDimension(item.dimension);
      if (!dimension) return null;
      const rule = ruleOf(item) || dimension.defaultRule;
      return {
        dimension,
        item,
        isTag: dimension.structureType === 2,
        isBonus: isBonusRule(rule),
        prevRule: rule,
        display: displayOf(item).length ? displayOf(item) : [UNLIMITED_TEXT]
      };
    })
    .filter(Boolean);
}


function applyProfile(profile) {
  const { items } = normalizeProfile(profile);
  baselineItems = cloneItems(items);
  localItems = null;
  rows.value = buildRows(items);
}

watch(
  () => props.profile,
  (next) => {
    if (isEditing.value) return;
    const signature = JSON.stringify(next || null);
    if (signature === lastProfileSignature) return;
    lastProfileSignature = signature;
    applyProfile(next);
  },
  { immediate: true, deep: true }
);

watch(
  () => props.enabled,
  (on) => {
    if (!on) isEditing.value = false;
  }
);

function startEdit() {
  if (!props.enabled) return;
  collapsed.value = false;

  let editable;
  if (Array.isArray(localItems) && localItems.length) {
    // 已经点过「保存修改」：优先回显最近一次本地保存的数据
    editable = cloneItems(localItems);
  } else {
    const { items } = normalizeProfile(props.profile);
    editable = cloneItems(items);
  }

  // 后端画像可能因为规则变化导致权重总和不等于 90（例如部分维度改成硬性要求），
  // 这时进入编辑态先按权重维度重新平均分配，否则保存会被权重校验拦截。
  if (!validateWeights(editable).valid) redistributeWeights(editable);

  rows.value = buildRows(editable);
  isEditing.value = true;
}

function cancelEdit() {
  const source = Array.isArray(localItems) && localItems.length ? localItems : baselineItems;
  isEditing.value = false;
  rows.value = buildRows(cloneItems(source));
}

function onRuleChange(row) {
  const rule = ruleOf(row.item) || "DISPLAY_ONLY";
  // 只有「进入 / 离开权重评分组」才重新平均分配 90 分；
  // 其它规则互切（硬性要求 → 一票否决）不动用户手动调过的权重。
  const membershipChanged = (row.prevRule === "WEIGHT_SCORE") !== (rule === "WEIGHT_SCORE");
  row.isBonus = isBonusRule(rule);
  if (rule === "WEIGHT_SCORE") {
    if (weightOf(row.item) === null) setWeight(row.item, 10);
  } else if (isBonusRule(rule)) {
    setWeight(row.item, BONUS_DEFAULT);
  } else {
    setWeight(row.item, null);
  }
  if (membershipChanged) redistributeWeights(rows.value.map((r) => r.item));
  row.prevRule = rule;
}

function onWeightInput(row) {
  const rule = ruleOf(row.item);
  let value = Number(row.item.weight);
  if (Number.isNaN(value)) value = 0;
  if (rule === "WEIGHT_SCORE") value = Math.min(90, Math.max(0, value));
  if (isBonusRule(rule)) value = Math.min(BONUS_MAX, Math.max(BONUS_MIN, value));
  setWeight(row.item, value);
}

function onValueChange() {
  rows.value.forEach((row) => {
    row.display = displayOf(row.item).length ? displayOf(row.item) : [UNLIMITED_TEXT];
  });
}

const weightValidation = computed(() => validateWeights(rows.value.map((r) => r.item)));

function ruleLabel(item) {
  const rule = ruleOf(item);
  return RULE_LABELS[rule] || "仅展示";
}

function ruleClass(item) {
  const rule = ruleOf(item) || "DISPLAY_ONLY";
  return rule.toLowerCase().replace(/_/g, "-");
}

function scoreText(item) {
  const rule = ruleOf(item);
  const weight = weightOf(item);
  if (rule === "WEIGHT_SCORE" && weight !== null) return `${weight} 分`;
  if (rule === "BONUS" && weight !== null) return `+${weight} 分`;
  if (rule === "PENALTY" && weight !== null) return `-${weight} 分`;
  return "";
}

function buildCopyText() {
  const lines = rows.value.map((row) => {
    const value = (row.display || []).join("、") || UNLIMITED_TEXT;
    const score = scoreText(row.item);
    const rule = ruleLabel(row.item);
    return `${row.dimension.label}：${value}（${rule}${score ? `，${score}` : ""}）`;
  });
  return `基础评估标准\n${lines.join("\n")}`;
}

function handleCopy() {
  if (!props.enabled) return;
  emit("copy", buildCopyText());
}

function buildPayload() {
  return toSaveArrays(rows.value.map((r) => r.item));
}

function commitLocalItems() {
  localItems = cloneItems(rows.value.map((row) => row.item));
}

/**
 * 头部「保存修改」：只保存到本地并退出编辑态，不调接口。
 * 聚合搜索前由 flushEdit + 父组件统一提交到后端。
 */
function saveEdit() {
  if (!weightValidation.value.valid) return false;
  commitLocalItems();
  isEditing.value = false;
  return true;
}

/** 聚合搜索前调用：编辑中则校验并提交；不合法返回 null（阻止搜索） */
function flushEdit() {
  if (!isEditing.value) return buildPayload();
  if (!weightValidation.value.valid) return null;
  const payload = buildPayload();
  commitLocalItems();
  isEditing.value = false;
  return payload;
}

/** 是否有未保存改动（聚合搜索前用来决定是否调 updateHarnessProfile） */
function isDirty() {
  const current = JSON.stringify(rows.value.map((r) => r.item));
  return current !== JSON.stringify(baselineItems);
}

defineExpose({ flushEdit, saveEdit, buildPayload, isDirty, isEditing });
</script>

<style scoped lang="scss">
.job-profile-card {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 14px;
  font-size: 12px;
  line-height: 1.5;
  color: #262626;
}

/* ===== Header ===== */
.profile-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.header-title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: #0d9488;
}
.header-icon {
  flex-shrink: 0;
}
.header-text {
  font-size: 15px;
  font-weight: 700;
  font-style: italic;
  letter-spacing: -0.02em;
  white-space: nowrap;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.hdr-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #595959;
  font-size: 12px;
  line-height: 1.2;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.hdr-btn:hover {
  background: #f0fdfa;
  color: #0d9488;
}
.hdr-btn:disabled {
  color: #cbd5e1;
  cursor: not-allowed;
  background: transparent;
}
.hdr-save {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border: 0;
  border-radius: 6px;
  background: #14b8a6;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.hdr-save:hover {
  background: #0d9488;
}

/* ===== 锁定态 ===== */
.profile-locked {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;
  padding: 40px 24px;
  border: 1px solid #f1f5f9;
  border-radius: 12px;
  background: #fff;
}
.profile-locked__icon {
  width: 46px;
  height: 46px;
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

/* ===== 区块标题 ===== */
.profile-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.profile-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.section-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}
.collapse-btn {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 4px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #8c8c8c;
  font-size: 12px;
  line-height: 1.2;
  cursor: pointer;
}
.collapse-btn:hover {
  color: #14b8a6;
  background: #f0fdfa;
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 8px;
}
.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  color: #262626;
}
.section-icon {
  color: #14b8a6;
}
.section-help {
  margin-left: 2px;
  color: #14b8a6;
  cursor: help;
}
:global(.profile-help-tooltip) {
  max-width: 260px;
  white-space: normal;
  font-size: 12px;
  line-height: 1.6;
}
.weight-total {
  font-size: 12px;
  font-weight: 600;
  color: #0d9488;
  white-space: nowrap;
}
.weight-total.invalid {
  color: #dc2626;
}

/* ===== 详情态 ===== */
.profile-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 32px;
}
.profile-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.profile-item__label {
  font-size: 13px;
  font-weight: 500;
  color: #595959;
}
.profile-item__content {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 6px 8px;
  min-width: 0;
}
.profile-item__value {
  flex: 1 1 0;
  min-width: 0;
  font-size: 13px;
  color: #262626;
  overflow-wrap: anywhere;
}
.rule-badge {
  flex: 0 0 auto;
  padding: 1px 6px;
  border-radius: 4px;
  background: #f3f3f3;
  color: #8c8c8c;
  font-size: 11px;
  line-height: 18px;
  white-space: nowrap;
}
.rule-badge--weight-score {
  background: #f3eeff;
  color: #7c5cfc;
}
.rule-badge--hard-requirement {
  background: #fff4e6;
  color: #d46b08;
}
.rule-badge--veto {
  background: #fff1f0;
  color: #cf1322;
}
.rule-badge--bonus {
  background: #e8f8ee;
  color: #2ba471;
}
.rule-badge--penalty {
  background: #fff3e6;
  color: #e37318;
}
.rule-badge--display-only {
  background: #f3f3f3;
  color: #8c8c8c;
}
.score-text {
  flex: 0 0 auto;
  padding-left: 2px;
  font-size: 12px;
  color: #8c8c8c;
  white-space: nowrap;
}

/* ===== 标签化维度 ===== */
.tag-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tag-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: #595959;
}
.tag-icon {
  color: #8c8c8c;
}
.tag-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-left: 21px;
}
.tag-chip {
  padding: 2px 10px;
  border-radius: 4px;
  background: #f5f5f5;
  color: #595959;
  font-size: 12px;
  line-height: 20px;
  overflow-wrap: anywhere;
}
.tag-section--skill .tag-icon {
  color: #2f6bff;
}
.tag-section--skill .tag-chip {
  background: #eaf2ff;
  color: #2f6bff;
}
.tag-section--soft .tag-icon {
  color: #2ba471;
}
.tag-section--soft .tag-chip {
  background: #e8f8ee;
  color: #2ba471;
}
.tag-section--experience .tag-icon {
  color: #e37318;
}
.tag-section--experience .tag-chip {
  background: #fff3e6;
  color: #e37318;
}
.tag-chip--empty {
  background: #f5f5f5 !important;
  color: #bfbfbf !important;
}

/* ===== 编辑态 ===== */
.edit-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 20px 18px;
  border-radius: 12px;
  background: #f7f7f8;
}
.edit-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 14px;
}
.edit-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.edit-field--full {
  width: 100%;
}
.field-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 500;
  color: #8c8c8c;
}
.field-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.rule-select {
  flex: 0 0 100px;
  width: 100px;
}
.value-editor {
  flex: 1 1 0;
  min-width: 0;
}
.value-editor--full {
  width: 100%;
}
.score-input {
  flex: 0 0 88px;
  width: 88px;
}
.rule-static {
  padding: 0 6px;
  border-radius: 4px;
  background: #ececec;
  color: #8c8c8c;
  font-size: 10px;
  font-weight: 400;
  line-height: 18px;
}
.edit-tag-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.weight-error {
  margin: 0;
  font-size: 11px;
  color: #dc2626;
}

/* ===== Quasar 控件统一尺寸 ===== */
.job-profile-card :deep(.q-field--outlined .q-field__control) {
  height: 32px;
  min-height: 32px;
  padding: 0 8px;
  border-radius: 6px;
  background: #fff;
}
.job-profile-card :deep(.q-field--outlined .q-field__control::before) {
  border-color: #e5e7eb;
}
.job-profile-card :deep(.q-field--outlined.q-field--focused .q-field__control::after) {
  border-color: #5eead4;
}
.job-profile-card :deep(.q-field__native),
.job-profile-card :deep(.q-field__input),
.job-profile-card :deep(.q-field__marginal) {
  height: 30px;
  min-height: 30px;
  font-size: 12px;
  color: #262626;
}
.job-profile-card :deep(.q-field__native) {
  padding: 0;
}
.job-profile-card :deep(.q-field__suffix) {
  font-size: 11px;
  color: #8c8c8c;
}

/* 分数右对齐，让数字和「分」贴在一起 */
.job-profile-card :deep(.score-input .q-field__native) {
  text-align: right;
  padding-right: 2px;
}
.job-profile-card :deep(.score-input .q-field__suffix) {
  display: inline-flex;
  align-items: center;
  height: 30px;
  padding: 0 0 0 2px;
  line-height: 30px;
  font-size: 12px;
}
.job-profile-card :deep(.q-chip) {
  height: 20px;
  margin: 1px;
  font-size: 11px;
}
.job-profile-card :deep(.q-field__append .q-icon) {
  font-size: 18px;
  color: #a3a3a3;
}

/* 多选 chips：外框、控件、内容统一 32px，chips 严格垂直居中且单行展示 */
.job-profile-card :deep(.profile-select) {
  height: 32px;
  min-height: 32px;
  max-height: 32px;
  align-items: center;
}
.job-profile-card :deep(.profile-select .q-field__inner) {
  height: 32px;
  min-height: 32px;
  max-height: 32px;
}
.job-profile-card :deep(.profile-select .q-field__control) {
  height: 32px;
  min-height: 32px;
  max-height: 32px;
  padding: 0 8px;
  align-items: center;
  overflow: hidden;
}
.job-profile-card :deep(.profile-select .q-field__control-container) {
  height: 30px;
  align-items: center;
  padding-top: 0;
}
.job-profile-card :deep(.profile-select .q-field__native) {
  height: 30px;
  min-height: 30px;
  max-height: 30px;
  flex-wrap: nowrap;
  align-items: center;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}
.job-profile-card :deep(.profile-select .q-field__native::-webkit-scrollbar) {
  display: none;
}
.job-profile-card :deep(.profile-select .q-field__native input) {
  height: 28px;
  min-height: 28px;
  padding: 0;
  line-height: 28px;
}
.job-profile-card :deep(.profile-select .q-chip) {
  height: 22px;
  margin: 0 2px 0 0;
  background: #f2f2f2;
  color: #404040;
  font-size: 12px;
}
.job-profile-card :deep(.profile-select .q-chip__icon--remove) {
  font-size: 14px;
  color: #8c8c8c;
  opacity: 1;
}
.job-profile-card :deep(.profile-select .q-field__native input) {
  min-width: 60px;
}

@media (max-width: 560px) {
  .profile-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
