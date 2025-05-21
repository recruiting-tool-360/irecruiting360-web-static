<template>
  <q-dialog
    v-model="dialogVisible"
    :maximized="false"
    transition-show="scale"
    transition-hide="scale"
    persistent
  >
    <q-card style="width: 80vw; max-width: 90vw; height: 92vh; display: flex; flex-direction: column;">
      <!-- 固定顶部标题和关闭按钮 -->
      <q-card-section class="row items-center q-pb-none bg-white" style="position: sticky; top: 0; z-index: 10;">
        <div class="text-h6">AI 人才评估详情</div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-card-section v-if="loading" class="column items-center q-py-lg flex-grow-1">
        <q-spinner color="primary" size="3em" />
        <div class="q-mt-md text-subtitle1">正在加载评估数据...</div>
      </q-card-section>

      <q-card-section v-else-if="!evaluationData" class="column items-center q-py-lg flex-grow-1">
        <q-icon name="error_outline" color="negative" size="3em" />
        <div class="q-mt-md text-subtitle1">未能获取评估数据</div>
      </q-card-section>

      <template v-else>
        <!-- 主要内容区域：左右分栏 -->
        <q-card-section class="row q-py-sm flex-grow-1" style="overflow: hidden;">
          <!-- 左侧：个人信息和标签 (30%) -->
          <div class="col-4 q-pr-md" style="overflow-y: auto; height: 100%;">
            <!-- 个人信息 -->
            <div class="q-mb-sm">
              <div class="row items-center q-mb-md">
                <q-avatar size="60px" class="q-mr-md">
                  <img :src="`${resumeData.gender === 1 ? '/index/header/icons/geekMan.svg' : '/index/header/icons/geekWoman.svg'}`" />
                </q-avatar>
                <div class="row items-center q-mb-xs">
                  <div class="text-h6 q-mr-sm">{{ resumeData.name }}</div>
                  <q-badge v-if="resumeData.gender === 1" color="blue-5" class="q-mr-sm">男</q-badge>
                  <q-badge v-else-if="resumeData.gender === 0" color="pink-5" class="q-mr-sm">女</q-badge>
                  <div class="text-subtitle2">{{ resumeData.age || '--' }}岁</div>
                </div>
                <div class="row items-center q-gutter-x-sm q-mb-xs q-ml-xs q-mt-xs">
                  <q-badge outline v-if="resumeData.experienceYear" rounded color="primary" class="q-ml-md q-px-sm">{{ resumeData.experienceYear === -1 ? '应届生' : `${resumeData.experienceYear}年经验` }}</q-badge>
                  <q-badge  outline rounded color="teal" class="q-ml-sm q-px-sm">{{ resumeData.degree }}</q-badge>
                  <q-badge outline rounded color="warning" class="q-ml-sm q-px-sm">{{ resumeData.status }}</q-badge>
                </div>
                <div class="row items-center q-gutter-x-sm q-mb-xs q-ml-xs">
                  <q-badge outline v-if="resumeData.intention" rounded color="purple" class="q-ml-sm q-px-sm">{{ resumeData.intention || '未填写' }}</q-badge>
                  <q-badge outline rounded color="grey-7" class="q-ml-sm q-px-sm">
                    {{ resumeData.channel }}</q-badge>
                </div>
                <div>


                  <!-- 评分标签 -->
                  <div class="row items-center q-gutter-x-sm q-mt-sm">
                    <q-badge
                      v-for="dimension in dimensions"
                      :key="dimension.key"
                      :color="getScoreColor(getDimensionScore(dimension.key), dimension.key)"
                      class="score-badge"
                    >
                      {{ dimension.label }}: {{ getDimensionScore(dimension.key) }}/{{ getTotalScore(dimension.key) }}
                    </q-badge>
                  </div>
                </div>
              </div>
            </div>

            <!-- 分隔线 -->
            <q-separator class="q-my-sm" />

            <!-- 雷达图 -->
            <div class="q-mb-md">
              <v-chart class="radar-chart" :option="radarOption" autoresize />
            </div>

            <!-- 分隔线 -->
            <q-separator class="q-my-sm" />

            <!-- 标签信息 -->
            <div v-if="evaluationData.tagArray && evaluationData.tagArray.length > 0" class="q-mb-md">
