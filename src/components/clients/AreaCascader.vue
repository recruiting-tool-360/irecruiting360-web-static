<!--
  意向工作城市：省 / 市 / 区三级级联多选。
  数据源：GET /ihire/profile/knowledge/area/tree（父组件传入 tree）。
  选中结果以 [{ dataTypeId, dataTypeValueName }] 形式回传。
-->
<template>
  <div class="area-cascader">
    <div class="area-chips">
      <span v-if="selected.length === 0" class="area-placeholder">不限</span>
      <span v-for="opt in selected" :key="opt.dataTypeId" class="area-chip">
        {{ opt.dataTypeValueName }}
        <button type="button" class="area-chip-remove" @click.stop="removeOption(opt)">×</button>
      </span>
    </div>
    <q-btn dense flat no-caps size="sm" class="area-picker-btn" label="选择" />
    <q-menu anchor="bottom left" self="top left" class="area-menu">
      <div class="area-panel">
        <div class="area-col">
          <div class="area-col-title">省份</div>
          <div
            v-for="province in tree"
            :key="province.dataTypeId"
            class="area-node"
            :class="{ active: activeProvince === province.dataTypeId }"
            @click="activeProvince = province.dataTypeId"
          >
            <q-checkbox
              dense
              size="xs"
              :model-value="isSelected(province.dataTypeId)"
              @click.stop
              @update:model-value="toggleOption(province)"
            />
            <span class="area-node-name">{{ province.dataTypeValueName }}</span>
            <span class="area-arrow">›</span>
          </div>
        </div>

        <div v-if="activeProvinceNode" class="area-col">
          <div class="area-col-title">城市</div>
          <div
            v-for="city in activeProvinceNode.children || []"
            :key="city.dataTypeId"
            class="area-node"
            :class="{ active: activeCity === city.dataTypeId }"
            @click="activeCity = city.dataTypeId"
          >
            <q-checkbox
              dense
              size="xs"
              :model-value="isSelected(city.dataTypeId)"
              @click.stop
              @update:model-value="toggleOption(city)"
            />
            <span class="area-node-name">{{ city.dataTypeValueName }}</span>
            <span v-if="(city.children || []).length" class="area-arrow">›</span>
          </div>
        </div>

        <div v-if="activeCityNode" class="area-col">
          <div class="area-col-title">区县</div>
          <div
            v-for="district in activeCityNode.children || []"
            :key="district.dataTypeId"
            class="area-node"
            @click="toggleOption(district)"
          >
            <q-checkbox
              dense
              size="xs"
              :model-value="isSelected(district.dataTypeId)"
              @click.stop
              @update:model-value="toggleOption(district)"
            />
            <span class="area-node-name">{{ district.dataTypeValueName }}</span>
          </div>
          <div v-if="!(activeCityNode.children || []).length" class="area-empty">暂无区县</div>
        </div>
      </div>
      <div class="area-footer">
        <span class="area-tip">已选 {{ selected.length }} 项</span>
        <q-btn dense flat no-caps size="sm" label="清空（不限）" @click="clearAll" />
      </div>
    </q-menu>
  </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";

const props = defineProps({
  /** area/tree 返回的省份数组 */
  tree: {
    type: Array,
    default: () => []
  },
  /** [{ dataTypeId, dataTypeValueName }] */
  modelValue: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(["update:modelValue"]);

const activeProvince = ref(null);
const activeCity = ref(null);

const selected = computed(() => props.modelValue || []);

const activeProvinceNode = computed(() => {
  if (!activeProvince.value) return null;
  return (props.tree || []).find((p) => p.dataTypeId === activeProvince.value) || null;
});

const activeCityNode = computed(() => {
  if (!activeProvinceNode.value || !activeCity.value) return null;
  return (
    (activeProvinceNode.value.children || []).find((c) => c.dataTypeId === activeCity.value) || null
  );
});

watch(activeProvince, () => {
  activeCity.value = null;
});

function isSelected(id) {
  return selected.value.some((opt) => String(opt.dataTypeId) === String(id));
}

function toggleOption(node) {
  if (!node) return;
  const exists = isSelected(node.dataTypeId);
  const next = exists
    ? selected.value.filter((opt) => String(opt.dataTypeId) !== String(node.dataTypeId))
    : [...selected.value, { dataTypeId: node.dataTypeId, dataTypeValueName: node.dataTypeValueName }];
  emit("update:modelValue", next);
}

function removeOption(opt) {
  emit(
    "update:modelValue",
    selected.value.filter((item) => String(item.dataTypeId) !== String(opt.dataTypeId))
  );
}

function clearAll() {
  emit("update:modelValue", []);
}
</script>

<style scoped lang="scss">
.area-cascader {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  width: 100%;
  min-height: 32px;
  padding: 3px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #fff;
  box-sizing: border-box;
}
.area-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
}
.area-placeholder {
  color: #bfbfbf;
  font-size: 12px;
}
.area-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 20px;
  padding: 0 6px;
  border-radius: 4px;
  background: #f5f5f5;
  color: #404040;
  font-size: 12px;
  border: 0;
}
.area-chip-remove {
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
}
.area-picker-btn {
  color: #0d9488;
  flex-shrink: 0;
  font-size: 12px;
}
.area-menu {
  margin-top: 4px;
}
.area-panel {
  display: flex;
  height: 280px;
  min-width: 520px;
}
.area-col {
  flex: 1;
  min-width: 160px;
  overflow-y: auto;
  border-right: 1px solid #f1f5f9;
  padding: 6px 4px;
}
.area-col:last-child {
  border-right: 0;
}
.area-col-title {
  padding: 2px 8px 6px;
  font-size: 11px;
  color: #94a3b8;
}
.area-node {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  color: #334155;
}
.area-node:hover {
  background: #f0fdfa;
}
.area-node.active {
  background: #ccfbf1;
  color: #0f766e;
}
.area-node-name {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.area-arrow {
  color: #94a3b8;
}
.area-empty {
  padding: 12px 8px;
  font-size: 12px;
  color: #cbd5e1;
}
.area-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-top: 1px solid #f1f5f9;
}
.area-tip {
  font-size: 11px;
  color: #94a3b8;
}
</style>
