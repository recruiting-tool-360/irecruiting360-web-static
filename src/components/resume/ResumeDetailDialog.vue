<!--
  ResumeDetailDialog.vue

  候选人简历详情弹窗（自绘）。

  优先用卡片的 fileId 调 client/noauth/file/info，把返回的 fileUrl 交给原有 iframe
  查看器展示；历史数据没有 fileId 时继续由渠道 DomGenerator 生成简历 HTML。
-->
<template>
  <q-dialog v-model="visible" transition-show="fade" transition-hide="fade">
    <q-card class="resume-detail-dialog column no-wrap">
      <q-bar class="resume-detail-bar">
        <q-icon name="badge" size="18px" />
        <div class="text-subtitle2 q-ml-sm ellipsis">{{ dialogTitle }}</div>
        <q-space />
        <q-btn dense flat icon="close" @click="visible = false" />
      </q-bar>
      <q-separator />
      <div class="col relative-position resume-detail-body">
        <!-- 生成中 -->
        <div v-if="loading" class="absolute-center column items-center text-grey-7">
          <q-spinner-dots size="42px" color="primary" />
          <div class="q-mt-md">正在生成简历详情，请稍候…</div>
        </div>
        <!-- 失败 / 该渠道不支持 -->
        <div v-else-if="errorMessage" class="absolute-center column items-center text-center q-pa-lg">
          <q-icon name="error_outline" size="42px" color="grey-6" />
          <div class="text-grey-8 q-mt-md">{{ errorMessage }}</div>
          <q-btn
            class="q-mt-md"
            outline
            no-caps
            color="primary"
            label="在渠道中打开原始简历"
            @click="openInChannel"
          />
        </div>
        <!-- 原始图片按弹窗宽度等比缩放；PDF 和历史 HTML 继续使用 iframe -->
        <div v-else-if="originalFileUrl && isOriginalImage" class="resume-detail-pages">
          <img
            class="resume-detail-image"
            :src="originalFileUrl"
            :alt="originalFileInfo?.fileName || dialogTitle"
          />
        </div>
        <iframe
          v-else
          class="resume-detail-frame"
          :src="originalFileUrl || undefined"
          :srcdoc="originalFileUrl ? undefined : htmlDocument"
        />
      </div>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { bossDomGenerator } from 'src/hooks/bossDomGenerator';
import { zhiLianDomGenerator } from 'src/hooks/zhiLianDomGenerator';
import { job51DomGenerator } from 'src/hooks/job51DomGenerator';
import { getChannelUrl } from 'src/pluginSrc/util/ChannelUrlUtil';
import { openExternalSiteUrl } from 'src/util/openChannelLoginUrl';
import { buildResumeHtmlDocument } from 'src/util/resumeHtmlDocument';
import { lookupFileId } from 'src/util/automation/recommendFileIdMap';
import notify from 'src/util/notify';

const props = defineProps({
  /** 弹窗显隐（v-model） */
  modelValue: { type: Boolean, default: false },
  /** 候选人简历对象（ResumeCard 同一套 resume 形态） */
  resume: { type: Object, default: null }
});

const emit = defineEmits(['update:modelValue']);

// 渠道生成器内部依赖 $svgBase64Manager，必须在组件 setup 上下文里调用一次
const [bossResumeGenerateHtmlFiles, bossCssContent] = bossDomGenerator();
const [zhiLianResumeGenerateHtmlFiles, zhiLianCssContent] = zhiLianDomGenerator();
const [job51ResumeGenerateHtmlFiles, job51CssContent] = job51DomGenerator();

const generatorByChannel = {
  boss直聘: { generate: bossResumeGenerateHtmlFiles, css: bossCssContent },
  智联招聘: { generate: zhiLianResumeGenerateHtmlFiles, css: zhiLianCssContent },
  前程无忧: { generate: job51ResumeGenerateHtmlFiles, css: job51CssContent }
};

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
});

const loading = ref(false);
const errorMessage = ref('');
const htmlDocument = ref('');
const originalFileInfo = ref(null);

