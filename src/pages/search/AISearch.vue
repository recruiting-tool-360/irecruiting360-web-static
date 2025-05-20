<template>
  <div class="q-py-xs q-px-xs sss">
    <!-- 自定义加载遮罩 -->
    <div v-if="isLoading" class="custom-loading-overlay">
      <q-spinner color="primary" size="3em" />
      <div class="text-subtitle1 q-mt-sm text-white">正在搜索数据，请稍候...</div>
    </div>

    <q-card flat bordered class="search-filter-card q-px-xs" style="min-height: 90vh">
      <q-card-section class="q-pa-sm">
        <!-- 渠道标签和操作按钮区域 -->
        <div class="row no-wrap">
          <!-- 渠道标签区域 (7/12) -->
          <div class="col-9 channel-container" style="">
            <q-tabs
              v-model="selectedChannel"
              dense
              inline-label
              no-caps
              @update:model-value="handleChannelSelection"
              class="channel-tabs bg-white text-grey-9 text-bold shadow-2 flex justify-lg-start"
              active-color="primary"
              align="left"
              indicator-color="primary"
              :breakpoint="0"
            >
              <!-- 渠道聚合 Tab -->
              <q-tab
                name="ALL"
                @click="handleChannelSelection('ALL')"
                class="channel-tab"
              >
                <q-avatar size="sm" color="primary" text-color="white" class="q-mr-sm">
                  {{ allChannelStatus.ALL?.name?.charAt(0)?.toUpperCase() || '?' }}
                </q-avatar>
                <span class="text-subtitle2">{{allChannelStatus.ALL.name}}</span>
<!--                <q-badge v-if="allChannelStatus.ALL.dataSize > 0" color="red-5" floating>-->
<!--                  {{ allChannelStatus.ALL.dataSize }}-->
<!--                </q-badge>-->
              </q-tab>

              <!-- 动态显示的渠道选项 -->
              <q-tab
                v-for="channel in visibleChannels"
                :key="channel.key"
                :name="channel.key"
                v-show="getChannelDisable(channel.key)"
                @click="handleChannelSelection(channel.key)"
                class="channel-tab"
              >
<!--                <q-badge class="" :color="channel.login?'green':'red'" floating>{{ channel.login ? '已登录' : '未登录' }}</q-badge>-->
                <q-avatar size="xs" color="white" text-color="primary" class="q-mr-sm">
<!--                  {{ channel?.name?.charAt(0)?.toUpperCase() || '?' }}-->
                  <img :src="channel.logo" />
                </q-avatar>
                <span class="text-subtitle2">{{channel.name}}</span>
                <span class="login-status-container">
                  (<span 
                    class="q-ma-none q-pa-none cursor-pointer text-bold" 
                    :class="channel.login ? 'text-primary' : 'text-grey'"
                  >{{ channel.login ? '已登录' : '未登录' }}</span>
                  <q-btn 
                    v-if="!channel.login" 
                    flat 
                    dense 
                    round 
                    icon="refresh" 
                    size="xs" 
                    class="refresh-btn"
                    @click.stop="refreshChannelLogin(channel.key)"
                  >
                    <q-tooltip>刷新登录状态</q-tooltip>
                  </q-btn>)
                </span>
                <q-badge v-if="channel.dataSize > 0" color="red-5" floating>
                  {{ channel.dataSize }}
                </q-badge>
                <q-tooltip>
                  {{ !getChannelDisable(channel.key) ? '已禁用' : (channel.login ? '已登录' : '请登录')}}
                </q-tooltip>
              </q-tab>

              <!-- 收藏 Tab -->
              <q-tab
                v-if="chatId"
                name="Collect"
                @click="handleChannelSelection('Collect')"
                class="channel-tab"
              >
                <q-avatar size="sm" color="primary" text-color="white" class="q-mr-sm">
                  {{ allChannelStatus.Collect?.name?.charAt(0)?.toUpperCase() || '?' }}
                </q-avatar>
                <span class="text-subtitle2">{{allChannelStatus.Collect.name}}</span>
                <q-badge v-if="allChannelStatus.Collect.dataSize > 0" color="red-5" floating>
                  {{ allChannelStatus.Collect.dataSize }}
                </q-badge>
              </q-tab>

              <!-- 更多渠道下拉菜单 -->
              <q-btn-dropdown
                v-if="hiddenChannels.length > 0"
                auto-close
                stretch
                flat
                icon="more_horiz"
                class="text-primary more-dropdown"
              >
                <q-list>
                  <q-item
                    v-for="channel in hiddenChannels"
                    :key="channel.key"
                    clickable
                    v-close-popup
                    @click="handleChannelSelection(channel.key)"
                    class="channel-dropdown-item"
                  >
                    <q-item-section>
                      <div>
                        <q-avatar size="sm" color="primary" text-color="white" class="q-mr-sm">
                          {{ channel?.name?.charAt(0)?.toUpperCase() || '?' }}
                        </q-avatar>
                        <span class="text-subtitle2">{{channel.name}}</span>
                        <q-badge class="q-ml-xs q-mb-xs" rounded align="middle" :color="!getChannelDisable(channel.key) ? 'grey' : (channel.login ? 'green' : 'red')" outline>
                          {{ !getChannelDisable(channel.key) ? '已禁用' : (channel.login ? '已登录' : '未登录') }}
                        </q-badge>
                    </div>
                    </q-item-section>
                    <q-item-section side v-if="channel.dataSize > 0">
                      <q-badge color="red-5">{{ channel.dataSize }}</q-badge>
                    </q-item-section>
                    <q-item-section side v-if="!channel.login" class="text-grey-6">
                      <q-btn 
                        flat 
                        dense 
                        round 
                        icon="refresh" 
                        size="xs" 
                        class="refresh-btn"
                        @click.stop="refreshChannelLogin(channel.key)"
                      >
                        <q-tooltip>刷新登录状态</q-tooltip>
                      </q-btn>
                    </q-item-section>
                  </q-item>
                </q-list>
              </q-btn-dropdown>
            </q-tabs>
          </div>

          <q-space />

          <!-- 操作按钮区域 (5/12) -->
          <div class="col-auto operation-container q-mx-lg">
            <div class="row wrap items-center justify-end full-height q-ml-md q-mr-none">
              <!-- 左侧操作 -->
              <div class="col-auto">
                <q-checkbox
                  v-model="onlyShowUnread"
                  label="未读"
                  size="xs"
                  dense
                  class="q-mr-sm text-bold"
                  :class="onlyShowUnread?'text-primary' : 'text-grey-7'"
                  @update:model-value="handleUnreadChange"
                />

                <q-btn
                  v-if="selectedChannel  !== 'Collect'"
                  flat
                  dense
                  :color="aiSort ? 'primary' : 'grey-7'"
                  @click="toggleAiSort"
                  class="q-mr-sm"
                >
                  <q-icon :name="aiSort ? 'auto_awesome' : 'sort'" size="xs"></q-icon>
                  AI排序
                  <q-tooltip>{{ 'AI排序' }}</q-tooltip>
                </q-btn>
              </div>

              <!-- 右侧操作 -->
              <div class="col-auto">
