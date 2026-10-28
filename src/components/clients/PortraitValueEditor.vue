<!--
  职位画像单个维度的值编辑器。
  - local-gender：本地固定 不限/男/女，单选
  - initialize：最高学历 / 第一学历 / 工作稳定性（数据源 /knowledge/initialize）
  - remote：模糊搜索多选（/knowledge/search）
  - area：意向工作城市级联多选
  - range-age：双端滚动滑块（16-65 岁）
  - range-salary：最低/最高数字输入框，单位 K 独立展示（1-200K）
  直接修改传入的 item（display_value / dataTypeValue），并 emit change 通知父组件。
-->
<template>
  <AreaCascader
    v-if="dimension.source === 'area'"
    :tree="areaTree"
    :model-value="selectedOf(item)"
    @update:model-value="onAreaChange"
  />

  <div v-else-if="isAge" class="age-editor">
    <q-range
      v-model="sliderValue"
      :min="sliderBounds.min"
      :max="sliderBounds.max"
      :step="1"
      :left-label-value="ageThumbLabel('min')"
      :right-label-value="ageThumbLabel('max')"
      label
      label-color="grey-10"
      color="primary"
      track-size="3px"
      thumb-size="16px"
      class="age-editor__slider"
      @mousedown.capture="onAgeSliderMouseDown"
    />
    <span class="age-editor__value">{{ rangeText }}</span>
  </div>

  <div v-else-if="isSalary" class="salary-editor">
    <div class="salary-editor__inputs">
      <input
        class="salary-editor__input"
        type="number"
        inputmode="numeric"
        :min="SALARY_MIN"
        :max="SALARY_MAX"
        step="1"
        placeholder="不限"
        aria-label="最低薪资"
        :value="range.min ?? ''"
        @change="onSalaryRangeChange('min', $event)"
      />
      <span class="salary-editor__separator">–</span>
      <input
        class="salary-editor__input"
        type="number"
        inputmode="numeric"
        :min="SALARY_MIN"
        :max="SALARY_MAX"
        step="1"
        placeholder="不限"
        aria-label="最高薪资"
        :value="range.max ?? ''"
        @change="onSalaryRangeChange('max', $event)"
      />
    </div>
    <span class="salary-editor__unit">K</span>
  </div>

  <q-select
    v-else
    ref="selectRef"
    v-model="selectValue"
    :options="options"
    :multiple="dimension.multi"
    :use-input="isRemote"
    :loading="loading"
    :use-chips="dimension.multi"
    :append-icon="isRemote ? 'search' : undefined"
    :hide-dropdown-icon="isRemote"
    option-label="label"
    option-value="value"
    emit-value
    map-options
    dense
    outlined
    hide-bottom-space
    class="profile-select"
    :popup-content-class="'profile-select-popup'"
    @filter="onFilter"
    @update:model-value="onSelectChange"
    @input-value="onInputValue"
    @focus="ensureOptions"
    @blur="onSelectBlur"
  >
    <template #no-option>
      <q-item>
        <q-item-section class="text-grey-6">{{ isRemote ? "输入关键词搜索" : "暂无数据" }}</q-item-section>
      </q-item>
    </template>
  </q-select>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import AreaCascader from "./AreaCascader.vue";
import {
  getProfileKnowledgeAreaTree,
  getProfileKnowledgeInitialize,
  searchProfileKnowledge
} from "src/api/profile/ProfileKnowledgeApi";
import {
  AGE_MAX,
  AGE_MIN,
  SALARY_MAX,
  SALARY_MIN,
  formatAgeDisplay,
  formatSalaryDisplay,
  parseAgeDisplay,
  parseSalaryDisplay,
  selectedOf,
  setDisplay,
  setSelected,
  displayOf
} from "src/util/portrait/profile";
import { UNLIMITED_TEXT } from "src/util/portrait/dimensions";

