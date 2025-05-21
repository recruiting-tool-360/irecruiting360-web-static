<template>
  <div class="resume-list relative-position">
    <!-- 批量分享对话框 -->
    <batch-share-dialog
      v-model:visible="showBatchShareDialog"
      :selected-resumes="selectedResumes"
    />
    <!-- 批量加入人才库对话框 -->
    <batch-add-to-talent-pool-dialog
      v-model:visible="showBatchDialog"
      :selected-resumes="filteredSelectedResumes"
      :type="batchDialogType"
      @confirm="handleBatchConfirm"
    />
    <!-- 简历索引侧边栏 -->
    <div v-if="resumeIndexVisible" class="resume-index text-grey-8 overflow-hidden rounded-borders text-center fixed q-px-sm q-mt-xl q-py-md" :style="resumeIndexStyle">
      <transition-group v-if="inView.length > 0" name="in-view" tag="ul">
        <li
          v-for="id in inView"
          :key="id"
          class="in-view-item cursor-pointer"
          @click="scrollToResume(id)"
        >
          {{inViewMap[id]?.index || id}}
          <q-tooltip class="text-weight-bold text-body2" anchor="center left" self="center middle" :offset="[30,0]">{{inViewMap[id]?.name || '未知简历'}}</q-tooltip>
        </li>
      </transition-group>
    </div>

    <div class="resume-content">
      <div class="row q-mb-md items-center justify-between">
        <div class="text-subtitle1 text-weight-medium full-width flex justify-between">
          <div class="row items-center">
            <q-checkbox v-if="resumeBatchMode" v-model="allSelected" :indeterminate="selectedIds.length > 0 && selectedIds.length < filteredResumes.length" class="q-mr-md" size="xs">
              <q-tooltip>全选</q-tooltip>
            </q-checkbox>
<!--            <span v-if="resumeBatchMode" class="text-overline">批量操作</span>-->
            <span v-if="resumeBatchMode" class="q-ml-md text-overline">已选 {{selectedIds.length}} 项</span>
            <span class="q-ml-md">{{channelStr}}-简历列表</span>
            <q-badge class="q-ml-sm" color="primary" outline >数据总数: {{ totalStr }}</q-badge>
            <q-badge v-if="channelStr!=='我的收藏'" color="teal" outline class="q-ml-sm">
              AI分析总量: {{ aiScoredCount }}/{{ filteredResumes.length }}
              <q-tooltip>
                {{ aiScoredCount }} 份简历已获得AI评分，共 {{ filteredResumes.length }} 份简历
              </q-tooltip>
            </q-badge>
          </div>
          <q-space />
          <div v-if="resumeBatchMode">
            <template v-if="isVisible">
              <q-btn
                flat
                dense
                color="primary"
                class="q-mr-sm"
                @click="openBatchAssignPositionDialog"
              >
                <q-icon name="work" size="xs"></q-icon>
                批量分配职位
                <q-tooltip>{{ '批量分配职位' }}</q-tooltip>
              </q-btn>
              <q-btn
                flat
                dense
                color="primary"
                class="q-mr-sm"
                @click="openBatchAddToTalentPoolDialog"
              >
                <q-icon name="group_add" size="xs"></q-icon>
                批量加入人才库
                <q-tooltip>{{ '批量加入人才库' }}</q-tooltip>
              </q-btn>
            </template>
            <q-btn
              flat
              dense
              color="primary"
              class="q-mr-sm"
              @click="openBatchShareDialog"
            >
              <q-icon name="share" size="xs"></q-icon>
              批量分享简历
              <q-tooltip>{{ '批量分享简历' }}</q-tooltip>
            </q-btn>
          </div>

        </div>
      </div>

      <!-- 简历卡片列表 -->
      <div v-if="filteredResumes.length > 0" class="resume-scroll-area">
        <q-list separator>
          <div
            v-for="resume in filteredResumes"
            :key="resume.id"
            :data-id="resume.id"
            v-intersection="onIntersection"
            class="resume-item-wrapper"
            style="display: flex; align-items: stretch;"
          >
            <div v-if="resumeBatchMode" style="display: flex; align-items: center;">
              <q-checkbox v-model="selectedIds" :val="resume.id" class="q-mr-md" size="xs" />
            </div>
            <div style="flex: 1;">
              <resume-card
                :resume="resume"
                :is-read="resume.isRead"
                :tab-str="channelStr"
                @collect="handleCollect"
                @read="handleRead"
                @download="handleDownload"
                @contact="handleContact"
                @blacklist="handleBlacklist"
                @detail="handleViewDetail"
                @interview="handleScheduleInterview"
              />
            </div>
          </div>
        </q-list>

        <!-- 加载更多 -->
        <div class="text-center q-my-lg">
          <q-btn
            v-if="hasMoreData"
            :loading="loading"
            color="primary"
            flat
            label="加载更多"
            @click="loadMore"
          />
          <p v-else class="text-grey-7 q-my-sm">已加载全部数据</p>
          <!--    空盒子为了占用空间      -->
          <div class="q-py-md"></div>
        </div>

      </div>

      <!-- 空状态 -->
