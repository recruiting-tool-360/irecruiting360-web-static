<template>
  <div class="search-tags-container q-px-md">
    <!-- 专业技能标签 -->
    <div class="tag-section" v-if="modelValue.criteria">
      <div class="row no-wrap items-center" ref="skillsContainer">
        <!-- 专业技能编辑按钮 - 仅显示文本，不可点击 -->
        <div class="text-body2 text-grey-8 text-bold q-pa-sm">
          <q-icon name="engineering" size="xs" class="q-mr-xs"></q-icon>
          专业技能:
        </div>

        <template v-for="(item, index) in visibleSkills" :key="'skill-'+index">
          <q-chip
            ref="skillRefs"
            ref-for
            class="q-mr-xs"
            text-color="white"
            square
            :style="getChipStyle(item)"
            style="background-color: var(--q-primary-80)"
          >
            <div class="ellipsis" style="max-width: 100%">
              {{ item }}
            </div>
            <q-tooltip class="text-body2">
              {{ item }}
              <div class="text-caption">点击"修改所有标签"编辑</div>
            </q-tooltip>
          </q-chip>
        </template>

        <q-chip
          v-if="showSkillsEllipsis"
          color="grey-3"
          text-color="grey-8"
          square
        >
          ...
          <q-tooltip>
            还有更多专业技能标签，点击"修改所有标签"查看全部
          </q-tooltip>
        </q-chip>
      </div>
    </div>

    <!-- 软实力标签 -->
    <div class="tag-section q-mt-sm" v-if="modelValue.criteria">
      <div class="row no-wrap items-center" ref="softSkillsContainer">
        <!-- 软实力编辑按钮 - 仅显示文本，不可点击 -->
        <div class="text-body2 text-grey-8 text-bold q-pa-sm">
          <q-icon name="psychology" size="xs" class="q-mr-xs"></q-icon>
          软实力:
        </div>

        <template v-for="(item, index) in visibleSoftSkills" :key="'soft-'+index">
          <q-chip
            ref="softSkillRefs"
            ref-for
            class="q-mr-xs"
            color="teal-4"
            text-color="white"
            square
            :style="getChipStyle(item)"
          >
            <div class="ellipsis" style="max-width: 100%">
              {{ item }}
            </div>
            <q-tooltip class="text-body2">
              {{ item }}
              <div class="text-caption">点击"修改所有标签"编辑</div>
            </q-tooltip>
          </q-chip>
        </template>

        <q-chip
          v-if="showSoftSkillsEllipsis"
          color="grey-3"
          text-color="grey-8"
          square
        >
          ...
          <q-tooltip>
            还有更多软实力标签，点击"修改所有标签"查看全部
          </q-tooltip>
        </q-chip>
      </div>
    </div>

    <!-- 工作经验标签 -->
    <div class="tag-section q-mt-sm" v-if="modelValue.criteria">
      <div class="row no-wrap items-center" ref="workExpContainer">
        <!-- 工作经验编辑按钮 - 仅显示文本，不可点击 -->
        <div class="text-body2 text-grey-8 text-bold q-pa-sm">
          <q-icon name="work_history" size="xs" class="q-mr-xs"></q-icon>
          工作经验:
        </div>

        <template v-for="(item, index) in visibleWorkExp" :key="'exp-'+index">
          <q-chip
            ref="workExpRefs"
            ref-for
            class="q-mr-xs"
            color="deep-orange-4"
            text-color="white"
            square
            :style="getChipStyle(item)"
          >
            <div class="ellipsis" style="max-width: 100%">
              {{ item }}
            </div>
            <q-tooltip class="text-body2">
              {{ item }}
              <div class="text-caption">点击"修改所有标签"编辑</div>
            </q-tooltip>
          </q-chip>
        </template>

        <q-chip
          v-if="showWorkExpEllipsis"
          color="grey-3"
          text-color="grey-8"
          square
        >
          ...
          <q-tooltip>
            还有更多工作经验标签，点击"修改所有标签"查看全部
          </q-tooltip>
        </q-chip>
      </div>
    </div>

    <!-- 修改所有按钮 - 在底部 -->
    <div class="row justify-end q-mt-sm">
