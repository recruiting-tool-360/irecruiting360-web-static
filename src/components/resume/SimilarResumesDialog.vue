<template>
  <q-dialog ref="dialogRef" maximized persistent>
    <q-card class="similar-resumes-dialog">
      <q-card-section class="row items-center q-pb-none fixed-header">
        <div class="text-h6">相似简历结果</div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-card-section class="content-section">
        <div class="text-subtitle1 q-mb-md text-grey-8">
          找到 {{ similarResumes.length }} 个与 "{{ originalResume?.name || '当前简历' }}" 相似的简历
        </div>

        <div v-if="isLoading" class="flex flex-center q-pa-xl">
          <q-spinner color="primary" size="3em" />
          <div class="q-ml-sm text-subtitle1">正在加载相似简历...</div>
        </div>

        <div v-else-if="similarResumes.length === 0" class="flex flex-center column q-pa-xl">
          <q-icon name="search_off" size="4em" color="grey-5" />
          <div class="text-subtitle1 q-mt-md text-grey-7">未找到相似简历</div>
        </div>

        <q-list separator v-else>
          <div v-for="(resume, index) in similarResumes" :key="index">
            <similar-resume-card
              :resume="resume"
              @detail="$emit('detail', resume)"
              @collect="$emit('collect', resume)"
              @read="$emit('read', resume)"
              @download="$emit('download', resume)"
              @contact="$emit('contact', resume)"
              @blacklist="$emit('blacklist', resume)"
              @interview="$emit('interview', resume)"
            />
          </div>
        </q-list>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { defineProps, defineEmits, ref } from 'vue';
import SimilarResumeCard from './SimilarResumeCard.vue';

const props = defineProps({
  similarResumes: {
    type: Array,
    default: () => []
  },
  originalResume: {
    type: Object,
    default: null
  },
  isLoading: {
    type: Boolean,
    default: false
  }
});

defineEmits([
  'detail',
  'collect',
  'read',
  'download',
  'contact',
  'blacklist',
  'interview'
]);

// 为了保持与 useDialogPluginComponent 兼容，提供一个空的 onDialogHide 函数
// 在 ResumeCard.vue 中使用 $q.dialog().onOk 或 onCancel 时需要此函数
const onDialogHide = () => {};

// 暴露给父组件的方法
defineExpose({
  // 这些方法可以被父组件通过 ref 调用
  onDialogHide
});
</script>

<style scoped>
.similar-resumes-dialog {
  width: 100%;
  max-width: 100%;
  max-height: 90vh;
  position: relative;
}

.fixed-header {
  position: sticky;
  top: 0;
  background-color: white;
  z-index: 100;
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
  padding: 16px 24px;
}

.content-section {
  padding-top: 8px;
  overflow-y: auto;
}

@media (min-width: 1024px) {
  .similar-resumes-dialog {
    width: 90%;
    max-width: 1200px;
  }
}
</style>