<!--      <div v-else class="text-center q-pa-xl">-->
<!--        <q-icon name="search_off" size="4em" color="grey-5" />-->
<!--        <div class="text-subtitle1 q-mt-md text-grey-7">暂无符合条件的简历</div>-->
<!--        <q-btn-->
<!--          outline-->
<!--          color="primary"-->
<!--          class="q-mt-md"-->
<!--          label="清除筛选条件"-->
<!--          @click="resetFilters"-->
<!--        />-->
<!--      </div>-->
    </div>
  </div>
</template>

<script setup>
import { ref, computed, defineProps, defineEmits, watch, onMounted } from 'vue';
import ResumeCard from './ResumeCard.vue';
import BatchShareDialog from './BatchShareDialog.vue';
import BatchAddToTalentPoolDialog from './BatchAddToTalentPoolDialog.vue';
import { useSendResume } from 'src/hooks/useSendResume';
import { usePlanVisibility } from 'src/hooks/usePlanVisibility';
import { useStore } from 'vuex';
import { useQuasar } from 'quasar';
import notify from "src/util/notify";

const store = useStore();
const $q = useQuasar();

const props = defineProps({
  resumes: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  },
  hasMoreData: {
    type: Boolean,
    default: false
  },
  total:{
    type: [String, Number],
    default: '0'
  },
  channelStr:{
    type: String,
    default: ''
  },
  aiSort: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['load-more', 'filter-change', 'update:selected']);

// 初始化发送简历hook 
const { sendResume } = useSendResume('resumeList');

// 默认planA企业可见， 无plan或plan不匹配时默认不可见
const { isVisible } = usePlanVisibility({
  visibleForPlans: ['PlanA'],
  defaultVisible: false
})

// v-intersection 相关
const inView = ref([]);
const inViewMap = ref({});

// 多选相关
const selectedIds = ref([]);

// 全选/取消全选
const allSelected = computed({
  get() {
    return filteredResumes.value.length > 0 && selectedIds.value.length === filteredResumes.value.length;
  },
  set(val) {
    if (val) {
      selectedIds.value = filteredResumes.value.map(r => r.id);
    } else {
      selectedIds.value = [];
    }
  }
});

watch(selectedIds, (val) => {
  emit('update:selected', val);
});

// 从Vuex获取简历索引栏显示状态
const resumeIndexVisible = computed(() => store.getters.getResumeIndexVisible);

// 从Vuex获取固定按钮面板位置
const fixedPanelPosition = computed(() => store.getters.getFixedPanelPosition);

// 从Vuex获取批量操作模式
const resumeBatchMode = computed(() => store.getters.getResumeBatchMode);