<!--                <q-btn-->
<!--                  flat-->
<!--                  dense-->
<!--                  color="primary"-->
<!--                  @click="loadMoreData"-->
<!--                  class="q-mr-sm"-->
<!--                >-->
<!--                  <q-icon name="refresh" size="xs"></q-icon>-->
<!--                  加载更多数据-->
<!--                  <q-tooltip>加载更多数据</q-tooltip>-->
<!--                </q-btn>-->

                <!-- 更多操作下拉菜单 -->
                <q-btn-dropdown
                  flat
                  dense
                  color="primary"
                  icon="more_vert"
                  label=""
                >
                  <q-list>
<!--                    <q-item clickable v-close-popup @click="exportData">-->
<!--                      <q-item-section avatar>-->
<!--                        <q-icon name="download" color="primary" />-->
<!--                      </q-item-section>-->
<!--                      <q-item-section>导出数据</q-item-section>-->
<!--                    </q-item>-->

                    <q-item clickable v-close-popup @click="toggleBatchMode">
                      <q-item-section avatar>
                        <q-icon name="checklist" color="primary" />
                      </q-item-section>
                      <q-item-section>{{ store.getters.getResumeBatchMode ? '关闭批量操作' : '开启批量操作' }}</q-item-section>
                    </q-item>

<!--                    <q-item clickable v-close-popup @click="markAllAsRead">-->
<!--                      <q-item-section avatar>-->
<!--                        <q-icon name="mark_email_read" color="blue" />-->
<!--                      </q-item-section>-->
<!--                      <q-item-section>标记所有为已读</q-item-section>-->
<!--                    </q-item>-->

                    <q-separator />

                    <q-item clickable v-close-popup @click="openSettings">
                      <q-item-section avatar>
                        <q-icon name="settings" color="grey-8" />
                      </q-item-section>
                      <q-item-section>设置</q-item-section>
                    </q-item>
                  </q-list>
                </q-btn-dropdown>
              </div>
            </div>
          </div>
        </div>
      </q-card-section>

      <!-- 内容区域 -->
      <q-card-section class="list-container">
<!--        <div v-if="isLoading && !hasData" class="flex flex-center q-pa-xl">-->
<!--          <q-spinner color="primary" size="3em" />-->
<!--          <div class="q-ml-sm text-subtitle1">正在加载数据...</div>-->
<!--        </div>-->

<!--        <div v-else-if="!hasData" class="flex flex-center column q-pa-xl">-->
<!--          <q-icon name="search_off" size="4em" color="grey-5" />-->
<!--          <div class="text-subtitle1 q-mt-md text-grey-7">暂无数据</div>-->
<!--          <q-btn-->
<!--            outline-->
<!--            color="primary"-->
<!--            class="q-mt-md"-->
<!--            icon="refresh"-->
<!--            label="刷新"-->
<!--            @click="loadMoreData"-->
<!--          />-->
<!--        </div>-->

        <div class="search-result-container">
          <!-- 使用v-show替代动态组件加载 -->
          <JobInfo ref="jobInfoRef" v-show="selectedChannel==='ALL'" v-model:third-party-channel-config="allThirdPartyChannelConfig" :on-loding-open="loadingOpen" :on-loding-close="loadingClose" ></JobInfo>
          <BossJobInfo ref="bossJobInfoRef" v-show="selectedChannel==='BOSS'" :on-loding-open="loadingOpen" :on-loding-close="loadingClose" ></BossJobInfo>
          <ZHILIANJobInfo ref="zhiLianInfoRef" v-show="selectedChannel==='ZHILIAN'" :on-loding-open="loadingOpen" :on-loding-close="loadingClose"></ZHILIANJobInfo>
          <LIEPINJobInfo ref="liePinInfoRef" v-show="selectedChannel==='LIEPIN'" :on-loding-open="loadingOpen" :on-loding-close="loadingClose" ></LIEPINJobInfo>
          <JOB51JobInfo ref="job51InfoRef" v-show="selectedChannel==='JOB51'" :on-loding-open="loadingOpen" :on-loding-close="loadingClose"></JOB51JobInfo>
          <CollectJobInfo ref="collectInfoRef" v-show="selectedChannel==='Collect'&&chatId" v-model:third-party-channel-config="allThirdPartyChannelConfig" :on-loding-open="loadingOpen" :on-loding-close="loadingClose"></CollectJobInfo>
        </div>
        <!-- 调试信息 -->
        <div v-if="componentLoadError" class="text-center q-pa-md text-negative">
          组件加载失败: {{ selectedChannel }}
          <div class="q-mt-md">
            <div>错误信息: {{ errorMessage }}</div>
            <div>可用组件: {{ Object.keys(channelComponents).join(', ') }}</div>
          </div>
        </div>
      </q-card-section>
    </q-card>

    <!-- 添加队列状态监视器 -->
    <queue-status-monitor v-if="showQueueMonitor" />

    <!-- 添加渠道设置对话框 -->
    <channel-settings-dialog
      v-model:visible="showSettingsDialog"
      @save-channel-config="saveChannelEnable"
    />

    <!-- 添加插件安装提醒对话框 -->
    <plugin-install-dialog ref="pluginInstallDialogRef" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from "vue";
