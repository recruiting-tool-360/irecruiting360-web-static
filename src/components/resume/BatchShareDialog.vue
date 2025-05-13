<template>
  <q-dialog v-model="localVisible" persistent>
    <q-card style="width: 800px; max-width: 90vw;">
      <q-card-section class="row items-center">
        <div class="text-h6">批量分享简历 ({{ resumeList.length }}份)</div>
        <q-space />
        <q-btn icon="cloud_download" color="primary" label="导出数据" flat dense @click="exportData" :loading="exporting">
          <q-tooltip>导出数据</q-tooltip>
        </q-btn>
        <!-- <q-btn icon="close" flat round dense v-close-popup /> -->
      </q-card-section>

      <q-separator />

      <q-card-section style="max-height: 60vh" class="scroll">
        <q-table
          :rows="resumeList"
          :columns="columns"
          row-key="id"
          dense
          :pagination="{ rowsPerPage: 0 }"
          flat
          bordered
        >
          <!-- 自定义姓名列，加入性别标识 -->
          <template v-slot:body-cell-name="props">
            <q-td :props="props">
              <div class="row items-center">
                <q-icon :name="props.row.gender === 1 ? 'man' : 'woman'"
                        :color="props.row.gender === 1 ? 'blue-5' : 'pink-5'"
                        size="xs"
                        class="q-mr-xs" />
                {{ props.value }}
              </div>
            </q-td>
          </template>

          <!-- 自定义操作列 -->
          <template v-slot:body-cell-actions="props">
            <q-td :props="props">
              <q-btn flat round dense size="sm" color="primary" icon="open_in_new" @click="openUrl(props.row)">
                <q-tooltip>查看详情</q-tooltip>
              </q-btn>
              <q-btn flat round dense size="sm" color="teal" icon="content_copy" @click="copyUrl(props.row)">
                <q-tooltip>复制链接</q-tooltip>
              </q-btn>
            </q-td>
          </template>
        </q-table>
      </q-card-section>

      <q-separator />

      <q-card-actions align="right">
        <q-btn flat label="关闭" color="primary" v-close-popup />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, defineProps, defineEmits, watch, computed } from 'vue';
import { getChannelUrl } from 'src/pluginSrc/util/ChannelUrlUtil';
import { useQuasar } from 'quasar';

const $q = useQuasar();
const exporting = ref(false);

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  selectedResumes: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['update:visible']);

// 本地控制对话框显示
const localVisible = computed({
  get: () => props.visible,
  set: (value) => emit('update:visible', value)
});

// 处理选中的简历数据
const resumeList = computed(() => {
  return props.selectedResumes.map(resume => ({
    ...resume,
    // 生成详情URL
    detailUrl: getUrlSafely(resume),
  }));
});

// 安全获取URL，避免出错
function getUrlSafely(resume) {
  try {
    return getChannelUrl(resume);
  } catch (error) {
    console.error('获取简历URL失败:', error, resume);
    return '#';
  }
}

// 打开简历详情URL
function openUrl(resume) {
  if (!resume.detailUrl || resume.detailUrl === '#') {
    $q.notify({
      message: '无法获取详情链接',
      color: 'negative',
      icon: 'error'
    });
    return;
  }

  window.open(resume.detailUrl, '_blank');
}

// 复制简历详情URL
async function copyUrl(resume) {
  if (!resume.detailUrl || resume.detailUrl === '#') {
    $q.notify({
      message: '无法获取详情链接',
      color: 'negative',
      icon: 'error'
    });
    return;
  }

  try {
    // 检查是否支持 navigator.clipboard API
    if (!navigator.clipboard) {
      // 回退到传统的方法
      const input = document.createElement('input');
      input.value = resume.detailUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    } else {
      // 使用现代 API
      await navigator.clipboard.writeText(resume.detailUrl);
    }
    
    // 复制成功
    $q.notify({
      message: '链接复制成功',
      color: 'positive',
      icon: 'content_copy',
      position: 'top',
      timeout: 2000
    });
  } catch (error) {
    console.error('复制链接失败:', error);
    $q.notify({
      message: '复制链接失败',
      color: 'negative',
      icon: 'error',
      position: 'top'
    });
  }
}

// 表格列定义
const columns = [
  { name: 'name', label: '姓名', field: 'name', align: 'left', sortable: true },
  { name: 'degree', label: '学历', field: 'degree', align: 'left', sortable: true },
  { name: 'experienceYear', label: '经验', field: 'experienceYear',
    format: val => val === -1 ? '应届生' : `${val}年`, align: 'left', sortable: true },
  { name: 'ageDesc', label: '年龄', field: 'ageDesc', align: 'left' },
  { name: 'channel', label: '渠道', field: 'channel', align: 'left', sortable: true },
  { name: 'score', label: 'AI评分', field: 'score',
    format: val => val === null || val === undefined ? '暂无' : val,
    align: 'center', sortable: true },
  { name: 'actions', label: '操作', field: 'actions', align: 'center' }
];

// 导出数据
async function exportData() {
  if (resumeList.value.length === 0) {
    $q.notify({
      message: '没有可导出的数据',
      color: 'warning',
      icon: 'warning'
    });
    return;
  }

  exporting.value = true;

  try {
    // 准备CSV数据
    const headers = [
      '姓名', '性别', '学历', '工作经验', '年龄', '渠道', 'AI评分', '详情链接'
    ];

    const rows = resumeList.value.map(resume => [
      resume.name || '',
      resume.gender === 1 ? '男' : '女',
      resume.degree || '',
      resume.experienceYear === -1 ? '应届生' : `${resume.experienceYear}年`,
      resume.ageDesc || '',
      resume.channel || '',
      (resume.score === null || resume.score === undefined) ? '暂无' : resume.score,
      resume.detailUrl || ''
    ]);

    // 组合CSV内容
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    // 创建Blob并下载
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `简历导出数据_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    $q.notify({
      message: '导出成功',
      color: 'positive',
      icon: 'check_circle'
    });
  } catch (error) {
    console.error('导出数据失败:', error);
    $q.notify({
      message: '导出失败，请重试',
      color: 'negative',
      icon: 'error'
    });
  } finally {
    exporting.value = false;
  }
}
</script>

<style scoped>
/* 适当的样式调整 */
.q-table__card {
  border-radius: 4px;
  box-shadow: none;
}
</style>