// 简历索引侧边栏样式计算
const resumeIndexStyle = computed(() => {
  const panelPos = fixedPanelPosition.value;
  const panelRight = panelPos?.right || 10;
  let panelTop = panelPos?.top || '60%';
  const panelHeight = panelPos?.height || 80;
  panelTop += panelHeight;
  const panelWidth = panelPos?.width || 48;
  const buttonsCount = panelPos?.buttons || 3;

  // 计算合适的间距：基于面板的宽度和按钮数量
  const gap = Math.max(20, panelWidth / 2); // 至少20px的间距

  // 索引栏位置调整：放在按钮面板左侧，与其垂直居中对齐
  return {
    // top: typeof panelTop === 'number' ? `${panelTop}px` : panelTop,
    bottom:0,
    right: `${panelRight}px`, // 面板右侧位置 + 间距 + 面板宽度
    transform: 'translateY(-50%)', // 垂直居中
    maxHeight: `${panelHeight * 0.6}px`, // 最大高度：面板高度的1.5倍
    // backgroundColor: 'var(--q-primary-80)'
    backgroundColor: '#e0e0e0',
    width: `${panelWidth-10}px`,
  };
});

// 处理交叉观察
function onIntersection(entry) {
  // console.log('Intersection observed:', entry);
  // 获取ID，尝试从dataset中读取
  let id = entry.target.dataset.id || entry.target.dataset.resumeId;

  // 如果没有直接找到ID，尝试从q-item元素中获取
  if (!id && entry.target.querySelector) {
    const qItem = entry.target.querySelector('.q-item[data-id]');
    if (qItem) {
      id = qItem.dataset.id;
    }
  }

  // console.log('Target dataset ID:', id);

  if (!id) {
    console.error('无法获取简历ID，跳过处理');
    return;
  }

  if (entry.isIntersecting === true) {
    // console.log('Adding to view:', id);
    addToView(id);
  } else {
    // console.log('Removing from view:', id);
    removeFromView(id);
  }
}

// 添加到视图中的ID
function addToView(id) {
  removeFromView(id);
  inView.value.push(id);

  // 查找对应的简历索引
  const resumeIndex = filteredResumes.value.findIndex(r => r.id === id);
  if (resumeIndex > -1) {
    inViewMap.value[id] = {
      index: resumeIndex + 1,
      name: filteredResumes.value[resumeIndex].name
    };
  }

  // 按索引排序
  inView.value.sort((a, b) => {
    const indexA = inViewMap.value[a]?.index || 0;
    const indexB = inViewMap.value[b]?.index || 0;
    return indexA - indexB;
  });
}

// 从视图中移除ID
function removeFromView(id) {
  let index;
  while ((index = inView.value.indexOf(id)) > -1) {
    inView.value.splice(index, 1);
  }
}

// 滚动到指定简历
function scrollToResume(id) {
  const element = document.querySelector(`[data-id="${id}"]`);
  if (element) {
    element.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  }
  scrollToResumeNewFN(element)
}

function scrollToResumeNewFN(element, offset = 60) {
  if (element) {
    const rect = element.getBoundingClientRect();
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const targetY = rect.top + scrollTop - offset;

    window.scrollTo({
      top: targetY,
      behavior: 'smooth'
    });
  }
}


// 排序选项
const sortOptions = [
  { label: '匹配度优先', value: 'score' },
  { label: '最新优先', value: 'newest' },
  { label: '工作经验降序', value: 'exp-desc' },
  { label: '工作经验升序', value: 'exp-asc' },
  { label: '取消排序', value: 'none' }
];

// 筛选选项
const statusOptions = [
  { label: '全部', value: '' },
  { label: '离职-随时到岗', value: '离职-随时到岗' },
  { label: '在职-月内到岗', value: '在职-月内到岗' },
  { label: '在职-考虑机会', value: '在职-考虑机会' }
];

const degreeOptions = [
  { label: '全部', value: '' },
  { label: '博士', value: '博士' },
  { label: '硕士', value: '硕士' },
  { label: '本科', value: '本科' },
  { label: '大专', value: '大专' },
  { label: '其他', value: '其他' }
];

const genderOptions = [
  { label: '全部', value: '' },
  { label: '男', value: 1 },
  { label: '女', value: 2 }
];

