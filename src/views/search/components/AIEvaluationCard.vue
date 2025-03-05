<template>
  <el-dialog
    v-model="dialogVisible"
    title="AI评估详情"
    width="800px"
    :close-on-click-modal="false"
    :show-close="true"
    style="background-color: white"
    class="ai-evaluation-dialog"
    top="6vh"
  >
    <div class="ai-evaluation-container">
      <!-- 顶部个人信息 -->
      <div class="personal-info">
        <div class="left-info">
          <el-avatar :size="50" :src="`/index/header/icons/${props.evaluationData.gender === 1 ? 'geekMan' : 'geekWoman'}.svg`" />
          <div class="info-text">
            <div class="name-row">
              <span class="name">{{ props.evaluationData.name }}</span>
              <el-tag size="small" :type="props.evaluationData.gender === 1 ? 'info' : 'danger'">
                {{ props.evaluationData.gender === 1 ? '男' : '女' }}
              </el-tag>
              <span class="age">{{ props.evaluationData.age }}岁</span>
            </div>
            <div class="contact-row">
              <el-tag class="tag" type="info" effect="plain">{{ props.evaluationData.degree || '学历未知' }}</el-tag>
              <el-tag class="tag" type="success" effect="plain">
                {{ props.evaluationData.experienceYear >= 0 ? `${props.evaluationData.experienceYear}年经验` : '经验未知' }}
              </el-tag>
            </div>
          </div>
        </div>
        <div class="right-scores">
          <div class="radar-chart-container">
            <v-chart class="radar-chart" :option="radarOption" autoresize />
          </div>
          <div class="scores-display">
            <div class="score-item">
              <span class="label">专业技能</span>
              <span class="value">{{ props.evaluationData.scores.professional }}</span>
              <el-tag size="small" :type="getScoreStatus(props.evaluationData.scores.professional).type">
                {{ getScoreStatus(props.evaluationData.scores.professional).label }}
              </el-tag>
            </div>
            <div class="score-item">
              <span class="label">工作经历</span>
              <span class="value">{{ props.evaluationData.scores.experience }}</span>
              <el-tag size="small" :type="getScoreStatus(props.evaluationData.scores.experience).type">
                {{ getScoreStatus(props.evaluationData.scores.experience).label }}
              </el-tag>
            </div>
            <div class="score-item">
              <span class="label">软实力</span>
              <span class="value">{{ props.evaluationData.scores.softSkills }}</span>
              <el-tag size="small" :type="getScoreStatus(props.evaluationData.scores.softSkills).type">
                {{ getScoreStatus(props.evaluationData.scores.softSkills).label }}
              </el-tag>
            </div>
          </div>
        </div>
      </div>

      <!-- 评估维度表格 - 改为简约表格，垂直排列所有维度 -->
      <div class="evaluation-tables-container">
        <!-- 遍历所有维度并垂直排列 -->
        <div v-for="(dimension, index) in ['专业技能', '工作经历', '软实力']" :key="index" class="dimension-section">
          <div class="dimension-header">
            <span class="dimension-title">{{ dimension }}</span>
            <el-tag size="small" :type="getScoreStatus(props.evaluationData.scores[getDimensionKey(dimension)]).type" style="margin-left: 10px">
              {{ props.evaluationData.scores[getDimensionKey(dimension)] }}分
            </el-tag>
          </div>
          
          <el-empty v-if="getDimensionItems(dimension).length === 0" description="暂无评估数据" />
          
          <el-table 
            v-else
            :data="getDimensionItems(dimension)" 
            border 
            style="width: 100%; margin-top: 10px; margin-bottom: 20px"
            stripe
          >
            <el-table-column label="评估项目" width="120">
              <template #default="scope">
                <span>{{ scope.row.name }}</span>
              </template>
            </el-table-column>
            
            <el-table-column label="招聘要求">
              <template #default="scope">
                <span>{{ scope.row.requirement }}</span>
              </template>
            </el-table-column>
            
            <el-table-column label="候选人条件">
              <template #default="scope">
                <span>{{ scope.row.candidate }}</span>
              </template>
            </el-table-column>
            
            <el-table-column label="匹配度" width="100" align="center">
              <template #default="scope">
                <el-tag size="small" :type="getMatchType(scope.row.match)">
                  {{ scope.row.match }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>
      
      <!-- 查看详情按钮 -->
      <div class="detail-button-container">
        <el-button color="rgba(31, 124, 255, 1)" @click="viewDetails">查看简历详情</el-button>
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
import { ref, defineProps, defineEmits, watch, computed } from 'vue';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { RadarChart } from 'echarts/charts';
import { TitleComponent, TooltipComponent, LegendComponent } from 'echarts/components';

use([
  CanvasRenderer,
  RadarChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent
]);

import VChart from 'vue-echarts';

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  evaluationData: {
    type: Object,
    required: true
  },
  dimensionMap: {
    type: Object,
    default: () => ({
      '专业技能': 'professional',
      '工作经历': 'experience',
      '软实力': 'softSkills'
    })
  },
  dimensionItems: {
    type: Object,
    default: () => ({
      '专业技能': [],
      '工作经历': [],
      '软实力': []
    })
  },
  onUserInfo: {
    type: Function,
    required: true
  }
});


const emit = defineEmits(['update:visible']);

const dialogVisible = ref(props.visible);

