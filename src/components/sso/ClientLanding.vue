<template>
  <div class="client-landing">
    <q-card flat class="landing-card q-pa-lg">
      <!-- Logo + 标题 -->
      <div class="text-center q-mb-md">
        <q-avatar size="56px" class="q-mb-sm">
          <img :src="'/logo/logo.svg'" alt="i快招" />
        </q-avatar>
        <div class="text-h5 text-weight-bold text-grey-9">i快招智能招聘助手</div>
        <div class="text-body2 text-grey-7 q-mt-xs">{{ subtitle }}</div>
      </div>

      <!-- 状态卡片：唤起中 / 唤起失败 -->
      <div v-if="status === 'launching'" class="status-block q-py-md">
        <q-spinner color="primary" size="2em" />
        <div class="text-subtitle2 text-grey-8 q-mt-sm">正在打开客户端...</div>
        <div class="text-caption text-grey-6 q-mt-xs">如果系统弹出"打开 i快招"提示，请点击允许</div>
      </div>

      <div
        v-else-if="status === 'success'"
        class="status-block q-py-md text-positive"
      >
        <q-icon name="check_circle" size="2em" />
        <div class="text-subtitle2 q-mt-sm">已为您打开客户端</div>
        <div class="text-caption text-grey-6 q-mt-xs">请在客户端窗口继续操作</div>
      </div>

      <div v-else-if="status === 'missing'" class="status-block q-py-md">
        <q-icon name="info" color="warning" size="2em" />
        <div class="text-subtitle2 text-grey-8 q-mt-sm">未检测到 i快招客户端</div>
        <div class="text-caption text-grey-6 q-mt-xs">请下载安装后重试，或继续在浏览器中使用</div>
      </div>

      <q-separator class="q-my-md" />

      <!-- 主操作区 -->
      <div class="actions-block">
        <!-- 已安装：一键打开 -->
        <q-btn
          unelevated
          color="primary"
          icon="rocket_launch"
          :label="status === 'missing' ? '我已安装，重试打开' : '打开客户端'"
          class="full-width q-mb-md"
          size="md"
          :loading="status === 'launching'"
          @click="handleLaunchClick"
        />

        <!-- 下载安装 -->
        <q-btn
          outline
          color="primary"
          icon="download"
          :label="downloadLabel"
          class="full-width q-mb-md"
          size="md"
          :disable="!downloadInfo"
          @click="handleDownloadClick"
        />

        <!-- 浏览器兜底 -->
        <div class="text-center">
          <q-btn
            flat
            no-caps
            color="grey-7"
            label="继续在浏览器中使用"
            size="sm"
            @click="$emit('use-web')"
          />
        </div>
      </div>

      <!-- 底部提示 -->
      <div class="footer-tips q-mt-md text-center">
        <q-separator class="q-mb-sm" />
        <div class="text-caption text-grey-6">
          {{ hintText }}
        </div>
        <div v-if="isEmbeddedWebview" class="text-caption text-warning q-mt-xs">
          检测到您正在 {{ embeddedName }} 内打开，<br />
          建议在系统浏览器中访问以获得完整体验
        </div>
      </div>
    </q-card>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, defineProps, defineEmits } from 'vue';
import {
  detectOS,
  osLabel,
  fetchClientManifest,
  pickDownloadUrl,
  isInsideEmbeddedWebview
} from 'src/util/clientPlatform';

const props = defineProps({
  /** 'idle' | 'launching' | 'success' | 'missing' */
  status: {
    type: String,
    default: 'idle'
  },
  subtitle: {
    type: String,
    default: '为获得最佳招聘渠道整合体验，建议使用桌面客户端'
  }
});

const emit = defineEmits(['launch', 'use-web']);

const os = ref(detectOS());
const downloadInfo = ref(null);
const isEmbeddedWebview = ref(isInsideEmbeddedWebview());

const embeddedName = computed(() => {
  if (typeof navigator === 'undefined') return '应用';
  const ua = (navigator.userAgent || '').toLowerCase();
  if (/dingtalk/.test(ua)) return '钉钉';
  if (/lark|feishu/.test(ua)) return '飞书';
  if (/wxwork/.test(ua)) return '企业微信';
  if (/micromessenger/.test(ua)) return '微信';
  return '应用';
});

const downloadLabel = computed(() => {
  if (!downloadInfo.value) return '正在加载下载信息...';
  return `下载 ${osLabel(os.value)} 版客户端`;
});

const hintText = computed(() => {
  if (props.status === 'success') return '客户端将在新窗口中继续您的登录流程';
  return '已安装客户端的用户首次唤起需在系统弹窗中点击"允许"';
});

onMounted(async () => {
  // 异步拉 manifest 拼下载链接（失败也不影响主流程）
  const manifest = await fetchClientManifest();
  downloadInfo.value = pickDownloadUrl(manifest);
});

function handleLaunchClick() {
  emit('launch');
}

function handleDownloadClick() {
  if (!downloadInfo.value?.url) return;
  // 用 a 元素直接跳，避免被部分 webview 拦截
  const a = document.createElement('a');
  a.href = downloadInfo.value.url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
</script>

<style scoped>
.client-landing {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  background: linear-gradient(135deg, #f5f7fb 0%, #eef2ff 100%);
}
.landing-card {
  width: 100%;
  max-width: 420px;
  border-radius: 14px;
  background: #ffffff;
  box-shadow:
    0 4px 24px rgba(31, 124, 255, 0.08),
    0 1px 4px rgba(0, 0, 0, 0.04);
}
.status-block {
  text-align: center;
}
.actions-block .q-btn {
  border-radius: 8px;
}
.footer-tips {
  font-size: 12px;
  line-height: 1.5;
}
</style>