<!--              <div class="text-subtitle1 q-mb-sm">候选人标签</div>-->
              <div class="rounded-borders q-pa-sm">
                <div class="row q-gutter-sm wrap">
                  <q-badge
                    v-for="(tag, idx) in evaluationData.tagArray"
                    :key="idx"
                    :color="getTagColor(tag.type)"
                    :text-color="getTagTextColor(tag.type)"
                    class="q-pa-xs"
                    outline
                  >
                    {{ tag.content }}
                  </q-badge>
                </div>
              </div>
            </div>
          </div>

          <!-- 右侧：评估维度详情 (60%) -->
          <div class="col-8 assessment-details q-px-sm" style="overflow-y: auto; height: 100%;">
            <!-- 显示所有评估维度，不使用选项卡 -->
            <div v-for="dimension in dimensions" :key="dimension.key" class="q-mb-lg">
              <div class="text-subtitle1 q-mb-md">
                <div class="row items-center">
                  <div class="q-mr-md">{{ dimension.label }}</div>
                  <div class="text-caption text-grey-7 q-mr-md">(总分{{ getTotalScore(dimension.key) }})</div>
                  <q-badge :color="getScoreColor(getDimensionScore(dimension.key), dimension.key)">
                    {{ getDimensionScore(dimension.key) }}分
                  </q-badge>
                </div>
              </div>

              <div v-if="!getDimensionItems(dimension.key) || getDimensionItems(dimension.key).length === 0" class="text-center q-pa-md">
                <q-icon name="info" size="2em" color="grey-7" />
                <div class="text-grey-7 q-mt-sm">暂无评估数据</div>
              </div>

              <div v-else class="assessment-table">
                <div class="assessment-table-header">
                  <div class="col-header">评估维度</div>
                  <div class="col-header">招聘要求</div>
                  <div class="col-header">候选人条件</div>
                  <div class="col-header">匹配度</div>
                </div>

                <div v-for="(item, idx) in getDimensionItems(dimension.key)" :key="idx" class="assessment-table-row">
                  <div class="col-item">{{ item.name }}</div>
                  <div class="col-item">{{ item.requirement || '/' }}</div>
                  <div class="col-item" :class="{'text-green': getMatchColor(item.matchResultStr) === 'positive'}">
                    {{ item.candidateFallback || '/' }}
                  </div>
                  <div class="col-item match-result">
                    <q-badge :color="getMatchColor(item.matchResultStr)" class="match-badge">
                      <span v-if="getMatchColor(item.matchResultStr) === 'positive'" class="match-icon">✓</span>
                      <span v-else-if="getMatchColor(item.matchResultStr) === 'warning'" class="match-icon">⚠</span>
                      <span v-else class="match-icon">✕</span>
                      {{ item.matchResultStr }}
                    </q-badge>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </q-card-section>

        <!-- 固定底部操作按钮 -->
        <q-card-actions align="center" class="bg-white" style="position: sticky; bottom: 0; z-index: 10;">
          <q-btn color="primary" outline class="q-pt-sm q-px-md q-mb-sm" label="查看简历详情" @click="viewResumeDetail" />
          <template v-if="isVisible">
            <q-btn color="primary" outline class="q-pt-sm q-px-md q-mb-sm" label="分配职位" @click="assignJobHandler" />
            <q-btn color="primary" outline class="q-pt-sm q-px-md q-mb-sm" label="加入人才库" @click="addToTalentPoolHandler" />
          </template>
        </q-card-actions>
      </template>
    </q-card>
  </q-dialog>
</template>