import { useStore } from "vuex";
import { useQuasar } from "quasar";
import {
  pluginBossResultProcessor,
  pluginJob51ResultProcessor, pluginLIEPINResultProcessor,
  pluginResultProcessor, pluginZhiLianResultProcessor
} from 'src/pluginSrc/verifyes/PluginProcessor';
import { getPluginBaseConfig, getPluginCookieBaseConfig } from 'src/pluginSrc/config/PluginRequestManager';
import * as BossJobInfoManager from 'src/pluginSrc/channels/BossJobInfoManager';
import * as Job51InfoManager from 'src/pluginSrc/channels/Job51InfoManager';
import * as ZhiLianJobInfoManager from 'src/pluginSrc/channels/ZhiLianJobInfoManager';
import * as LIEPINJobInfoManager from 'src/pluginSrc/channels/LIEPINJobInfoManager';
import JobInfo from './channel/JobInfo.vue';
import BossJobInfo from './channel/BossJobInfo.vue';
import JOB51JobInfo from './channel/JOB51JobInfo.vue';
import ZHILIANJobInfo from './channel/ZHILIANJobInfo.vue';
import LIEPINJobInfo from './channel/LIEPINJobInfo.vue';
import CollectJobInfo from './channel/CollectJobInfo.vue';
import {setDefaultPluginRules} from "src/pluginSrc/util/BasePluginManager";
import {pluginRequest} from "src/pluginSrc/config/PluginStatus";
import {convertSearchConditionRequest} from "src/pjo/dto/request/SaveSearchRequest";
import {saveCondition} from "src/api/search/SearchApi";
import QueueStatusMonitor from './components/QueueStatusMonitor.vue';
import ChannelSettingsDialog from 'src/components/settings/ChannelSettingsDialog.vue';
import {convertSearchState} from "src/pjo/dto/request/SearchStateConfig";
import {getCurrentConditionByChatId} from "src/api/chat/ChatApi";
import notify from "src/util/notify";
import {asyncTaskQueueManager} from "src/pluginSrc/util/AsyncTaskQueueManager";
import PluginInstallDialog from 'src/components/plugins/PluginInstallDialog.vue';

// 定义组件属性
const props = defineProps({
  searchState: {
    type: Object,
    default: () => ({})
  }
});

const store = useStore();
const $q = useQuasar();

//搜索条件
const searchState = computed(() => props.searchState);

//搜索条件
const pluginInstalled = computed(() => store.getters.getPluginInstall);

// 用户信息
const userInfo = computed(() => store.getters.getUserInfo);
//当前chat id
const chatId = computed(() => store.getters.getLatestChatId);

// 所有渠道状态
const allChannelStatus = computed(() => store.getters.getChannelConf);

// 所有第三方渠道配置
const allThirdPartyChannelConfig = computed(() => {
  return Object.entries(allChannelStatus.value)
    .filter(([key, channel]) => !(key === 'ALL' || key === 'Collect'))
    .map(([key, channel]) => ({ ...channel }));
});

//渠道设置配置
const showSettingsChannelConfig = computed(()=>store.getters.getUserChannelConfig);

// 当前选择的渠道
const selectedChannel = ref('ALL');
const componentLoadError = ref(false);
const errorMessage = ref('');

// 控制选项卡的状态
const onlyShowUnread = computed({
  get: () => store.getters.getUnreadCheckBoxV,
  set: (val) => store.commit('changeUnreadCheckBoxV', val)
});
const aiSort = computed(()=>{
  return allChannelStatus.value[selectedChannel.value].aiSort;
});
const isLoading = ref(false);
const hasData = ref(false);

// 组件引用
const jobInfoRef = ref(null);
const bossJobInfoRef = ref(null);
const zhiLianInfoRef = ref(null);
const liePinInfoRef = ref(null);
const job51InfoRef = ref(null);
const collectInfoRef = ref(null);
const pluginInstallDialogRef = ref(null);

// 加载控制函数
const loadingOpen = () => {
  isLoading.value = true;
};

const loadingClose = () => {
  isLoading.value = false;
};

// 根据窗口大小确定可见渠道和隐藏渠道
const visibleChannels = ref([]);
const hiddenChannels = ref([]);