const channelOptions = [
  { label: '全部', value: '' },
  { label: 'BOSS直聘', value: 'boss直聘' },
  { label: '智联招聘', value: '智联招聘' },
  { label: '51job', value: '51job' },
  { label: '猎聘', value: '猎聘' }
];

const readStatusOptions = [
  { label: '全部', value: '' },
  { label: '已读', value: true },
  { label: '未读', value: false }
];

// 状态变量
const sortBy = ref(sortOptions[4]);
const showFilter = ref(false);
const filters = ref({
  status: '',
  degree: '',
  minExperience: null,
  gender: '',
  keyword: '',
  channel: '',
  readStatus: ''
});

// 总简历数
const totalStr = computed(() => props.total ? String(props.total) : '0');
// 渠道名称
const channelStr = computed(() => props.channelStr);

// 根据筛选条件过滤简历
const filteredResumes = computed(() => {
  let result = [...props.resumes];
  // console.log("props.resumes",channelStr.value,props.resumes)
  // 应用筛选条件
  const { status, degree, minExperience, gender, keyword, channel, readStatus } = filters.value;

  if (status) {
    result = result.filter(resume => resume.status === status);
  }

  if (degree) {
    result = result.filter(resume => resume.degree === degree);
  }

  if (minExperience !== null && minExperience !== '') {
    result = result.filter(resume => resume.experienceYear >= Number(minExperience));
  }

  if (gender !== '') {
    result = result.filter(resume => resume.gender === gender);
  }

  if (keyword) {
    const lowerKeyword = keyword.toLowerCase();
    result = result.filter(resume =>
      (resume.name && resume.name.toLowerCase().includes(lowerKeyword)) ||
      (resume.description && resume.description.toLowerCase().includes(lowerKeyword)) ||
      (resume.workExp && resume.workExp.companyName && resume.workExp.companyName.toLowerCase().includes(lowerKeyword)) ||
      (resume.eduExp && resume.eduExp.schoolName && resume.eduExp.schoolName.toLowerCase().includes(lowerKeyword)) ||
      (resume.eduExp && resume.eduExp.major && resume.eduExp.major.toLowerCase().includes(lowerKeyword))
    );
  }

  if (channel) {
    result = result.filter(resume => resume.channel === channel);
  }

  if (readStatus !== '') {
    result = result.filter(resume => resume.isRead === readStatus);
  }

  // 应用排序
  if (props.aiSort) {
    // 当aiSort为true时，优先使用score排序
    result.sort((a, b) => b.score - a.score);
  } else if (sortBy.value.value === 'score') {
    result.sort((a, b) => b.score - a.score);
  } else if (sortBy.value.value === 'newest') {
    // 假设有创建日期字段，这里仅为示例
    result.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  } else if (sortBy.value.value === 'exp-desc') {
    result.sort((a, b) => b.experienceYear - a.experienceYear);
  } else if (sortBy.value.value === 'exp-asc') {
    result.sort((a, b) => a.experienceYear - b.experienceYear);
  }

  return result;
});

// 计算有AI分数的简历数量
const aiScoredCount = computed(() => {
  return filteredResumes.value.filter(resume => {
    // 只有当score为数字且不为null或undefined时才计算
    return resume.score !== null && resume.score !== undefined && !isNaN(resume.score);
  }).length;
});

// 监听筛选条件变化，重置inView状态
watch([filters, sortBy], () => {
  inView.value = [];
  inViewMap.value = {};

  emit('filter-change', {
    filters: filters.value,
    sort: sortBy.value.value
  });
}, { deep: true });

// 监听简历数据变化，更新inViewMap
watch(() => filteredResumes.value, () => {
  console.log('inViewMap更新',inView.value)
  // 更新现有的inViewMap索引
  inView.value.forEach(id => {
    const resumeIndex = filteredResumes.value.findIndex(r => r.id === id);
    if (resumeIndex > -1) {
      inViewMap.value[id] = {
        index: resumeIndex + 1,
        name: filteredResumes.value[resumeIndex].name
      };
    }
  });

  // 重新排序inView
  inView.value.sort((a, b) => {
    const indexA = inViewMap.value[a]?.index || 0;
    const indexB = inViewMap.value[b]?.index || 0;
    return indexA - indexB;
  });
}, { deep: true });

