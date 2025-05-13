<template>
  <q-dialog v-model="dialogVisible" persistent @hide="onDialogHide">
    <q-card style="min-width: 350px">
      <q-card-section class="row items-center">
        <div class="text-h6">渠道设置</div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-card-section>
        <p class="text-subtitle2 q-mb-md">选择需要启用的渠道</p>

        <div class="q-pa-sm">
          <div class="row q-col-gutter-md">
            <div class="col-6" v-for="channel in channelConfig" :key="channel.key">
              <q-item class="channel-item" tag="label">
                <q-item-section side>
                  <q-checkbox
                    v-model="channel.enableConfig"
                    @update:model-value="updateChannelConfig"
                  />
                </q-item-section>
                <q-item-section>
                  <q-item-label>{{ channel.name }}</q-item-label>
                  <q-item-label caption>{{ channel.enableConfig ? '已启用' : '已禁用' }}</q-item-label>
                </q-item-section>
              </q-item>
            </div>
          </div>
        </div>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="取消" color="primary" v-close-popup @click="onCancel" />
        <q-btn flat label="保存" color="primary" @click="saveConfig" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useStore } from 'vuex';
import { useQuasar } from 'quasar';
import notify from "src/util/notify";

const $q = useQuasar();
const store = useStore();

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['update:visible', 'save-channel-config']);

// 对话框显示状态
const dialogVisible = computed({
  get: () => props.visible,
  set: (value) => emit('update:visible', value)
});

// 默认渠道配置
const defaultChannelConfig = [
  {
    key: "BOSS",
    name: "boss直聘",
    enableConfig: true
  },
  {
    key: "LIEPIN",
    name: "猎聘",
    enableConfig: true
  },
  {
    key: "JOB51",
    name: "前程无忧",
    enableConfig: true
  },
  {
    key: "ZHILIAN",
    name: "智联招聘",
    enableConfig: true
  }
];

// 当前渠道配置
const channelConfig = ref([]);

// 监听对话框显示状态变化
watch(() => props.visible, (newValue) => {
  if (newValue) {
    // 对话框打开时，加载最新配置
    loadChannelConfig();
  }
});

// 初始化渠道配置
onMounted(() => {
  loadChannelConfig();
});

// 加载渠道配置
const loadChannelConfig = () => {
  // 从 store 获取用户渠道配置
  const userChannelConfig = store.getters.getUserChannelConfig;

  if (userChannelConfig && Array.isArray(userChannelConfig) && userChannelConfig.length > 0) {
    // 如果有保存的配置，则合并默认配置和保存的配置
    const mergedConfig = [];

    // 先处理默认配置中的所有项
    defaultChannelConfig.forEach(defaultChannel => {
      // 查找用户配置中是否有对应项
      const userChannel = userChannelConfig.find(ch => ch.key === defaultChannel.key);

      if (userChannel) {
        // 如果用户配置中有此项，使用用户配置的值
        // 注意：兼容处理 enableConfig 和 disable 字段
        mergedConfig.push({
          key: defaultChannel.key,
          name: defaultChannel.name,
          enableConfig: userChannel.hasOwnProperty('enableConfig')
            ? userChannel.enableConfig
            : userChannel.hasOwnProperty('disable') ? !userChannel.disable : true // 默认为启用
        });
      } else {
        // 如果用户配置中没有此项，使用默认值
        mergedConfig.push({ ...defaultChannel });
      }
    });

    channelConfig.value = mergedConfig;
  } else {
    // 如果没有保存的配置，使用默认配置
    channelConfig.value = JSON.parse(JSON.stringify(defaultChannelConfig));
  }
};

// 转换配置格式：从内部的 enableConfig 转换为 API 所需的格式
const convertToApiFormat = (config) => {
  return config.map(channel => ({
    key: channel.key,
    name: channel.name,
    enableConfig: channel.enableConfig  // 直接使用 enableConfig 值，不要取反
  }));
};

// 更新渠道配置
const updateChannelConfig = () => {
  // 转换为 API 所需的格式并保存到 vuex 中
  // store.commit('setUserChannelConfig', convertToApiFormat(channelConfig.value));
};

// 处理对话框隐藏事件
const onDialogHide = () => {
  // 对话框关闭时重置配置
  loadChannelConfig();
};

// 处理取消按钮点击事件
const onCancel = () => {
  // 重置配置
  loadChannelConfig();
};

// 保存配置
const saveConfig = () => {
  // 转换为 API 所需的格式并保存到 vuex 中
  const configData = convertToApiFormat(channelConfig.value);
  store.commit('setUserChannelConfig', configData);
  
  // 向父组件发送事件，调用父组件的 saveChannelEnable 方法
  emit('save-channel-config', configData);
  
  notify.success("渠道设置已保存");
  
  dialogVisible.value = false;
};
</script>

<style scoped>
.channel-item {
  margin-bottom: 8px;
  transition: all 0.3s;
}

.channel-item:hover {
  background-color: rgba(0, 0, 0, 0.03);
}
</style>
