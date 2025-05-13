<template>
  <div>
    <resume-list
      v-if="resumeList.length > 0 || loading"
      :resumes="resumeList"
      :loading="loading"
      :has-more-data="hasMoreData"
      :total="totalCount"
      channel-str="我的收藏"
      @load-more="loadMore"
    />
    <div v-else class="flex flex-center column q-pa-xl" style="margin-top: 16%">
      <q-icon name="search_off" size="2em" color="grey-5" />
      <div class="text-subtitle1 q-mt-md text-grey-7">暂无收藏数据</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useStore } from 'vuex';
import ResumeList from 'src/components/resume/ResumeList.vue';
import { querySearch } from 'src/api/search/SearchApi';

const store = useStore();
const chatId = computed(() => store.getters.getLatestChatId);
const searchConditionId = computed(() => store.getters.getSearchConditionId);

const resumeList = ref([]);
const loading = ref(false);
const hasMoreData = ref(true);
const offset = ref(1);
const size = ref(10);
const totalCount = ref(0);
const hasData = ref(false);

//初始化
const initializationStatus = async () => {
  hasData.value = false
};

// 查询收藏简历
const fetchCollectResumes = async (isLoadMore = false) => {
  if (!chatId.value || !searchConditionId.value) return;
  loading.value = true;
  try {
    const params = {
      filterByRead: false,
      orderByScore: true,
      searchConditionId: searchConditionId.value,
      chatId: chatId.value,
      channel: '我的收藏',
      offset: offset.value,
      size: size.value
    };
    const { data } = await querySearch(params);
    if (data && data.data) {
      if (isLoadMore) {
        resumeList.value = resumeList.value.concat(data.data);
      } else {
        resumeList.value = data.data;
      }
      totalCount.value = data.totalCount || 0;
      // 判断是否还有更多数据
      hasMoreData.value = (offset.value * size.value) < totalCount.value;
    } else {
      if (!isLoadMore) resumeList.value = [];
      hasMoreData.value = false;
    }
  } catch (e) {
    if (!isLoadMore) resumeList.value = [];
    hasMoreData.value = false;
  } finally {
    loading.value = false;
  }
};

// 监听chatId变化，自动加载数据
watch(chatId, (newVal) => {
  if (newVal) {
    offset.value = 1;
    fetchCollectResumes(false);
  }
});

// 加载更多
const loadMore = () => {
  if (loading.value || !hasMoreData.value) return;
  offset.value += 1;
  fetchCollectResumes(true);
};

// 刷新收藏数据列表
const refreshCollectList = () => {
  offset.value = 1;
  fetchCollectResumes(false);
};

// 移除指定id的简历
const removeResumeById = (id) => {
  resumeList.value = resumeList.value.filter(item => item.id !== id);
  if (totalCount.value > 0) {
    totalCount.value -= 1;
  }
};

defineExpose({
  refreshCollectList,
  removeResumeById
});
</script>

<style scoped>
</style>