// 监听对话框可见性变化
watch(() => props.visible, (newVal) => {
  dialogVisible.value = newVal;
});

watch(dialogVisible, (newVal) => {
  emit('update:visible', newVal);
});

// 获取匹配状态对应的类型
const getMatchType = (match) => {
  if (match === '匹配') return 'success';
  if (match === '部分匹配') return 'warning';
  return 'danger';
};

const getScoreStatus = (score) => {
  if (score >= 80) return { type: 'success', label: '高' };
  if (score >= 60) return { type: 'warning', label: '正常' };
  return { type: 'danger', label: '低' };
};

const radarOption = computed(() => ({
  radar: {
    indicator: [
      { name: '专业技能', max: 100 },
      { name: '工作经历', max: 100 },
      { name: '软实力', max: 100 }
    ],
    center: ['50%', '50%'],
    radius: '70%',
    splitNumber: 4,
    nameGap: 15, // 增加指示器名称与轴的距离
    shape: 'circle',
    axisName: {
      color: '#333',
      fontSize: 12,
      padding: [-20, -40], // 添加内边距，使文字与图

    },
    splitArea: {
      show: true,
      areaStyle: {
        color: ['rgba(255,255,255,0.9)', 'rgba(255,255,255,0.8)']
      }
    },
    axisLine: {
      lineStyle: {
        color: 'rgba(18, 150, 219, 0.2)'
      }
    },
    splitLine: {
      lineStyle: {
        color: 'rgba(18, 150, 219, 0.2)'
      }
    }
  },
  series: [{
    type: 'radar',
    data: [{
      value: [
        props.evaluationData.scores.professional,
        props.evaluationData.scores.experience,
        props.evaluationData.scores.softSkills
      ],
      name: '能力评分',
      itemStyle: {
        color: '#1296DB'
      },
      areaStyle: {
        color: 'rgba(18, 150, 219, 0.4)'
      }
    }]
  }],
  backgroundColor: {
    type: 'pattern',
    image: new Image(),
    repeat: 'no-repeat',
    imageWidth: 56,
    imageHeight: 21
  }
}));

// 设置背景图
// const img = new Image();
// img.src = '/logo/logo.svg';
// radarOption.value.backgroundColor.image = img;
radarOption.value.backgroundColor = 'rgba(255, 255, 255, 0.8)';
// 在script setup中添加以下函数
const getDimensionKey = (dimension) => {
  return props.dimensionMap[dimension];
};

const getDimensionItems = (dimension) => {
  return props.dimensionItems[dimension] || [];
};

// 查看详情按钮点击事件
const viewDetails = () => {
  // 这里可以实现查看详情的逻辑，例如跳转到详情页或展示更多信息
  // console.log('查看详情', props.evaluationData);
  // 可以根据实际需求扩展功能
  props.onUserInfo(props.evaluationData);
};

</script>

<style scoped lang="scss">
.ai-evaluation-dialog .el-dialog__header{
  padding-bottom: 0px;
}

/* 调整对话框位置 */
:deep(.el-dialog) {
  margin-top: 5vh !important;
}

.ai-evaluation-container {
  padding: 0 20px;

  .personal-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    //margin-bottom: 30px;

    .left-info {
      display: flex;
      align-items: center;
      gap: 15px;

      .info-text {
        .name-row {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 8px;

          .name {
            font-size: 18px;
            font-weight: bold;
          }

          .age {
            color: #666;
          }
        }

        .contact-row {
          display: flex;
          gap: 10px;

          .tag {
            font-size: 12px;
          }
        }
      }
    }

    .right-scores {
      display: flex;
      gap: 20px;

      .radar-chart-container {
        width: 130px;
        height: 130px;
        
        .radar-chart {
          width: 100%;
          height: 100%;
        }
      }

      .scores-display {
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 15px;

        .score-item {
          display: flex;
          align-items: center;
          gap: 10px;

          .label {
            width: 60px;
            color: #666;
          }

          .value {
            font-size: 18px;
            font-weight: bold;
            color: #333;
            width: 40px;
            text-align: center;
          }
        }
      }
    }
  }

  .evaluation-tables-container {
    //margin-top: 20px;
    
    .dimension-section {
      margin-bottom: 20px;
      
      &:last-child {
        margin-bottom: 0;
      }
    }
    
    .dimension-header {
      display: flex;
      align-items: center;
      margin-bottom: 10px;
      border-left: 4px solid #1296DB;
      padding-left: 10px;
      
      .dimension-title {
        font-size: 16px;
        font-weight: bold;
      }
    }
  }

  .detail-button-container {
    display: flex;
    justify-content: center;
    margin-top: 20px;
    padding: 10px 0;
  }
}

// 在style中添加以下样式
.dimension-header {
  display: flex;
  align-items: center;
}

.dimension-details {
  padding: 10px;

  .detail-item {
    margin-bottom: 15px;
    padding: 10px;
    border: 1px solid #ebeef5;
    border-radius: 4px;

    &:last-child {
      margin-bottom: 0;
    }

    .detail-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      //margin-bottom: 10px;

      .detail-title {
        font-weight: bold;
        color: #333;
      }
    }

    .detail-content {
      .requirement,
      .candidate {
        margin-bottom: 5px;

        .label {
          color: #666;
          margin-right: 10px;
        }
      }
    }
  }
}

.detail-button-container {
  display: flex;
  justify-content: center;
  margin-top: 20px;
  padding: 10px 0;
}
</style>