// 动态渠道组件映射
const channelComponents = {
  'ALL': JobInfo,
  'BOSS': BossJobInfo,
  'JOB51': JOB51JobInfo,
  'ZHILIAN': ZHILIANJobInfo,
  'LIEPIN': LIEPINJobInfo,
  'Collect': CollectJobInfo
};

// 添加对关联关系的调试
// console.log('渠道组件映射:', Object.keys(channelComponents));

//获取渠道禁用状态
const getChannelDisable = (key) => {
  const channelConfig = showSettingsChannelConfig.value.find(config => config.key === key);
  // 如果找到配置且 enableConfig 为 false 则禁用，否则不禁用
  return channelConfig.enableConfig;
};

//保存渠道配置
const saveChannelEnable = (configData) => {
  console.log('保存渠道配置:', configData);

  if (configData && Array.isArray(configData)) {
    // 遍历配置数据
    configData.forEach(config => {
      const channelKey = config.key;
      const isEnabled = config.enableConfig;

      // 如果该渠道存在于allChannelStatus中
      if (allChannelStatus.value[channelKey]) {
        console.log(`处理渠道 ${channelKey}，启用状态: ${isEnabled}`);

        // 如果禁用了渠道
        if (!isEnabled) {
          // 清空该渠道的数据
          let channelConfByAll = store.getters.getChannelConfByAll;
          if (channelConfByAll && channelConfByAll.data.length > 0) {
            // 记录被清空的数据数量
            const clearedCount = allChannelStatus.value[channelKey].data.length;

            // 清空该渠道的数据
            store.commit('changeChannelConfData', {
              key: channelKey,
              value: []
            });

            // 更新数据大小
            store.commit('changeChannelConfDataSize', {
              key: channelKey,
              value: 0
            });

            // 更新搜索条件
            store.commit('setSearchChannelConditionRequestData', {
              key: channelKey,
              config: {
                channelDataTotal: 0,
                channelPage: 0,
                channelCountSize: 0,
                totalPage: 0,
                dataList: [],
                channelKey: channelKey
              }
            });
            // 确保在清空数据后停止分数自动更新
            if (allChannelStatus.value[channelKey].cardInfoRef &&
                typeof allChannelStatus.value[channelKey].cardInfoRef.initializationStatus === 'function') {
              allChannelStatus.value[channelKey].cardInfoRef.initializationStatus();
            }

            console.log(`已清空渠道 ${channelKey} 的 ${clearedCount} 条数据`);

            // 处理 ALL 聚合渠道
            if (allChannelStatus.value.ALL && allChannelStatus.value.ALL.data && allChannelStatus.value.ALL.data.length > 0) {
              // 获取当前 ALL 渠道的数据
              const allData = [...allChannelStatus.value.ALL.data];

              // 过滤掉禁用渠道的数据
              const filteredData = allData.filter(item => item.channel !== allChannelStatus.value[channelKey].desc);

              // 更新 ALL 渠道的数据
              store.commit('changeChannelConfData', {
                key: 'ALL',
                value: filteredData
              });

              // 更新 ALL 渠道的数据大小
              store.commit('changeChannelConfDataSize', {
                key: 'ALL',
                value: filteredData.length
              });

              // 确保在更新 ALL 渠道数据后也停止其分数自动更新
              if (allChannelStatus.value['ALL'].cardInfoRef &&
                  typeof allChannelStatus.value['ALL'].cardInfoRef.initializationStatus === 'function') {
                allChannelStatus.value['ALL'].cardInfoRef.initializationStatus();
              }

              console.log(`已从 ALL 聚合渠道中移除渠道 ${channelKey} 的数据，剩余数据 ${filteredData.length} 条`);
            }
          }
        }
      }
    });

    // 如果当前选中的渠道已被禁用，自动切换到 ALL 渠道
    const currentChannel = selectedChannel.value;
    if (currentChannel !== 'ALL' && currentChannel !== 'Collect') {
      const currentConfig = configData.find(config => config.key === currentChannel);
      if (currentConfig && !currentConfig.enableConfig) {
        selectedChannel.value = 'ALL';
        console.log('当前渠道已禁用，自动切换到 ALL 渠道');
        notify.info(`${allChannelStatus.value[currentChannel].name} 渠道已禁用，已切换到渠道聚合视图`);
      }
    }
  }
};

// 添加组件监视辅助函数
const verifyComponentMapping = () => {
  // 记录所有键值映射
  const mappingResults = {};
  Object.entries(channelComponents).forEach(([key, component]) => {
    // 存储映射关系
    mappingResults[key] = {
      componentExists: !!component,
      componentName: component ? component.name || '未命名组件' : '组件不存在'
    };

    if (!component) {
      console.error(`组件映射错误: ${key} 的组件是 ${component}`);
    }
  });

  // 输出完整映射关系
  // console.log('完整渠道映射关系:', mappingResults);

  // 检查组件是否能正确获取
  if (!channelComponents[selectedChannel.value]) {
    componentLoadError.value = true;
    errorMessage.value = `无法加载渠道 ${selectedChannel.value} 的组件`;
    console.error(errorMessage.value);
    console.log('现有渠道映射:', channelComponents);
    // 尝试从对象上获取信息
    console.log('渠道键和名称详情:',
      Object.keys(allChannelStatus.value).map(key => ({
        key,
        name: allChannelStatus.value[key].name,
        matchedComponent: channelComponents[key] ? 'Yes' : 'No'
      }))
    );
  } else {
    componentLoadError.value = false;
    errorMessage.value = '';
  }
};

