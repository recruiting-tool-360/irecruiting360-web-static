<template>
  <div>
    <!-- 编辑按钮，点击后打开对话框 -->
    <q-btn flat class="text-body2 text-grey-8 text-bold q-pa-sm" @click="openDialog">
      <q-icon name="edit" size="xs" class="q-mr-xs"></q-icon>
      {{ title }}:
    </q-btn>
    <!-- 编辑对话框 -->
    <q-dialog v-model="isDialogOpen" persistent>
      <q-card style="min-width: 350px; max-width: 80vw;">
        <q-card-section class="row items-center q-pb-none">
          <div class="text-h6">编辑{{ title }}</div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>

        <q-card-section class="q-pt-sm">
          <div class="text-caption text-grey-8 q-mb-sm">当前{{ title }}列表:</div>

          <!-- 已有标签编辑区 -->
          <div class="row q-col-gutter-sm">
            <div v-for="(tag, index) in tags" :key="index" class="col-12 col-sm-6 col-md-4">
              <q-input
                v-model="tags[index]"
                dense
                filled
                class="tag-input"
                :color="tagColor"
              >
                <template v-slot:append>
                  <q-icon name="close" class="cursor-pointer" @click="removeTag(index)" />
                </template>
              </q-input>
            </div>
          </div>

          <!-- 添加新标签 -->
          <div class="row q-mt-md">
            <div class="col-12">
              <q-input
                v-model="newTag"
                dense
                filled
                placeholder="输入新的标签内容"
                :color="tagColor"
                @keyup.enter="addTag"
              >
                <template v-slot:append>
                  <q-btn
                    :color="tagColor"
                    round
                    dense
                    flat
                    icon="add"
                    @click="addTag"
                    :disable="!newTag.trim()"
                  />
                </template>
              </q-input>
            </div>
          </div>

          <!-- 预设标签 -->
          <div class="q-mt-md" v-if="presetTags.length > 0">
            <div class="text-caption text-grey-8 q-mb-sm">推荐{{ title }}:</div>
            <div class="row q-col-gutter-xs">
              <div v-for="(preset, index) in presetTags" :key="'preset-'+index" class="col-auto">
                <q-chip
                  :color="tagColor"
                  text-color="white"
                  clickable
                  square
                  @click="addPresetTag(preset)"
                >
                  {{ preset }}
                </q-chip>
              </div>
            </div>
          </div>
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat label="取消" color="grey-7" v-close-popup />
          <q-btn flat label="确认" :color="tagColor" @click="saveTags" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useQuasar } from 'quasar';

const $q = useQuasar();

const props = defineProps({
  modelValue: {
    type: Array,
    default: () => []
  },
  title: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true,
    validator: (value) => ['professional_skills', 'soft_skills', 'work_experience'].includes(value)
  },
  presetTags: {
    type: Array,
    default: () => []
  },
  color: {
    type: String,
    default: 'primary'
  }
});

const emit = defineEmits(['update:modelValue']);

// 标签列表
const tags = ref([]);
const newTag = ref('');
const isDialogOpen = ref(false);

// 根据类型设置颜色
const tagColor = computed(() => {
  switch (props.type) {
    case 'professional_skills':
      return 'primary';
    case 'soft_skills':
      return 'teal-4';
    case 'work_experience':
      return 'deep-orange-4';
    default:
      return props.color;
  }
});

// 监听modelValue变化
watch(() => props.modelValue, (newVal) => {
  if (newVal) {
    tags.value = [...newVal];
  }
}, { immediate: true, deep: true });

// 打开对话框
const openDialog = () => {
  tags.value = [...props.modelValue];
  newTag.value = '';
  isDialogOpen.value = true;
};

// 添加标签
const addTag = () => {
  if (newTag.value.trim()) {
    // 检查是否已存在相同标签
    if (!tags.value.includes(newTag.value.trim())) {
      tags.value.push(newTag.value.trim());
      newTag.value = '';
    } else {
      $q.notify({
        color: 'negative',
        message: '该标签已存在',
        icon: 'warning'
      });
    }
  }
};

// 添加预设标签
const addPresetTag = (preset) => {
  if (!tags.value.includes(preset)) {
    tags.value.push(preset);
  } else {
    $q.notify({
      color: 'negative',
      message: '该标签已存在',
      icon: 'warning'
    });
  }
};

// 删除标签
const removeTag = (index) => {
  tags.value.splice(index, 1);
};

// 保存标签
const saveTags = () => {
  emit('update:modelValue', tags.value);
};
</script>

<style scoped>
.tag-input {
  border-radius: 4px;
}
</style>