<!--      <q-btn flat color="primary" icon="edit_note" label="修改所有标签" @click="openAllTagsEditor">-->
<!--        <q-tooltip>-->
<!--          一键编辑所有类型标签（每种类型最多5个）-->
<!--        </q-tooltip>-->
<!--      </q-btn>-->
    </div>

    <!-- 所有标签编辑对话框 -->
    <q-dialog v-model="showAllTagsDialog" persistent maximized>
      <q-card class="column">
        <q-card-section class="row items-center q-pb-none">
          <div class="text-h6">编辑所有标签</div>
          <div class="text-caption q-ml-md text-grey-8">每种类型最多5个标签</div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>

        <q-card-section class="col q-pa-md" style="overflow: auto;">
          <div class="row q-col-gutter-md">
            <!-- 专业技能编辑区域 -->
            <div class="col-12 col-md-4">
              <q-card bordered>
                <q-card-section>
                  <div class="text-h6 text-primary">专业技能</div>
                  <div class="text-caption q-mb-sm">添加或移除专业技能标签（{{editableProSkills.length}}/5）</div>

                  <!-- 当前专业技能标签 -->
                  <div class="row q-col-gutter-sm q-mb-md">
                    <div v-for="(tag, index) in editableProSkills" :key="`pro-${index}`" class="col-12">
                      <q-input
                        v-model="editableProSkills[index]"
                        dense
                        filled
                        class="tag-input"
                        color="primary"
                      >
                        <template v-slot:append>
                          <q-icon name="close" class="cursor-pointer" @click="editableProSkills.splice(index, 1)">
                            <q-tooltip>删除此标签</q-tooltip>
                          </q-icon>
                        </template>
                        <q-tooltip>{{editableProSkills[index]}}</q-tooltip>
                      </q-input>
                    </div>
                  </div>

                  <!-- 添加新专业技能 -->
                  <q-input
                    v-model="newProSkill"
                    dense
                    filled
                    placeholder="输入新的专业技能"
                    color="primary"
                    @keyup.enter="addTag(newProSkill, editableProSkills, () => newProSkill = '')"
                    :disable="editableProSkills.length >= 5"
                  >
                    <template v-slot:append>
                      <q-btn
                        color="primary"
                        round
                        dense
                        flat
                        icon="add"
                        @click="addTag(newProSkill, editableProSkills, () => newProSkill = '')"
                        :disable="!newProSkill.trim() || editableProSkills.length >= 5"
                      >
                        <q-tooltip>
                          添加新标签（最多5个）
                        </q-tooltip>
                      </q-btn>
                    </template>
                    <template v-slot:hint v-if="editableProSkills.length >= 5">
                      已达到最大标签数量限制
                    </template>
                    <q-tooltip>
                      输入新的专业技能标签，按回车或点击加号添加
                    </q-tooltip>
                  </q-input>

                  <!-- 推荐专业技能 -->
                  <div class="q-mt-md">
                    <div class="text-caption text-grey-8 q-mb-sm">
                      推荐专业技能:
                      <q-tooltip anchor="top middle" self="bottom middle" class="bg-grey-9">
                        点击推荐标签快速添加（最多添加5个标签）
                      </q-tooltip>
                    </div>
                    <div class="row q-col-gutter-xs">
                      <div v-for="(preset, index) in professionalSkillsPresets" :key="'pro-preset-'+index" class="col-auto">
                        <q-chip
                          color="primary"
                          text-color="white"
                          clickable
                          square
                          @click="addTag(preset, editableProSkills)"
                          :disable="editableProSkills.length >= 5"
                        >
                          {{ preset }}
                          <q-tooltip v-if="editableProSkills.length >= 5">
                            已达到最大标签数量限制
                          </q-tooltip>
                          <q-tooltip v-else-if="editableProSkills.includes(preset)">
                            此标签已添加
                          </q-tooltip>
                          <q-tooltip v-else>
                            点击添加此标签
                          </q-tooltip>
                        </q-chip>
                      </div>
                    </div>
                  </div>
                </q-card-section>
              </q-card>
            </div>

            <!-- 软实力编辑区域 -->
            <div class="col-12 col-md-4">
              <q-card bordered>
                <q-card-section>
                  <div class="text-h6 text-teal-4">软实力</div>
                  <div class="text-caption q-mb-sm">添加或移除软实力标签（{{editableSoftSkills.length}}/5）</div>

                  <!-- 当前软实力标签 -->
                  <div class="row q-col-gutter-sm q-mb-md">
                    <div v-for="(tag, index) in editableSoftSkills" :key="`soft-${index}`" class="col-12">
                      <q-input
                        v-model="editableSoftSkills[index]"
                        dense
                        filled
                        class="tag-input"
                        color="teal-4"
                      >
                        <template v-slot:append>
                          <q-icon name="close" class="cursor-pointer" @click="editableSoftSkills.splice(index, 1)">
                            <q-tooltip>删除此标签</q-tooltip>
                          </q-icon>
                        </template>
                        <q-tooltip>{{editableSoftSkills[index]}}</q-tooltip>
                      </q-input>
                    </div>
                  </div>

                  <!-- 添加新软实力 -->
                  <q-input
                    v-model="newSoftSkill"
                    dense
                    filled
                    placeholder="输入新的软实力"
                    color="teal-4"
                    @keyup.enter="addTag(newSoftSkill, editableSoftSkills, () => newSoftSkill = '')"
                    :disable="editableSoftSkills.length >= 5"
                  >
                    <template v-slot:append>
                      <q-btn
                        color="teal-4"
                        round
                        dense
                        flat
                        icon="add"
                        @click="addTag(newSoftSkill, editableSoftSkills, () => newSoftSkill = '')"
                        :disable="!newSoftSkill.trim() || editableSoftSkills.length >= 5"
                      >
                        <q-tooltip>
                          添加新标签（最多5个）
                        </q-tooltip>
                      </q-btn>
                    </template>
                    <template v-slot:hint v-if="editableSoftSkills.length >= 5">
                      已达到最大标签数量限制
                    </template>
                    <q-tooltip>
                      输入新的软实力标签，按回车或点击加号添加
                    </q-tooltip>
                  </q-input>

                  <!-- 推荐软实力 -->
                  <div class="q-mt-md">
                    <div class="text-caption text-grey-8 q-mb-sm">
                      推荐软实力:
                      <q-tooltip anchor="top middle" self="bottom middle" class="bg-grey-9">
                        点击推荐标签快速添加（最多添加5个标签）
                      </q-tooltip>
                    </div>
                    <div class="row q-col-gutter-xs">
                      <div v-for="(preset, index) in softSkillsPresets" :key="'soft-preset-'+index" class="col-auto">
                        <q-chip
                          color="teal-4"
                          text-color="white"
                          clickable
                          square
                          @click="addTag(preset, editableSoftSkills)"
                          :disable="editableSoftSkills.length >= 5"
                        >
                          {{ preset }}
                          <q-tooltip v-if="editableSoftSkills.length >= 5">
                            已达到最大标签数量限制
                          </q-tooltip>
                          <q-tooltip v-else-if="editableSoftSkills.includes(preset)">
                            此标签已添加
                          </q-tooltip>
                          <q-tooltip v-else>
                            点击添加此标签
                          </q-tooltip>
                        </q-chip>
                      </div>
                    </div>
                  </div>
                </q-card-section>
              </q-card>
            </div>

            <!-- 工作经验编辑区域 -->
            <div class="col-12 col-md-4">
              <q-card bordered>
                <q-card-section>
                  <div class="text-h6 text-deep-orange-4">工作经验</div>
                  <div class="text-caption q-mb-sm">添加或移除工作经验标签（{{editableWorkExp.length}}/5）</div>

                  <!-- 当前工作经验标签 -->
                  <div class="row q-col-gutter-sm q-mb-md">
                    <div v-for="(tag, index) in editableWorkExp" :key="`exp-${index}`" class="col-12">
                      <q-input
                        v-model="editableWorkExp[index]"
                        dense
                        filled
                        class="tag-input"
                        color="deep-orange-4"
                      >
                        <template v-slot:append>
                          <q-icon name="close" class="cursor-pointer" @click="editableWorkExp.splice(index, 1)">
                            <q-tooltip>删除此标签</q-tooltip>
                          </q-icon>
                        </template>
                        <q-tooltip>{{editableWorkExp[index]}}</q-tooltip>
                      </q-input>
                    </div>
                  </div>

                  <!-- 添加新工作经验 -->
                  <q-input
                    v-model="newWorkExp"
                    dense
                    filled
                    placeholder="输入新的工作经验"
                    color="deep-orange-4"
                    @keyup.enter="addTag(newWorkExp, editableWorkExp, () => newWorkExp = '')"
                    :disable="editableWorkExp.length >= 5"
                  >
                    <template v-slot:append>
                      <q-btn
                        color="deep-orange-4"
                        round
                        dense
                        flat
                        icon="add"
                        @click="addTag(newWorkExp, editableWorkExp, () => newWorkExp = '')"
                        :disable="!newWorkExp.trim() || editableWorkExp.length >= 5"
                      >
                        <q-tooltip>
                          添加新标签（最多5个）
                        </q-tooltip>
                      </q-btn>
                    </template>
                    <template v-slot:hint v-if="editableWorkExp.length >= 5">
                      已达到最大标签数量限制
                    </template>
                    <q-tooltip>
                      输入新的工作经验标签，按回车或点击加号添加
                    </q-tooltip>
                  </q-input>

                  <!-- 推荐工作经验 -->
                  <div class="q-mt-md">
                    <div class="text-caption text-grey-8 q-mb-sm">
                      推荐工作经验:
                      <q-tooltip anchor="top middle" self="bottom middle" class="bg-grey-9">
                        点击推荐标签快速添加（最多添加5个标签）
                      </q-tooltip>
                    </div>
                    <div class="row q-col-gutter-xs">
                      <div v-for="(preset, index) in workExperiencePresets" :key="'exp-preset-'+index" class="col-auto">
                        <q-chip
                          color="deep-orange-4"
                          text-color="white"
                          clickable
                          square
                          @click="addTag(preset, editableWorkExp)"
                          :disable="editableWorkExp.length >= 5"
                        >
                          {{ preset }}
                          <q-tooltip v-if="editableWorkExp.length >= 5">
                            已达到最大标签数量限制
                          </q-tooltip>
                          <q-tooltip v-else-if="editableWorkExp.includes(preset)">
                            此标签已添加
                          </q-tooltip>
                          <q-tooltip v-else>
                            点击添加此标签
                          </q-tooltip>
                        </q-chip>
                      </div>
                    </div>
                  </div>
                </q-card-section>
              </q-card>
            </div>
          </div>
        </q-card-section>

        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="取消" color="grey-7" v-close-popup />
          <q-btn flat label="保存所有" color="primary" @click="saveAllTags" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, nextTick, computed, onUnmounted } from 'vue';