// 初始化插件配置
const initializePluginConfig = async () => {
  let pluginBaseConfig = getPluginBaseConfig();
  let pluginCookieBaseConfig = getPluginCookieBaseConfig();

  // 依次执行插件配置请求
  let pluginConfigRs = await pluginRequest(pluginBaseConfig.action, pluginBaseConfig);
  let pluginCookieConfigRs = await pluginRequest(pluginCookieBaseConfig.action, pluginCookieBaseConfig);

  return {
    baseConfigResult: pluginConfigRs,
    cookieConfigResult: pluginCookieConfigRs
  };
};

// 修改检查插件是否安装函数
const checkPluginInstalled = async () => {
  try {
    // 直接通过初始化插件配置来检查插件是否安装
    const result = await initializePluginConfig();
    return result &&
           result.baseConfigResult &&
           result.cookieConfigResult &&
           result.baseConfigResult.success &&
           result.cookieConfigResult.success;
  } catch (error) {
    console.error('插件检测失败:', error);
    // $q.notify({
    //   message: '系统监测到【i快找】浏览器插件异常，请及时安装最新插件！',
    //   color: 'negative',
    //   icon: 'error'
    // });
    return false;
  }
};

// 检查各渠道登录状态
const checkChannelLoginStatus = async () => {
  // 并行执行所有渠道的登录检查
  const checkPromises = [
    {
      key: 'BOSS',
      check: async () => {
        try {
          // 使用正确的方法检查登录状态
          const result = await BossJobInfoManager.bossUserStatus();
          return result && pluginBossResultProcessor(result);
        } catch (error) {
          console.error('BOSS登录检查失败:', error);
          return false;
        }
      }
    },
    {
      key: 'JOB51',
      check: async () => {
        try {
          // 使用正确的方法检查登录状态
          const result = await Job51InfoManager.job51UserStatus();
          return result && pluginJob51ResultProcessor(result);
        } catch (error) {
          console.error('51Job登录检查失败:', error);
          return false;
        }
      }
    },
    {
      key: 'ZHILIAN',
      check: async () => {
        try {
          // 使用正确的方法检查登录状态
          const result = await ZhiLianJobInfoManager.zhiLianUserStatus();
          return result && pluginZhiLianResultProcessor(result);
        } catch (error) {
          console.error('智联登录检查失败:', error);
          return false;
        }
      }
    },
    {
      key: 'LIEPIN',
      check: async () => {
        try {
          // 使用正确的方法检查登录状态
          const result = await LIEPINJobInfoManager.liePinUserStatus();
          return result && pluginLIEPINResultProcessor(result);
        } catch (error) {
          console.error('猎聘登录检查失败:', error);
          return false;
        }
      }
    }
  ];

  const results = await Promise.allSettled(
    checkPromises.map(async ({ key, check }) => {
      try {
        const result = await check();
        const isLoggedIn = result;

        // 更新登录状态
        store.commit('changeChannelConfLogin', {
          key: key,
          value: isLoggedIn
        });

        // 如果登录了，不再禁用
        if (isLoggedIn) {
          store.commit('changeChannelConfDisable', {
            key: key,
            value: false
          });
        }

        return { key, isLoggedIn };
      } catch (error) {
        console.error(`${key} 登录状态检查失败:`, error);
        return { key, isLoggedIn: false };
      }
    })
  );

  // console.log('渠道登录状态检查结果:', results);
};

// 初始化插件和渠道状态
const initPluginAndChannels = async () => {
  // isLoading.value = true;

  // 检查插件安装状态（同时会初始化插件配置）
  const pluginInstalled = await checkPluginInstalled();
  if (!pluginInstalled) {
    // isLoading.value = false;

    // 更新插件安装状态
    store.commit('changePluginInstall', false);

    // 使用新的对话框显示插件安装提示
    if (pluginInstallDialogRef.value) {
      pluginInstallDialogRef.value.openDialog();
    }

    return;
  } else {
    // 更新插件安装状态为已安装
    store.commit('changePluginInstall', true);
  }

  //设置插件规则
  let ruleConfig = await setDefaultPluginRules();
  if(!pluginResultProcessor(ruleConfig)){
    return;
  }
  // 检查各渠道登录状态
  await checkChannelLoginStatus();

  // 强制更新渠道视图，确保登录状态正确显示
  await forceUpdateChannelView();

  // 更新界面
  // updateChannelVisibility();
  // isLoading.value = false;
};

// 初始化时加载渠道显示
onMounted(async () => {
  // 初始化插件和渠道状态
  await initPluginAndChannels();

  // 初始化渠道ref
  store.commit('changeChannelCardInfoRef', {key: "ALL", value: jobInfoRef.value});
  store.commit('changeChannelCardInfoRef', {key: "BOSS", value: bossJobInfoRef.value});
  store.commit('changeChannelCardInfoRef', {key: "ZHILIAN", value: zhiLianInfoRef.value});
  store.commit('changeChannelCardInfoRef', {key: "LIEPIN", value: liePinInfoRef.value});
  store.commit('changeChannelCardInfoRef', {key: "JOB51", value: job51InfoRef.value});
  store.commit('changeChannelCardInfoRef', {key: "Collect", value: collectInfoRef.value});

  // 验证组件映射是否正确
  // verifyComponentMapping();

  // 监听窗口大小变化
  window.addEventListener('resize', updateChannelVisibility);

  // 打印渠道信息
  // console.log('渠道状态:', allChannelStatus.value);

  // 模拟加载数据，实际项目中可以删除
  // simulateDataLoading();
});