<script>
import { defineComponent, ref, onMounted, watch, computed, nextTick } from 'vue';
import { getScoreListDetailedPlus } from 'src/api/jobList/JobListApi';
import { useQuasar } from 'quasar';
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { RadarChart } from 'echarts/charts';
import { TitleComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { usePlanVisibility } from 'src/hooks/usePlanVisibility';

// 注册必要的组件
use([
  CanvasRenderer,
  RadarChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent
]);

export default defineComponent({
  name: 'AIResumeEvaluation',

  components: {
    VChart
  },

  props: {
    visible: {
      type: Boolean,
      default: false
    },
    resumeData: {
      type: Object,
      required: true
    },
    searchConditionId: {
      type: [String, Number],
      default: ''
    }
  },

  emits: ['update:visible', 'view-detail', 'assign-job', 'add-to-talent-pool'],

  setup(props, { emit }) {
    const $q = useQuasar();
    const dialogVisible = ref(props.visible);
    const loading = ref(false);
    const evaluationData = ref(null);

    // 默认planA企业可见， 无plan或plan不匹配时默认不可见
    const { isVisible } = usePlanVisibility({
      visibleForPlans: ['PlanA'],
      defaultVisible: false
    })

    const dimensions = [
      { key: '专业技能', label: '专业技能', totalScore: 40 },
      { key: '工作经历', label: '工作经历', totalScore: 40 },
      { key: '软实力', label: '软实力', totalScore: 20 }
    ];

    // 雷达图配置
    const radarOption = computed(() => {
      // 转换分数为百分比显示
      const dimensionScores = dimensions.map(dim => {
        const score = getDimensionScore(dim.key);
        // 计算百分比得分，用于雷达图显示
        return Math.round((score / dim.totalScore) * 100);
      });

      return {
        radar: {
          indicator: dimensions.map(dim => ({
            name: `${dim.label}(${getDimensionScore(dim.label)}分)`,
            max: 100  // 统一使用100作为最大值
          })),
          shape: 'circle',
          radius: '60%',
          center: ['51%', '50%'],
          splitNumber: 4,
          axisName: {
            color: '#333',
            fontSize: 12,
            padding: [5, 10],
            formatter: function(value, indicator) {
              return value.split('(')[0] + '\n(' + value.split('(')[1];
            }
          },
          nameGap: 15,
          splitArea: {
            areaStyle: {

            }
          },
          axisLine: {
            lineStyle: {
              color: 'rgba(120, 180, 240, 0.2)'
            }
          },
          splitLine: {
            lineStyle: {
              color: 'rgba(120, 180, 240, 0.2)'
            }
          }
        },
        series: [{
          type: 'radar',
          data: [{
            value: dimensionScores,
            name: '能力评分',
            areaStyle: {
              color: 'rgba(67, 160, 240, 0.4)'
            },
            lineStyle: {
              width: 2,
              color: 'rgba(67, 160, 240, 0.9)'
            },
            itemStyle: {
              color: 'rgba(67, 160, 240, 0.9)',
              borderColor: '#fff',
              borderWidth: 2,
              shadowColor: 'rgba(0, 0, 0, 0.2)',
              shadowBlur: 2
            },
            symbolSize: 8,
            label: {
              show: true,
              formatter: function(params) {
                // 显示原始分数，而不是百分比
                const index = params.dimensionIndex;
                const dim = dimensions[index];
                return getDimensionScore(dim.key);
              },
              color: '#333',
              fontSize: 14,
              fontWeight: 'bold'
            }
          }]
        }],
        backgroundColor: 'transparent'
      };
    });

    const columns = [
      { name: 'name', label: '评估项目', field: 'name', align: 'left', sortable: false },
      { name: 'requirement', label: '招聘要求', field: 'requirement', align: 'left', sortable: false },
      { name: 'candidateFallback', label: '候选人条件', field: 'candidateFallback', align: 'left', sortable: false },
      { name: 'matchResultStr', label: '匹配度', field: 'matchResultStr', align: 'center', sortable: false }
    ];

    // 监听对话框可见性
    watch(() => props.visible, (newVal) => {
      dialogVisible.value = newVal;
      if (newVal) {
        loadEvaluationData();
      }
    });

    watch(dialogVisible, (newVal) => {
      emit('update:visible', newVal);
      if (!newVal) {
        // 对话框关闭时清理数据
        evaluationData.value = null;
      }
    });

    // 加载评估数据
    const loadEvaluationData = async () => {
      if (!props.resumeData || !props.resumeData.id) {
        $q.notify({
          color: 'negative',
          message: '简历数据不完整，无法进行评估',
          position: 'top'
        });
        return;
      }

      loading.value = true;
      try {
        const params = {
          resumeBlindIds: [props.resumeData.id],
          channel: props.resumeData.channel,
          searchId: props.searchConditionId
        };

        const { data } = await getScoreListDetailedPlus(params);

        if (data && data.length > 0) {
          evaluationData.value = data[0];
        } else {
          $q.notify({
            color: 'warning',
            message: '未找到该简历的评估数据',
            position: 'top'
          });
        }
      } catch (error) {
        console.error('加载评估数据失败:', error);
        $q.notify({
          color: 'negative',
          message: '加载评估数据失败，请稍后再试',
          position: 'top'
        });
      } finally {
        loading.value = false;
      }
    };

    // 获取维度总分
    const getTotalScore = (dimensionKey) => {
      const dimension = dimensions.find(d => d.key === dimensionKey);
      return dimension ? dimension.totalScore : 0;
    };

    // 获取维度得分
    const getDimensionScore = (dimensionKey) => {
      if (!evaluationData.value || !evaluationData.value.standardDimensions) return 0;

      const dimension = evaluationData.value.standardDimensions.find(d => d.groupKey === dimensionKey);
      return dimension ? Math.round(dimension.score) : 0;
    };

    // 获取维度项目
    const getDimensionItems = (dimensionKey) => {
      if (!evaluationData.value || !evaluationData.value.standardDimensions) return [];

      const dimension = evaluationData.value.standardDimensions.find(d => d.groupKey === dimensionKey);
      return dimension ? dimension.items : [];
    };

    // 获取分数对应的颜色
    const getScoreColor = (score, dimensionKey) => {
      const dimension = dimensions.find(d => d.key === dimensionKey);
      const totalScore = dimension ? dimension.totalScore : 100;

      // 计算得分百分比
      const percentage = (score / totalScore) * 100;

      if (percentage >= 80) return 'positive';
      if (percentage >= 60) return 'primary';
      if (percentage >= 40) return 'warning';
      return 'negative';
    };

    // 获取分数对应的标签
    const getScoreLabel = (score, dimensionKey) => {
      const dimension = dimensions.find(d => d.key === dimensionKey);
      const totalScore = dimension ? dimension.totalScore : 100;

      // 计算得分百分比
      const percentage = (score / totalScore) * 100;

      if (percentage >= 80) return '高';
      if (percentage >= 60) return '中';
      return '低';
    };

    // 获取匹配结果对应的颜色
    const getMatchColor = (match) => {
      if (match === '匹配') return 'positive';
      if (match === '部分匹配') return 'warning';
      return 'negative';
    };

    // 获取标签对应的颜色
    const getTagColor = (type) => {
      switch (type) {
        case 'soft_skill_highlight':
          return 'green-8';
        case 'experience_risk':
          return 'red-8';
        default:
          return 'blue-8';
      }
    };

    // 获取标签文字颜色
    const getTagTextColor = (type) => {
      switch (type) {
        case 'soft_skill_highlight':
          return 'green-8';
        case 'experience_risk':
          return 'red-8';
        default:
          return 'blue-8';
      }
    };

    // 查看简历详情
    const viewResumeDetail = () => {
      emit('view-detail', props.resumeData);
      dialogVisible.value = false;
    };

    const assignJobHandler = () => {
      emit('assign-job', props.resumeData.id);
    };

    const addToTalentPoolHandler = () => {
      emit('add-to-talent-pool', props.resumeData.id);
    };
    const getDimensionLabel = (dimensionKey) => {
      const score = getDimensionScore(dimensionKey);
      const label = getScoreLabel(score, dimensionKey);
      return { score, label };
    };

    // 加载组件时
    onMounted(() => {
      if (props.visible) {
        loadEvaluationData();
      }
    });

    return {
      isVisible,
      dialogVisible,
      loading,
      evaluationData,
      dimensions,
      columns,
      getDimensionScore,
      getDimensionItems,
      getScoreColor,
      getScoreLabel,
      getMatchColor,
      getTagColor,
      getTagTextColor,
      viewResumeDetail,
      assignJobHandler,
      addToTalentPoolHandler,
      radarOption,
      getTotalScore,
      getDimensionLabel
    };
  }
});
</script>

<style scoped>
.q-badge {
  font-size: 0.8em;
}

.q-table {
  box-shadow: none;
  border-radius: 8px;
  overflow: hidden;
}

.q-table__container {
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 8px;
}

.q-tab-panel {
  padding: 16px 0;
}

.radar-chart {
  width: 280px;
  height: 280px;
  background: repeating-radial-gradient(#62ff84 0%, #82defa 40%, #d6edff 55%, #ffffff 65%, #ffffff 100%);
  border-radius: 10px;
  margin: 0 auto;
  overflow: visible;
}

.dimension-table {
  margin-bottom: 20px;
}

.assessment-details::-webkit-scrollbar,
.col-5::-webkit-scrollbar {
  width: 6px;
}

.assessment-details::-webkit-scrollbar-track,
.col-5::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

.assessment-details::-webkit-scrollbar-thumb,
.col-5::-webkit-scrollbar-thumb {
  background: #ccc;
  border-radius: 3px;
}

.assessment-details::-webkit-scrollbar-thumb:hover,
.col-5::-webkit-scrollbar-thumb:hover {
  background: #999;
}

.score-badge {
  font-size: 0.85em;
  padding: 3px 8px;
}

.assessment-table {
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.12);
  background-color: #f9fafc;
}

.assessment-table-header {
  display: flex;
  background-color: #e7f1fe;
  font-weight: bold;
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}

.assessment-table-row {
  display: flex;
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}

.assessment-table-row:last-child {
  border-bottom: none;
}

.assessment-table-row:nth-child(even) {
  background-color: rgba(0, 0, 0, 0.02);
}

.col-header, .col-item {
  padding: 10px;
  font-size: 14px;
}

.col-header:not(:last-child),
.col-item:not(:last-child) {
  border-right: 1px solid rgba(0, 0, 0, 0.12);
}

.col-header:nth-child(1),
.col-item:nth-child(1) {
  flex: 1.5;
  min-width: 100px;
}

.col-header:nth-child(2),
.col-item:nth-child(2) {
  flex: 2;
  min-width: 130px;
}

.col-header:nth-child(3),
.col-item:nth-child(3) {
  flex: 2;
  min-width: 130px;
}

.col-header:nth-child(4),
.col-item:nth-child(4) {
  flex: 1;
  min-width: 90px;
  text-align: center;
}

.match-badge {
  padding: 4px 8px;
  font-size: 12px;
}

.match-icon {
  margin-right: 4px;
}

.text-green {
  color: #4caf50;
}
</style>