import { useQuasar } from 'quasar';
import notify from "src/util/notify";

// 接收searchState作为props并支持双向绑定
const props = defineProps({
  modelValue: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(['update:modelValue']);
const $q = useQuasar();

// 确保criteria对象存在但不直接修改props
const ensureCriteria = () => {
  if (!props.modelValue.criteria) {
    const updatedValue = {
      ...props.modelValue,
      criteria: {
        professional_skills: [],
        soft_skills: [],
        work_experience: []
      }
    };
    emit('update:modelValue', updatedValue);
  }
};

// 初始化时确保criteria存在
ensureCriteria();

// 创建计算属性以允许标签更新
const professionalSkills = computed({
  get: () => props.modelValue.criteria?.professional_skills || [],
  set: (value) => {
    const updatedValue = { ...props.modelValue };
    if (!updatedValue.criteria) updatedValue.criteria = {};
    updatedValue.criteria.professional_skills = value;
    emit('update:modelValue', updatedValue);
  }
});

const softSkills = computed({
  get: () => props.modelValue.criteria?.soft_skills || [],
  set: (value) => {
    const updatedValue = { ...props.modelValue };
    if (!updatedValue.criteria) updatedValue.criteria = {};
    updatedValue.criteria.soft_skills = value;
    emit('update:modelValue', updatedValue);
  }
});

const workExperience = computed({
  get: () => props.modelValue.criteria?.work_experience || [],
  set: (value) => {
    const updatedValue = { ...props.modelValue };
    if (!updatedValue.criteria) updatedValue.criteria = {};
    updatedValue.criteria.work_experience = value;
    emit('update:modelValue', updatedValue);
  }
});

// 预设标签
const professionalSkillsPresets = ref([
  'JavaScript', 'Vue.js', 'React', 'Angular', 'Node.js',
  'Java', 'Python', 'C++', 'C#', '.NET', 'SQL', 'NoSQL',
  'Docker', 'Kubernetes', 'AWS', 'Azure', 'DevOps'
]);

const softSkillsPresets = ref([
  '团队协作', '沟通能力', '解决问题', '时间管理',
  '领导力', '适应能力', '创新思维', '批判性思考'
]);

const workExperiencePresets = ref([
  '前端开发', '后端开发', '全栈开发', '移动开发',
  '数据分析', '产品管理', '项目管理', 'UI/UX设计'
]);

// 专业技能相关
const skillRefs = ref([]);
const skillsContainer = ref(null);
const visibleSkills = ref([]);
const showSkillsEllipsis = ref(false);

// 软实力相关
const softSkillRefs = ref([]);
const softSkillsContainer = ref(null);
const visibleSoftSkills = ref([]);
const showSoftSkillsEllipsis = ref(false);

// 工作经验相关
const workExpRefs = ref([]);
const workExpContainer = ref(null);
const visibleWorkExp = ref([]);
const showWorkExpEllipsis = ref(false);

// 根据内容长度计算标签样式
const getChipStyle = (item) => {
  if (item.length < 20) {
    return { };
  } else {
    return { 'max-width': '8rem' };
  }
};

// 计算可见标签的通用方法
const calculateVisibleChips = (containerRef, itemRefs, allItems, visibleItemsRef, showEllipsisRef) => {
  if (!containerRef.value) return;
  
  // 确保容器已经完全渲染并有正确的宽度
  const containerWidth = containerRef.value.offsetWidth;
  if (containerWidth <= 0) {
    // 如果容器宽度为0，可能是因为容器还没有完全展开
    // 设置一个短暂的延迟后重试
    setTimeout(() => {
      calculateVisibleChips(containerRef, itemRefs, allItems, visibleItemsRef, showEllipsisRef);
    }, 100);
    return;
  }
  
  const titleElement = containerRef.value.querySelector('.text-body2') ||
                        containerRef.value.querySelector('button');
  const titleWidth = titleElement ? titleElement.offsetWidth + 8 : 0;

  // 保留更多空间给标签显示
  const availableWidth = containerWidth - titleWidth - 60;
  
  // 如果可用宽度太小，至少显示一个标签
  if (availableWidth <= 100 && allItems.length > 0) {
    visibleItemsRef.value = [allItems[0]];
    showEllipsisRef.value = allItems.length > 1;
    return;
  }

  let tempVisibleTags = [];
  let totalWidth = 0;
  
  // 如果没有足够的 itemRefs，先显示所有标签
  if (!itemRefs.value || itemRefs.value.length < allItems.length) {
    visibleItemsRef.value = [...allItems];
    showEllipsisRef.value = false;
    
    // 在下一个渲染周期重新计算
    nextTick(() => {
      calculateVisibleChips(containerRef, itemRefs, allItems, visibleItemsRef, showEllipsisRef);
    });
    return;
  }

  for (let i = 0; i < allItems.length; i++) {
    if (i >= itemRefs.value.length) continue;

    const chip = itemRefs.value[i];
    if (!chip || !chip.$el) continue;

    const chipWidth = chip.$el.offsetWidth + 8;

    if (totalWidth + chipWidth <= availableWidth) {
      tempVisibleTags.push(allItems[i]);
      totalWidth += chipWidth;
    } else {
      break;
    }
  }

  // 确保至少显示一个标签
  if (tempVisibleTags.length === 0 && allItems.length > 0) {
    tempVisibleTags.push(allItems[0]);
  }

  visibleItemsRef.value = tempVisibleTags;
  showEllipsisRef.value = tempVisibleTags.length < allItems.length;
};

// 初始化函数
const initializeTagSection = (allItems, visibleItemsRef, containerRef, itemRefs, showEllipsisRef) => {
  visibleItemsRef.value = [...allItems];

  nextTick(() => {
    calculateVisibleChips(containerRef, itemRefs, allItems, visibleItemsRef, showEllipsisRef);

    if (containerRef.value) {
      const resizeObserver = new ResizeObserver(() => {
        calculateVisibleChips(containerRef, itemRefs, allItems, visibleItemsRef, showEllipsisRef);
      });
      resizeObserver.observe(containerRef.value);
    }
  });
};

// 监听标签数据变化，重新计算可见标签
watch(() => professionalSkills.value, (newVal) => {
  if (newVal && newVal.length) {
    initializeTagSection(newVal, visibleSkills, skillsContainer, skillRefs, showSkillsEllipsis);
  } else {
    visibleSkills.value = [];
    showSkillsEllipsis.value = false;
  }
}, { deep: true, immediate: true });

watch(() => softSkills.value, (newVal) => {
  if (newVal && newVal.length) {
    initializeTagSection(newVal, visibleSoftSkills, softSkillsContainer, softSkillRefs, showSoftSkillsEllipsis);
  } else {
    visibleSoftSkills.value = [];
    showSoftSkillsEllipsis.value = false;
  }
}, { deep: true, immediate: true });

watch(() => workExperience.value, (newVal) => {
  if (newVal && newVal.length) {
    initializeTagSection(newVal, visibleWorkExp, workExpContainer, workExpRefs, showWorkExpEllipsis);
  } else {
    visibleWorkExp.value = [];
    showWorkExpEllipsis.value = false;
  }
}, { deep: true, immediate: true });

// 组件挂载时初始化
onMounted(() => {
  // 使用计算属性获取值
  if (professionalSkills.value.length) {
    initializeTagSection(professionalSkills.value, visibleSkills, skillsContainer, skillRefs, showSkillsEllipsis);
  }

  if (softSkills.value.length) {
    initializeTagSection(softSkills.value, visibleSoftSkills, softSkillsContainer, softSkillRefs, showSoftSkillsEllipsis);
  }

  if (workExperience.value.length) {
    initializeTagSection(workExperience.value, visibleWorkExp, workExpContainer, workExpRefs, showWorkExpEllipsis);
  }
  
  // 添加窗口大小变化的监听器
  window.addEventListener('resize', recalculateAllTags);
});

// 组件卸载时移除监听器
onUnmounted(() => {
  window.removeEventListener('resize', recalculateAllTags);
});

// 所有标签编辑对话框
const showAllTagsDialog = ref(false);

// 所有标签编辑相关
const editableProSkills = ref([]);
const editableSoftSkills = ref([]);
const editableWorkExp = ref([]);
const newProSkill = ref('');
const newSoftSkill = ref('');
const newWorkExp = ref('');

// 添加新标签
const addTag = (tag, array, callback) => {
  if (tag && tag.trim()) {
    const trimmedTag = tag.trim();

    // 检查标签数量限制
    if (array.length >= 5) {
      // $q.notify({
      //   color: 'negative',
      //   message: '每种类型最多只能添加5个标签',
      //   icon: 'warning',
      //   position: 'top',
      //   timeout: 2000
      // });
      notify.info('每种类型最多只能添加5个标签');
      return;
    }

    // 检查是否重复
    if (!array.includes(trimmedTag)) {
      array.push(trimmedTag);
      if (callback && typeof callback === 'function') {
        callback();
      }
    } else {
      // $q.notify({
      //   color: 'negative',
      //   message: '该标签已存在',
      //   icon: 'warning',
      //   position: 'top',
      //   timeout: 2000
      // });
      notify.info('该标签已存在');
    }
  }
};

// 打开所有标签编辑对话框
const openAllTagsEditor = () => {
  showAllTagsDialog.value = true;
  editableProSkills.value = [...professionalSkills.value];
  editableSoftSkills.value = [...softSkills.value];
  editableWorkExp.value = [...workExperience.value];
};

// 保存所有标签
const saveAllTags = () => {
  professionalSkills.value = [...editableProSkills.value];
  softSkills.value = [...editableSoftSkills.value];
  workExperience.value = [...editableWorkExp.value];
  showAllTagsDialog.value = false;
};

// 添加一个方法来手动重新计算所有标签的可见性
const recalculateAllTags = () => {
  nextTick(() => {
    if (professionalSkills.value.length) {
      calculateVisibleChips(skillsContainer, skillRefs, professionalSkills.value, visibleSkills, showSkillsEllipsis);
    }
    
    if (softSkills.value.length) {
      calculateVisibleChips(softSkillsContainer, softSkillRefs, softSkills.value, visibleSoftSkills, showSoftSkillsEllipsis);
    }
    
    if (workExperience.value.length) {
      calculateVisibleChips(workExpContainer, workExpRefs, workExperience.value, visibleWorkExp, showWorkExpEllipsis);
    }
  });
};

// 暴露给父组件的方法
defineExpose({
  openAllTagsEditor,
  recalculateAllTags
});
</script>

<style scoped>
.search-tags-container {
  width: 100%;
}

.tag-section {
  width: 100%;
}

.ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