// 在组件卸载前移除事件监听
const beforeUnmount = () => {
  window.removeEventListener('resize', updateChannelVisibility);
};

// 更新渠道显示逻辑
const updateChannelVisibility = () => {
  // 获取渠道容器宽度
  const containerWidth = document.querySelector('.channel-container')?.offsetWidth || 800;
  const tabBarPadding = 20; // 预估的内边距总和
  const moreDropdownWidth = 50; // 更多按钮的宽度
  const availableWidth = containerWidth - tabBarPadding - moreDropdownWidth;

  // 必须显示的两个标签：ALL和Collect，预估它们的宽度
  const fixedTabsWidth = 200; // ALL和Collect标签估计的宽度
  const remainingWidth = availableWidth - fixedTabsWidth;

  // 预估每个标签的平均宽度
  const averageTabWidth = 110;

  // 计算可以显示的渠道数量
  const maxVisibleTabs = Math.floor(remainingWidth / averageTabWidth);

  // 获取所有第三方渠道
  let allChannels = [...allThirdPartyChannelConfig.value];

  //过滤掉已经禁用状态的渠道
  // allChannels = allChannels.filter(channel => {
  //   return getChannelDisable(channel.key)
  // });
  // 打印渠道信息
  // console.log('渠道显示更新:', {
  //   '所有渠道': allChannels.map(c => c.key),
  //   '最大可见标签数': maxVisibleTabs
  // });

  // 根据可用空间分配渠道
  if (maxVisibleTabs >= allChannels.length) {
    // 如果空间足够，全部显示
    visibleChannels.value = allChannels;
    hiddenChannels.value = [];
  } else {
    // 如果空间不足，只显示部分
    visibleChannels.value = allChannels.slice(0, Math.max(0, maxVisibleTabs));
    hiddenChannels.value = allChannels.slice(Math.max(0, maxVisibleTabs));
  }
};

// 监听窗口大小变化
watch(() => $q.screen.width, () => {
  nextTick(updateChannelVisibility);
});

// 切换AI排序
const toggleAiSort = () => {
  store.commit('changeAiSortSwitch', {
    key: selectedChannel.value,
    value: !aiSort.value
  });
  // 更新store中的排序状态
  // store.commit('changeAiSortSwitch', {
  //   key: selectedChannel.value,
  //   value: aiSort.value
  // });

  // // 这里添加排序逻辑
  // $q.notify({
  //   message: `${aiSort.value ? '启用' : '关闭'} AI排序`,
  //   color: 'primary',
  //   icon: 'sort'
  // });
};

// 加载更多数据
const loadMoreData = () => {
  isLoading.value = true;

  // 模拟加载，实际项目中应替换为实际API调用
  setTimeout(() => {
    isLoading.value = false;
    hasData.value = true;

    $q.notify({
      message: `已为您加载更多${selectedChannel.value}数据`,
      color: 'positive',
      icon: 'cloud_download'
    });
  }, 1500);
};

// 导出数据
const exportData = () => {
  $q.notify({
    message: '数据导出功能开发中',
    color: 'info',
    icon: 'info'
  });
};

// 刷新所有数据
const toggleBatchMode = () => {
  store.commit('setResumeBatchMode', !store.getters.getResumeBatchMode);
};

// 标记所有为已读
const markAllAsRead = () => {
  $q.notify({
    message: '已将所有内容标记为已读',
    color: 'positive',
    icon: 'done_all'
  });
};

// 添加设置对话框状态
const showSettingsDialog = ref(false);

// 打开设置
const openSettings = () => {
  showSettingsDialog.value = true;
};

// 监听选中渠道的变化，更新AI排序状态
watch(selectedChannel, (newChannel) => {
  console.log('选中的渠道改变为:', newChannel);
  console.log('对应的组件是:', channelComponents[newChannel]);

  // 验证组件映射
  verifyComponentMapping();

  const channelInfo = allChannelStatus.value[newChannel];
  if (channelInfo) {
    aiSort.value = channelInfo.aiSort || false;
  }
});

// 处理渠道选择
const handleChannelSelection = (key) => {
  console.log('手动选择渠道:', key);

  // 检查渠道是否被禁用
  // if (getChannelDisable(key)) {
  //   console.log(`渠道 ${key} 已禁用，不允许选择`);
  //   $q.notify({
  //     message: `${allChannelStatus.value[key]?.name || key} 渠道已被禁用`,
  //     color: 'warning',
  //     icon: 'block',
  //     position: 'top'
  //   });
  //   return;
  // }

  console.log('渠道对应组件:', channelComponents[key]);

  // 确保key是有效的
  if (!key || typeof key !== 'string') {
    console.error('无效的渠道键:', key);
    return;
  }

  // 确保组件存在
  if (!channelComponents[key]) {
    console.error('找不到渠道对应的组件:', key);
    return;
  }

  // 设置选中渠道
  selectedChannel.value = key;
  console.log('已设置selectedChannel为:', selectedChannel.value);
};

