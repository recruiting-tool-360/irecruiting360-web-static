<template>
  <q-dialog v-model="localVisible" persistent>
    <q-card style="min-width: 600px">
      <q-card-section class="row items-center">
        <div class="text-h6">{{ dialogTitle }}</div>
        <q-space />
        <q-badge color="primary" outline>已选择 {{ selectedResumes.length }} 份简历</q-badge>
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-separator />

      <q-card-section style="max-height: 50vh" class="scroll">
        <q-list separator>
          <q-item v-for="resume in selectedResumes" :key="resume.id">
            <q-item-section avatar>
              <q-avatar>
                <img :src="`${resume.gender === 1 ? '/index/header/icons/geekMan.svg' : '/index/header/icons/geekWoman.svg'}`" />
              </q-avatar>
            </q-item-section>
            <q-item-section>
              <q-item-label>{{ resume.name }}</q-item-label>
              <q-item-label caption>
                <span>{{ resume.gender === 1 ? '男' : '女' }}</span>
                <span class="q-ml-sm">{{ resume.ageDesc }}</span>
                <span class="q-ml-sm">{{ resume.experienceYear === -1 ? '应届生' : `${resume.experienceYear}年经验` }}</span>
                <span class="q-ml-sm">{{ resume.degree }}</span>
                <span class="q-ml-sm">{{ resume.status }}</span>
                <span class="q-ml-sm">{{ resume.intention || '' }}</span>
              </q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-badge color="primary">评分: {{ resume.score }}</q-badge>
            </q-item-section>
          </q-item>
        </q-list>

        <div v-if="selectedResumes.length === 0" class="text-center q-pa-md">
          <q-icon name="sentiment_dissatisfied" size="2rem" color="grey-7" />
          <p class="text-grey-7">没有符合条件的简历</p>
        </div>
      </q-card-section>

      <q-separator />

      <q-card-actions align="right">
        <q-btn flat label="取消" color="grey-7" v-close-popup />
        <q-btn flat :label="confirmButtonText" color="primary" @click="confirmAction" :disable="selectedResumes.length === 0" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue';

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  selectedResumes: {
    type: Array,
    default: () => []
  },
  type: {
    type: String,
    default: 'talent-pool' // 'talent-pool' 或 'assign-position'
  }
});

const emit = defineEmits(['update:visible', 'confirm']);

const localVisible = computed({
  get: () => props.visible,
  set: (value) => emit('update:visible', value)
});

// 根据类型计算对话框标题
const dialogTitle = computed(() => {
  return props.type === 'talent-pool' ? '批量加入人才库' : '批量分配职位';
});

// 根据类型计算确认按钮文本
const confirmButtonText = computed(() => {
  return props.type === 'talent-pool' ? '确认加入' : '确认分配';
});

// 确认操作
const confirmAction = () => {
  console.log(`${dialogTitle.value}:`, props.selectedResumes);
  emit('confirm', { type: props.type, resumes: props.selectedResumes });
  localVisible.value = false;
};
</script>

<style lang="sass" scoped>
// 可以添加自定义样式
</style> 