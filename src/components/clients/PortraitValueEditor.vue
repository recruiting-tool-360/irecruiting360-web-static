<!--
  职位画像单个维度的值编辑器。
  - local-gender：本地固定 不限/男/女，多选
  - initialize：最高学历 / 第一学历 / 工作稳定性（数据源 /knowledge/initialize）
  - remote：模糊搜索多选（/knowledge/search）
  - area：意向工作城市级联多选
  - range-age / range-salary：区间选择（16-65 岁 / 1-200K）
  直接修改传入的 item（display_value / dataTypeValue），并 emit change 通知父组件。
-->
<template>
  <AreaCascader
    v-if="dimension.source === 'area'"
    :tree="areaTree"
    :model-value="selectedOf(item)"
    @update:model-value="onAreaChange"
  />

  <div v-else-if="isRange" class="range-editor">
    <q-btn
      dense
      flat
      no-caps
      size="sm"
      class="range-trigger"
      :label="rangeText"
      icon-right="arrow_drop_down"
    />
    <q-menu anchor="bottom left" self="top left">
      <div class="range-panel">
        <div class="range-slider">
          <q-range
            v-model="sliderValue"
            :min="sliderBounds.min"
            :max="sliderBounds.max"
            :step="1"
            color="primary"
            track-size="3px"
            thumb-size="16px"
          />
          <div class="range-scale">
            <button
              type="button"
              class="range-scale__unlimited"
              :class="{ 'is-active': range.min === null }"
              @click="setSideUnlimited('min')"
            >
              不限
            </button>
            <span>{{ rangeBounds.min }}{{ rangeUnit }} - {{ rangeBounds.max }}{{ rangeUnit }}</span>
            <button
              type="button"
              class="range-scale__unlimited"
              :class="{ 'is-active': range.max === null }"
              @click="setSideUnlimited('max')"
            >
              不限
            </button>
          </div>
        </div>
        <div class="range-preview">{{ rangeText }}</div>
      </div>
    </q-menu>
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
import { computed, nextTick, onMounted, ref } from "vue";
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
const isRange = computed(
  () => props.dimension.source === "range-age" || props.dimension.source === "range-salary"
);

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
const rangeUnit = computed(() => (props.dimension.source === "range-salary" ? "K" : "岁"));

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

/** 点击左右两端的「不限」：单独清空下限或上限 */
function setSideUnlimited(side) {
  if (side === "min") commitRange(null, range.value.max);
  else commitRange(range.value.min, null);
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

/* ===== 城市 ===== */

function onAreaChange(list) {
  setSelected(props.item, list);
  setDisplay(
    props.item,
    (list || []).map((opt) => opt.dataTypeValueName)
  );
  notifyChange();
}

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
.range-editor {
  width: 100%;
}
.range-trigger {
  width: 100%;
  height: 32px;
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  color: #262626;
  font-size: 12px;
  background: #fff;
  text-transform: none;
}
.range-trigger :deep(.q-btn__content) {
  justify-content: space-between;
  width: 100%;
}
.range-trigger :deep(.q-icon) {
  color: #a3a3a3;
  font-size: 18px;
}
.range-panel {
  padding: 16px 18px 12px;
  width: 300px;
}
.range-slider {
  padding: 0 4px;
}
.range-scale {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 2px;
  font-size: 11px;
  color: #bfbfbf;
}
.range-scale__unlimited {
  padding: 0;
  border: 0;
  background: transparent;
  color: #8c8c8c;
  font-size: 11px;
  cursor: pointer;
}
.range-scale__unlimited:hover,
.range-scale__unlimited.is-active {
  color: var(--q-primary);
}
.range-preview {
  margin-top: 8px;
  text-align: center;
  font-size: 12px;
  font-weight: 500;
  color: #262626;
}
</style>