// 执行搜索方法 - 由父组件调用
const executeSearch = async (searchState) => {
  //检查插件安装
  if (!pluginInstalled.value) {
    pluginInstallDialogRef.value.openDialog();
    return;
  }
  //打开监视器
  store.commit('openQueueMonitor');

  isLoading.value = true;
  hasData.value = false;

  // 设置15秒超时定时器
  const timeoutId = setTimeout(() => {
    if (isLoading.value) {
      isLoading.value = false;
      $q.notify({
        message: '搜索超时，请稍后再试',
        color: 'warning',
        icon: 'timer_off',
        position: 'top'
      });
    }
  }, 15000);

  try {
    // console.log('AISearch接收到搜索状态:', searchState);
    let channels = allThirdPartyChannelConfig.value.filter((channel) => channel.login&&getChannelDisable(channel.key)).map((item) => (item.name))||[];
    if(!(channels&&channels.length>0)){
      notify.info("没有可查询渠道");
      return;
    }
    // 获取搜索条件请求对象
    let searchConditionRequest = getSearchConditionRequest(searchState,channels);
    // console.log('搜索参数:', searchConditionRequest);
    // 保存搜索条件到后端
    let searchRequestData;
    try {
      const {data} = await saveCondition(searchConditionRequest);
      data.config = [];
      searchRequestData = data;

      // 构建分页信息
      if(data.channelSearchConditions) {
        data.channelSearchConditions.forEach((item) => {
          data.config.push({
            channelDataTotal: 0,
            channelPage: 0,
            channelCountSize: 0,
            totalPage: 0,
            channelKey: item.channel
          });
        });
        store.commit('setPageConfigData', {key: 'ALL', config: {
            channelDataTotal: 0,
            channelPage: 0,
            channelCountSize: 0,
            totalPage: 0,
            channelKey: 'ALL'
          }});
      }

      // 保存搜索条件到 store
      store.commit('changeSearchChannelConditionRequestData', data);
      store.commit('changeSearchConditionId', searchRequestData.id);
      //清空聚合渠道数据
      store.commit('changeChannelConfData', {key: 'ALL', value: []});
      //清空正在执行的任务
      asyncTaskQueueManager.clearAllQueues();
    } catch (e) {
      console.error('保存搜索条件失败:', e);
      $q.notify({
        message: '后端服务异常，请联系管理员',
        color: 'negative',
        icon: 'error'
      });
      isLoading.value = false;
      // 清除定时器
      clearTimeout(timeoutId);
      return;
    }

    // 根据当前选中的渠道执行不同的搜索策略
    try {
      // console.log('执行搜索:', selectedChannel.value);

      // 使用 Promise.all 等待所有渠道并行执行完毕
      try {
        // 先检查每个ref是否存在且有channelSearch方法
        const promises = [];

        // 过滤已登录的渠道
        const loggedInChannels = allThirdPartyChannelConfig.value.filter(channel => channel.login);

        // 遍历已登录的渠道执行搜索
        loggedInChannels.forEach(channel => {
          // 使用channel.cardInfoRef直接访问引用
          if (channel.cardInfoRef && channel.cardInfoRef &&
              typeof channel.cardInfoRef.channelSearch === 'function') {
            promises.push(channel.cardInfoRef.channelSearch(searchRequestData));
          } else {
            console.warn(`${channel.name}渠道组件不存在或channelSearch方法未定义`);
          }
        });

        // 执行所有有效的promise
        if (promises.length > 0) {
          await Promise.all(promises);
          console.log('所有渠道搜索完成');
        } else {
          console.warn('没有可执行的渠道搜索方法');
        }

        // 渠道执行完毕后，执行 JobInfo 的逻辑
        if (jobInfoRef.value && typeof jobInfoRef.value.channelSearch === 'function') {
          await jobInfoRef.value.channelSearch(1);
        } else {
          console.warn('JobInfo组件不存在或search方法未定义');
        }
      } catch (channelError) {
        console.error('渠道搜索执行错误:', channelError);
      }
    } catch (error) {
      console.error('搜索执行错误:', error);
      $q.notify({
        message: '搜索执行过程中发生错误',
        color: 'warning',
        icon: 'warning'
      });
    }

    // 搜索完成后设置数据状态
    hasData.value = true;

  } catch (error) {
    console.error('搜索执行错误:', error);
    $q.notify({
      message: '搜索执行失败，请稍后再试',
      color: 'negative',
      icon: 'error'
    });
    hasData.value = false;
  } finally {
    // 清除超时定时器
    clearTimeout(timeoutId);
    isLoading.value = false;
  }
};

//获取搜索条件
const getSearchConditionRequest = (data,channels) => {
  const copyData = JSON.parse(JSON.stringify(data))
  const searchDto = copyData;
  //处理工作年限边界
  const workElSliderValue = searchDto.workElSliderValue;
  workElSliderValue.min = (workElSliderValue.min <=0||workElSliderValue.min >10) ? workElSliderValue.min = -1 : workElSliderValue.min;
  workElSliderValue.max = (workElSliderValue.max <=0||workElSliderValue.max >10) ? workElSliderValue.max = -1 : workElSliderValue.max;
  //处理年龄边界
  const ageElSliderValue = searchDto.ageElSliderValue;
  ageElSliderValue.min = (ageElSliderValue.min <=15||ageElSliderValue.min >50) ? ageElSliderValue.min = -1 : ageElSliderValue.min;
  ageElSliderValue.max = (ageElSliderValue.max <=15||ageElSliderValue.max >50) ? ageElSliderValue.max = -1 : ageElSliderValue.max;
  //用户id
  // searchState.value.userId=1;
  //处理其他参数
  let searchConditionRequest = convertSearchConditionRequest(searchDto);
  searchConditionRequest.searchChannels = channels;
  searchConditionRequest.experienceFrom = workElSliderValue.min;
  searchConditionRequest.experienceTo = workElSliderValue.max;
  searchConditionRequest.ageFrom = ageElSliderValue.min;
  searchConditionRequest.ageTo = ageElSliderValue.max;
  //用户信息
  searchConditionRequest.userId=userInfo.value.id;
  searchConditionRequest.chatId=chatId.value;
  return searchConditionRequest;
}