// 加载更多
const loadMore = () => {
  emit('load-more');
};

// 重置筛选条件
const resetFilters = () => {
  filters.value = {
    status: '',
    degree: '',
    minExperience: null,
    gender: '',
    keyword: '',
    channel: '',
    readStatus: ''
  };
  sortBy.value = sortOptions[0];
};

// 事件处理方法
const handleCollect = (resume) => {
  emit('collect', resume);
};

const handleRead = (resume) => {
  emit('read', resume);
};

const handleDownload = (resume) => {
  emit('download', resume);
};

const handleContact = (resume) => {
  emit('contact', resume);
};

const handleBlacklist = (resume) => {
  emit('blacklist', resume);
};

const handleViewDetail = (resume) => {
  emit('detail', resume);
};

const handleScheduleInterview = (resume) => {
  emit('interview', resume);
};

// 用于控制批量分享对话框的显示
const showBatchShareDialog = ref(false);

// 获取选中简历的完整数据
const selectedResumes = computed(() => {
  return filteredResumes.value.filter(resume => selectedIds.value.includes(resume.id));
});

// 打开批量分享对话框
const openBatchShareDialog = () => {
  if (selectedIds.value.length === 0) {
    notify.info("请先选择简历")
    // $q.notify({
    //   message: '请先选择简历',
    //   color: 'warning',
    //   icon: 'warning'
    // });
    return;
  }
  showBatchShareDialog.value = true;
};

// 批量加入人才库对话框
const showBatchDialog = ref(false);

// 获取选中简历的完整数据
const filteredSelectedResumes = computed(() => {
  return selectedResumes.value.filter(resume => resume.score !== null && resume.score !== undefined && resume.score >= 0);
});

// 批量分配职位对话框类型
const batchDialogType = ref('talent-pool');

// 处理批量确认操作
const handleBatchConfirm = async (data) => {
  await sendResume(data.resumes.map(r => r.id), { action: data.type })
};

// 打开批量加入人才库对话框
const openBatchAddToTalentPoolDialog = () => {
  if (selectedIds.value.length === 0) {
    notify.info("请先选择简历");
    return;
  }
  
  if (filteredSelectedResumes.value.length === 0) {
    notify.info("没有符合条件的简历，请选择AI分析完成的数据！");
    return;
  }
  
  if(selectedIds.value.length > 20){
    notify.warning('最多只能选择20个简历');
    return;
  }

  batchDialogType.value = 'talent-pool';
  showBatchDialog.value = true;
};

// 打开批量分配职位对话框
const openBatchAssignPositionDialog = () => {
  if (selectedIds.value.length === 0) {
    notify.info("请先选择简历");
    return;
  }
  
  if (filteredSelectedResumes.value.length === 0) {
    notify.info("没有符合条件的简历，请选择AI分析完成的数据！");
    return;
  }

  if(selectedIds.value.length > 20){
    notify.warning('最多只能选择20个简历');
    return;
  }
  
  batchDialogType.value = 'assign-position';
  showBatchDialog.value = true;
};
</script>

<style lang="sass" scoped>
.resume-list
  position: relative
  padding: 8px

.resume-content
  //padding-left: 60px

.resume-index
  max-height: 20vh
  overflow-y: auto
  opacity: 0.85
  z-index: 100

  ul
    list-style: none
    margin: 0
    padding: 0

  li
    padding: 0.5em
    font-size: 0.9em
    border-radius: 4px
    margin-bottom: 2px
    &:hover
      background-color: rgba(255, 255, 255, 0.2)

.resume-scroll-area
  position: relative
  //max-height: 80vh
  //overflow-y: auto

.resume-item-wrapper
  display: block
  // 确保不影响布局

.in-view-item
  transition: all 0.3s
  display: block

.in-view-enter-from, .in-view-leave-to
  opacity: 0
  transform: translateX(-10px)

.in-view-leave-active
  position: absolute

.filter-panel
  transition: all 0.3s ease
</style>