const originalFileUrl = computed(() => originalFileInfo.value?.fileUrl || '');
const isOriginalImage = computed(() => {
  const contentType = String(originalFileInfo.value?.contentType || '').toLowerCase();
  if (contentType.startsWith('image/')) return true;
  return /\.(avif|bmp|gif|jpe?g|png|svg|webp)(?:[?#]|$)/i.test(originalFileUrl.value);
});

const dialogTitle = computed(() => {
  const resume = props.resume;
  if (!resume) return '简历详情';
  return `${resume.name || '匿名候选人'} · ${resume.channel || ''}`;
});

// 兜底：详情生成失败 / 无生成器的渠道，仍可去渠道页看原始简历
const openInChannel = () => {
  if (!props.resume) return;
  try {
    const url = getChannelUrl(props.resume);
    if (url) openExternalSiteUrl(url, { forceReload: true });
  } catch (error) {
    console.warn('[ResumeDetailDialog] 获取渠道详情地址失败:', error?.message || error);
    notify.warning('候选人详情地址已失效，请重新查询后再试');
  }
};

const PLACEHOLDER_FILE_ID = 'placeholder-file-id-init-or-upload-failed';

const resolveFileId = (resume) => {
  const directFileId =
    resume?.fileId ||
    resume?.resumeFileId ||
    resume?.resumeFile?.fileId ||
    resume?.resumeInfo?.fileId ||
    resume?._raw?.fileId ||
    resume?._raw?.resumeFile?.fileId ||
    resume?._raw?.resumeInfo?.fileId;
  if (directFileId && directFileId !== PLACEHOLDER_FILE_ID) return String(directFileId);

  for (const localId of [
    resume?.taskResumeId,
    resume?.resumeBlindId,
    resume?.id,
    resume?._raw?.taskResumeId,
    resume?._raw?.resumeBlindId,
    resume?._raw?.uniqSign
  ]) {
    const mappedFileId = lookupFileId(localId);
    if (mappedFileId && mappedFileId !== PLACEHOLDER_FILE_ID) return String(mappedFileId);
  }
  return '';
};

const normalizeFileUrl = (value) => {
  const url = String(value || '').trim();
  if (!url) throw new Error('原始文件接口未返回 fileUrl');
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('原始文件地址协议不受支持');
  }
  return parsed.href;
};

const loadOriginalFile = async (fileId) => {
  const bridge = window.api?.ihrBridge;
  const hasFileInfoApi = typeof bridge?.getCandidateFileInfo === 'function';
  console.log('[ResumeDetailDialog] file/info 请求参数:', {
    fileId,
    hasFileInfoApi
  });
  if (!bridge || !hasFileInfoApi) {
    throw new Error('当前环境不支持查询原始文件，请重启客户端后重试');
  }
  const response = await bridge.getCandidateFileInfo(fileId);
  console.log('[ResumeDetailDialog] file/info 返回值:', response);
  if (!response?.success) {
    throw new Error(response?.message || '查询候选人原始文件失败');
  }
  originalFileInfo.value = {
    ...response.data,
    fileUrl: normalizeFileUrl(response.data?.fileUrl)
  };
  console.log('[ResumeDetailDialog] file/info 解析结果:', originalFileInfo.value);
};

const buildHtml = async () => {
  const resume = props.resume;
  htmlDocument.value = '';
  errorMessage.value = '';
  originalFileInfo.value = null;
  if (!resume) return;

  loading.value = true;
  try {
    const fileId = resolveFileId(resume);
    if (fileId) {
      await loadOriginalFile(fileId);
      return;
    }

    const generator = generatorByChannel[resume.channel];
    if (!generator) {
      throw new Error(`${resume.channel || '该渠道'}暂不支持生成简历详情`);
    }

    const payload = {
      id: resume.id,
      name: resume.name,
      channel: resume.channel,
      gender: resume.gender,
      originalResumeUrlInfo: resume.originalResumeUrlInfo,
      type: 'normal',
      isMaster: true
    };

    // isSingle=true：单份简历走插件实时拉详情，跟「分配职位」生成 HTML 是同一条链路
    const result = await generator.generate([payload], true);
    const target = result?.[resume.id] || Object.values(result || {})[0];
    if (!target?.htmlContent) {
      throw new Error('未获取到该候选人的简历详情数据');
    }

    htmlDocument.value = buildResumeHtmlDocument({
      htmlContent: target.htmlContent,
      cssContent: generator.css,
      title: dialogTitle.value
    });
  } catch (error) {
    console.error('[ResumeDetailDialog] 生成简历详情失败:', error);
    errorMessage.value = error?.message || '生成简历详情失败，请稍后重试';
  } finally {
    loading.value = false;
  }
};

// 打开弹窗 / 弹窗内切换候选人时重新生成
watch(
  () => [props.modelValue, props.resume?.id, props.resume?.fileId],
  ([open]) => {
    if (open) buildHtml();
  }
);
</script>

<style scoped lang="scss">
.resume-detail-dialog {
  width: min(920px, 92vw);
  height: 88vh;
  max-width: 92vw;
  border-radius: 8px;
}

.resume-detail-bar {
  min-height: 44px;
  background: #f5f7fa;
  color: #1f262e;
}

.resume-detail-body {
  background: #f5f5f5;
  overflow: hidden;
}

.resume-detail-pages {
  width: 100%;
  height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  background: #f5f5f5;
}

.resume-detail-image {
  display: block;
  width: 100%;
  height: auto;
  margin: 0;
}

.resume-detail-frame {
  display: block;
  width: 100%;
  height: 100%;
  border: none;
  background: #f5f5f5;
}
</style>