// 暴露给父组件的方法
defineExpose({
  executeSearch
});
const env = process.env.NODE_ENV;
// 在适当位置添加以下代码
// const showQueueMonitor = ref(env === 'development'); // 控制队列监视器的显示与隐藏
const showQueueMonitor = computed(() => store.getters.getShowQueueMonitor);

// 处理未读状态变化
const handleUnreadChange = (value) => {
  console.log('未读状态变更为:', value,store.getters.getUnreadCheckBoxV);
  // store.commit('changeUnreadCheckBoxV', value);
  // console.log(searchState.value)
  executeSearch(searchState.value);
};

// 添加强制更新渠道视图的辅助方法
const forceUpdateChannelView = async () => {
  // 获取最新的渠道状态信息
  const latestChannelStatus = store.getters.getChannelConf;
  
  // 强制更新渠道显示
  await nextTick();
  
  // 重新构建渠道列表
  let allChannels = Object.entries(latestChannelStatus)
    .filter(([key]) => !(key === 'ALL' || key === 'Collect'))
    .map(([key, channel]) => ({ ...channel }));
  
  // 根据可用空间分配渠道
  const containerWidth = document.querySelector('.channel-container')?.offsetWidth || 800;
  const tabBarPadding = 20;
  const moreDropdownWidth = 50;
  const availableWidth = containerWidth - tabBarPadding - moreDropdownWidth;
  const fixedTabsWidth = 200;
  const remainingWidth = availableWidth - fixedTabsWidth;
  const averageTabWidth = 110;
  const maxVisibleTabs = Math.floor(remainingWidth / averageTabWidth);
  
  if (maxVisibleTabs >= allChannels.length) {
    visibleChannels.value = [...allChannels];
    hiddenChannels.value = [];
  } else {
    visibleChannels.value = [...allChannels.slice(0, Math.max(0, maxVisibleTabs))];
    hiddenChannels.value = [...allChannels.slice(Math.max(0, maxVisibleTabs))];
  }
  
  // 告知 Vue 这些数组已经变化
  visibleChannels.value = [...visibleChannels.value];
  hiddenChannels.value = [...hiddenChannels.value];
  
  // 等待 UI 更新
  await nextTick();
};

// 添加刷新渠道登录状态的方法
const refreshChannelLogin = async (key) => {
  
  try {
    let result = false;
    
    // 根据渠道类型执行不同的登录检查逻辑
    switch (key) {
      case 'BOSS':
        result = await BossJobInfoManager.bossUserStatus().then(res => res && pluginBossResultProcessor(res));
        break;
      case 'JOB51':
        result = await Job51InfoManager.job51UserStatus().then(res => res && pluginJob51ResultProcessor(res));
        break;
      case 'ZHILIAN':
        result = await ZhiLianJobInfoManager.zhiLianUserStatus().then(res => res && pluginZhiLianResultProcessor(res));
        break;
      case 'LIEPIN':
        result = await LIEPINJobInfoManager.liePinUserStatus().then(res => res && pluginLIEPINResultProcessor(res));
        break;
      default:
        console.warn(`未知渠道: ${key}`);
        break;
    }
    
    // 更新渠道登录状态
    store.commit('changeChannelConfLogin', {
      key: key,
      value: result
    });
    
    // 如果登录了，不再禁用
    if (result) {
      store.commit('changeChannelConfDisable', {
        key: key,
        value: false
      });
    }
    
    // 强制更新渠道视图
    await forceUpdateChannelView();
    
    // 显示结果通知
    $q.notify({
      message: result 
        ? `${allChannelStatus.value[key]?.name || key} 已成功登录` 
        : `${allChannelStatus.value[key]?.name || key} 未登录，请先在浏览器中登录该网站`,
      color: result ? 'positive' : 'gray',
      icon: result ? 'check_circle' : 'warning',
      position: 'top',
      timeout: 1500
    });
    
    return result;
  } catch (error) {
    console.error(`${key} 登录状态检查失败:`, error);
    
    // 显示错误通知
    $q.notify({
      message: `${allChannelStatus.value[key]?.name || key} 登录状态检查失败`,
      color: 'negative',
      icon: 'error',
      position: 'top',
      timeout: 3000
    });
    
    return false;
  } finally {
    // 关闭加载提示
    loadingNotify.dismiss();
  }
};
</script>

<style scoped>
.channel-container {
  /* border-radius: 8px 0 0 8px; */
  overflow: hidden;
}

.operation-container {
  /* border-radius: 0 8px 8px 0; */
  min-height: 46px;
  display: flex;
  align-items: center;
}

.channel-tabs {
  width: 100%;
  height: 100%;
}

.channel-tab {
  transition: all 0.3s;
  position: relative;
  min-width: auto;
  padding: 0 8px;
}

.login-status-container {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.refresh-btn {
  margin-left: 2px;
  opacity: 0.8;
  transition: all 0.2s;
}

.refresh-btn:hover {
  opacity: 1;
  transform: rotate(180deg);
}

.channel-tab :deep(.q_tab__label) {
  font-size: 14px;
}

.channel-tab:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.more-dropdown {
  min-width: 40px;
}

.channel-dropdown-item {
  transition: background-color 0.2s;
}

.channel-dropdown-item:hover {
  background-color: #f5f5f5;
}

.search-result-container {
  min-height: 100px;
}

/* 自定义加载遮罩 */
.custom-loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.7);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  backdrop-filter: blur(3px);
}
</style>