const props = defineProps({
  dimension: {
    type: Object,
    required: true
  },
  item: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(["change"]);

const UNLIMITED_VALUE = "__UNLIMITED__";

const options = ref([]);
const loading = ref(false);
const areaTree = ref([]);
const initializedOptions = ref([]);
const selectRef = ref(null);
const remoteKeyword = ref("");
let searchTimer = null;
let searchSeq = 0;

const isRemote = computed(() => props.dimension.source === "remote");
const isLocalGender = computed(() => props.dimension.source === "local-gender");
const isAge = computed(() => props.dimension.source === "range-age");
const isSalary = computed(() => props.dimension.source === "range-salary");

function notifyChange() {
  // item 是父组件的 reactive 对象，这里只是触发一次通知（父组件用于脏标记 / 权重校验）
  emit("change");
}

/* ===== 普通下拉（本地 / initialize / remote） ===== */

function selectedToOptions(list) {
  return (list || []).map((opt) => ({
    label: opt.dataTypeValueName,
    value: opt.dataTypeId
  }));
}

/**
 * 「不限」始终只保留一项：
 *   - 接口数据里已经有「不限」时，复用它并统一映射成内部哨兵值；
 *   - 接口没有时才本地补一项。
 */
function optionListWithUnlimited(list) {
  const normalized = (list || []).map((opt) =>
    String(opt.label ?? "").trim() === UNLIMITED_TEXT
      ? { ...opt, value: UNLIMITED_VALUE }
      : opt
  );
  const existing = normalized.find((opt) => opt.value === UNLIMITED_VALUE);
  return [
    existing || { label: UNLIMITED_TEXT, value: UNLIMITED_VALUE },
    ...normalized.filter((opt) => opt.value !== UNLIMITED_VALUE)
  ];
}

const selectValue = computed({
  get() {
    if (isLocalGender.value) {
      const names = displayOf(props.item).filter((v) => v !== UNLIMITED_TEXT);
      if (!names.length) return props.dimension.multi ? [UNLIMITED_VALUE] : UNLIMITED_VALUE;
      return props.dimension.multi ? names : names[0];
    }
    const sel = selectedOf(props.item).filter(
      (s) => String(s.dataTypeValueName ?? "").trim() !== UNLIMITED_TEXT
    );
    if (!sel.length) {
      return props.dimension.multi ? [UNLIMITED_VALUE] : UNLIMITED_VALUE;
    }
    return props.dimension.multi ? sel.map((s) => s.dataTypeId) : sel[0].dataTypeId;
  },
  set() {
    /* 统一走 onSelectChange */
  }
});

function onSelectChange(value) {
  const values = Array.isArray(value) ? value : value === null || value === undefined ? [] : [value];
  const pickedValues = values.filter((v) => v !== UNLIMITED_VALUE);

  // 上一次选中值：用来区分「刚点了不限」和「在不限状态下点了具体项」
  const prev = Array.isArray(selectValue.value) ? selectValue.value : [selectValue.value];
  const prevHadUnlimited = prev.includes(UNLIMITED_VALUE);
  const nextHasUnlimited = values.includes(UNLIMITED_VALUE);

  // 本次新增「不限」→ 清空具体选项，只保留不限
  if (nextHasUnlimited && !prevHadUnlimited) {
    setSelected(props.item, []);
    setDisplay(props.item, [UNLIMITED_TEXT]);
    notifyChange();
    return;
  }

  // 没有具体选项（含取消勾选不限）→ 仍按不限处理
  if (pickedValues.length === 0) {
    setSelected(props.item, []);
    setDisplay(props.item, [UNLIMITED_TEXT]);
    notifyChange();
    return;
  }
  if (isLocalGender.value) {
    setSelected(props.item, []);
    setDisplay(props.item, pickedValues);
    notifyChange();
    return;
  }
  const picked = pickedValues.map((id) => {
    const found = options.value.find((opt) => String(opt.value) === String(id));
    return {
      dataTypeId: found ? found.value : id,
      dataTypeValueName: found ? found.label : String(id)
    };
  });
  setSelected(props.item, picked);
  setDisplay(
    props.item,
    picked.map((opt) => opt.dataTypeValueName)
  );
  notifyChange();
}

async function ensureOptions() {
  if (isLocalGender.value) {
    options.value = optionListWithUnlimited(
      [
        { label: "男", value: "男" },
        { label: "女", value: "女" }
      ],
      props.dimension.multi
    );
    return;
  }
  if (props.dimension.source === "initialize" && options.value.length <= 1) {
    loading.value = true;
    try {
      const data = await getProfileKnowledgeInitialize();
      const list = data?.[props.dimension.initKey] || [];
      initializedOptions.value = selectedToOptions(list);
      options.value = optionListWithUnlimited(initializedOptions.value, props.dimension.multi);
    } finally {
      loading.value = false;
    }
    return;
  }
  if (isRemote.value && options.value.length <= 1) {
    mergeRemoteOptions([]);
  }
}

function onInputValue(value) {
  if (!isRemote.value) return;
  remoteKeyword.value = String(value ?? "");
}

/**
 * QSelect 失焦时会主动清空搜索框（内部 resetInputValue）。
 * 这里在失焦后的下一帧把关键词恢复回去，重新聚焦时仍保留上次搜索内容。
 */
function onSelectBlur() {
  if (!isRemote.value) return;
  const keyword = remoteKeyword.value;
  if (!keyword) return;
  nextTick(() => {
    selectRef.value?.updateInputValue?.(keyword, true);
  });
}

function mergeRemoteOptions(results) {
  const map = new Map();
  selectedOf(props.item).forEach((opt) => {
    map.set(String(opt.dataTypeId), { label: opt.dataTypeValueName, value: opt.dataTypeId });
  });
  (results || []).forEach((opt) => {
    map.set(String(opt.dataTypeId), { label: opt.dataTypeValueName, value: opt.dataTypeId });
  });
  options.value = optionListWithUnlimited([...map.values()], props.dimension.multi);
}

function onFilter(keyword, update) {
  if (!isRemote.value) {
    update(() => {});
    return;
  }
  if (searchTimer) clearTimeout(searchTimer);
  const text = String(keyword || "").trim();
  const seq = ++searchSeq;

  if (!text) {
    update(() => {
      mergeRemoteOptions([]);
    });
    return;
  }

  // 先让 QSelect 知道本轮过滤开始，等接口返回后再更新 options
  update(() => {});
  searchTimer = setTimeout(async () => {
    loading.value = true;
    try {
      const results = await searchProfileKnowledge({
        dataType: props.dimension.dataType,
        keyword: text,
        structureType: props.dimension.structureType
      });
      if (seq !== searchSeq) return;
      update(() => {
        mergeRemoteOptions(results);
      });
    } catch (e) {
      if (seq === searchSeq) {
        console.warn("[PortraitValueEditor] 搜索失败:", e?.message || e);
        update(() => {});
      }
    } finally {
      if (seq === searchSeq) loading.value = false;
    }
  }, 300);
}

/* ===== 区间（年龄 / 薪资） ===== */

const rangeBounds = computed(() =>
  props.dimension.source === "range-age"
    ? { min: AGE_MIN, max: AGE_MAX }
    : { min: SALARY_MIN, max: SALARY_MAX }
);
const range = computed(() =>
  props.dimension.source === "range-age"
    ? parseAgeDisplay(displayOf(props.item))
    : parseSalaryDisplay(displayOf(props.item))
);

const rangeText = computed(() => {
  const display = displayOf(props.item);
  return display.length ? display.join("、") : UNLIMITED_TEXT;
});

/**
 * 滑块两端各留一个「不限」档位：
 *   最左（bounds.min - 1）→ 不设下限
 *   最右（bounds.max + 1）→ 不设上限
 * 其余位置都是正常数值，保留 16/65、1K/200K 作为具体边界。
 */
const sliderBounds = computed(() => ({
  min: rangeBounds.value.min - 1,
  max: rangeBounds.value.max + 1
}));

function commitRange(min, max) {
  const display =
    props.dimension.source === "range-age"
      ? formatAgeDisplay({ min, max })
      : formatSalaryDisplay({ min, max });
  setDisplay(props.item, display);
  setSelected(props.item, []);
  notifyChange();
}

function clampSalaryValue(value) {
  return Math.min(SALARY_MAX, Math.max(SALARY_MIN, Math.round(value)));
}

function onSalaryRangeChange(side, event) {
  const raw = String(event?.target?.value ?? "").trim();
  const parsed = raw === "" ? null : Number(raw);
  const value = Number.isFinite(parsed) ? clampSalaryValue(parsed) : null;

  let min = side === "min" ? value : range.value.min;
  let max = side === "max" ? value : range.value.max;
  if (min !== null && max !== null && min > max) {
    if (side === "min") max = min;
    else min = max;
  }
  commitRange(min, max);
}

let draggingAgeThumb = null;

function clearAgeSliderDrag() {
  draggingAgeThumb?.removeAttribute("data-age-dragging");
  draggingAgeThumb = null;
  document.removeEventListener("mouseup", clearAgeSliderDrag, true);
}

function onAgeSliderMouseDown(event) {
  if (event.button !== 0) return;
  const root = event.currentTarget;
  const thumbs = Array.from(root?.querySelectorAll?.(".q-slider__thumb") || []);
  if (thumbs.length === 0) return;

  clearAgeSliderDrag();
  draggingAgeThumb =
    event.target?.closest?.(".q-slider__thumb") ||
    thumbs.reduce((nearest, thumb) => {
      const rect = thumb.getBoundingClientRect();
      const distance = Math.abs(rect.left + rect.width / 2 - event.clientX);
      return !nearest || distance < nearest.distance ? { thumb, distance } : nearest;
    }, null)?.thumb;

  draggingAgeThumb?.setAttribute("data-age-dragging", "true");
  document.addEventListener("mouseup", clearAgeSliderDrag, true);
}

const sliderValue = computed({
  get() {
    const slider = sliderBounds.value;
    if (range.value.unlimited) return { ...slider };
    return {
      min: range.value.min === null ? slider.min : range.value.min,
      max: range.value.max === null ? slider.max : range.value.max
    };
  },
  set(value) {
    const bounds = rangeBounds.value;
    const slider = sliderBounds.value;
    let min = Number(value?.min);
    let max = Number(value?.max);
    if (!Number.isFinite(min)) min = slider.min;
    if (!Number.isFinite(max)) max = slider.max;

    // 拖到两端「不限」档位
    min = min <= slider.min ? null : Math.min(bounds.max, Math.max(bounds.min, Math.round(min)));
    max = max >= slider.max ? null : Math.min(bounds.max, Math.max(bounds.min, Math.round(max)));
    if (min !== null && max !== null && min > max) [min, max] = [max, min];

    commitRange(min, max);
  }
});

/** 滑块气泡展示当前节点；两端哨兵节点显示「不限」。 */
function ageThumbLabel(side) {
  const value = side === "min" ? sliderValue.value.min : sliderValue.value.max;
  if (value === sliderBounds.value.min || value === sliderBounds.value.max) {
    return UNLIMITED_TEXT;
  }
  return `${value}岁`;
}

/* ===== 城市 ===== */

function onAreaChange(list) {
  setSelected(props.item, list);
  setDisplay(
    props.item,
    (list || []).map((opt) => opt.dataTypeValueName)
  );
  notifyChange();
}

onBeforeUnmount(clearAgeSliderDrag);

onMounted(async () => {
  if (props.dimension.source === "area") {
    if (areaTree.value.length === 0) {
      const tree = await getProfileKnowledgeAreaTree();
      areaTree.value = Array.isArray(tree) ? tree : [];
    }
    return;
  }
  // 预加载选项：避免已选值先显示成 id，聚焦后才变成名称
  await ensureOptions();
});
</script>

<style scoped lang="scss">
.profile-select {
  width: 100%;
  font-size: 12px;
}
.age-editor,
.salary-editor {
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
}
.age-editor {
  gap: 12px;
}
.age-editor__slider {
  flex: 1 1 0;
  min-width: 0;
  padding: 0 4px;
}
.age-editor :deep(.q-slider__thumb:not(:hover):not(.q-slider--focus):not([data-age-dragging]) .q-slider__pin) {
  opacity: 0 !important;
}
.age-editor :deep(.q-slider__thumb:hover .q-slider__pin),
.age-editor :deep(.q-slider__thumb.q-slider--focus .q-slider__pin),
.age-editor :deep(.q-slider__thumb[data-age-dragging] .q-slider__pin) {
  opacity: 1 !important;
}
.age-editor :deep(.q-slider__text-container) {
  transform: none !important;
}
.age-editor :deep(.q-slider__pin--h-standard:before) {
  right: auto;
  bottom: 2px;
  left: 50%;
  transform: translateX(-50%);
  border-top: 6px solid currentColor;
  border-right: 6px solid transparent;
  border-bottom: 0;
  border-left: 6px solid transparent;
}
.age-editor__value {
  flex: 0 0 auto;
  min-width: 82px;
  color: #404040;
  font-size: 12px;
  font-weight: 500;
  text-align: right;
  white-space: nowrap;
}
.salary-editor {
  gap: 8px;
}
.salary-editor__inputs {
  display: flex;
  align-items: center;
  flex: 1 1 0;
  min-width: 0;
  gap: 6px;
}
.salary-editor__input {
  flex: 1 1 0;
  width: 0;
  min-width: 52px;
  height: 32px;
  box-sizing: border-box;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 0 8px;
  color: #262626;
  font-size: 12px;
  line-height: 30px;
  text-align: center;
  outline: none;
  background: #fff;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
.salary-editor__input:focus {
  border-color: #14b8a6;
  box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.12);
}
.salary-editor__separator {
  flex: 0 0 auto;
  color: #a1a1aa;
  font-size: 12px;
}
.salary-editor__unit {
  flex: 0 0 auto;
  color: #52525b;
  font-size: 12px;
  font-weight: 500;
}
</style>
