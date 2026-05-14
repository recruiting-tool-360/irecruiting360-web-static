<template>
  <div :class="visibleThirdSwitchPlus && 'iHR-style'" style="height: 100%;min-height: 100vh;">
    <!-- 新建AI聊天按钮 -->
    <div class="q-mx-md q-my-md" v-if="!visibleThirdSwitchPlus">
      <q-btn
        class="full-width q-px-none"
        color="primary"
        flat
        @click="handleNewChat">
        <div class="full-width flex justify-start items-center">
          <q-icon name="add" size="sm" />
          &nbsp;&nbsp;&nbsp;&nbsp;新建AI聊天
        </div>
      </q-btn>
    </div>

    <!--
      i人事融合 / 客户端模式下的顶部 header
      1:1 参考 ihraisaas/src/components/AIAssistant/JobList.tsx 第 38-42 行：
        p-4 border-b border-neutral-100 flex items-center justify-between
          h3 text-sm font-semibold text-neutral-800: "招聘中职位"
          span text-[10px] bg-neutral-100 px-2 py-0.5 rounded-full text-neutral-500: "X个职位"
    -->
    <div v-if="visibleThirdSwitchPlus">
      <div class="iHR-list-header">
        <h3 class="iHR-list-title">招聘中职位</h3>
        <span class="iHR-list-count">{{ chatList?.length || 0 }}个职位</span>
      </div>
      <div v-if="tipsStatus" class="iHR-menu-tips flex relative-position q-pa-sm q-mx-sm q-mb-sm">
        <div>
          <q-icon class="q-mr-sm" name="info" size="xs" style="color: var(--q-primary-90)" />
        </div>
        <span class="col">点击职位唤起AI招聘助理进行聚合简历推荐</span>
        <q-icon class="cursor-pointer absolute text-grey-7" name="clear" size="xs" @click="closeTips" style="right: 5px; top: 10px;" />
      </div>
    </div>
<!--    <q-separator />-->

    <!--
      职位列表渲染：
        - 三方融合 / 客户端模式（visibleThirdSwitchPlus=true）：1:1 还原 ihraisaas JobList
          一行 [Pin + 标题 + 状态icon]，下一行编号
        - 普通模式：保留原 q-item 结构
    -->
    <template v-if="visibleThirdSwitchPlus">
      <div class="iHR-job-list">
        <div
          v-for="item in sortedChatList"
          :key="item.id"
          class="job-item"
          :class="{
            active: currentChatId === item.id,
            pinned: isItemPinned(item.id)
          }"
          @click="selectChat(item)"
        >
          <div class="job-item-content">
            <!-- 第一行：pin + 标题（1:1 对照 ihraisaas JobList.tsx 67-88） -->
            <div class="job-item-row">
              <button
                type="button"
                class="pin-btn"
                :class="{ active: isItemPinned(item.id) }"
                :title="isItemPinned(item.id) ? '取消置顶' : '置顶职位'"
                @click="togglePin(item.id, $event)"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="12"
                  height="12"
                  :fill="isItemPinned(item.id) ? 'currentColor' : 'none'"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M12 17v5" />
                  <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
                </svg>
              </button>
              <h4 class="job-title">{{ parseJobName(item.name).title || item.name }}</h4>
            </div>
            <!--
              第二行（仅在有 code 时）：编号 + 右侧 briefcase
              1:1 对照 ihraisaas JobList.tsx 113-147
            -->
            <div v-if="parseJobName(item.name).code" class="job-item-row job-item-row-bottom">
              <p class="job-code">({{ parseJobName(item.name).code }})</p>
              <button
                type="button"
                class="recruit-btn"
                :title="planInfo?.sendJdAuth
                  ? '自动发送当前职位的JD信息至AI招聘助理'
                  : '您当前无职位管理模块权限'"
                @click="handleRecruitAction(item); $event.stopPropagation()"
              >
                <!-- Briefcase (lucide) - w-3 h-3 = 12px -->
                <svg
                  viewBox="0 0 24 24"
                  width="12"
                  height="12"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                  <rect width="20" height="14" x="2" y="6" rx="2" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div v-if="chatList.length === 0 && !loading" class="job-empty">暂无数据</div>
        <div v-if="loading" class="job-empty">
          <q-spinner color="primary" size="1.5em" />
          <div class="q-mt-xs text-grey text-caption">加载中...</div>
        </div>
      </div>
    </template>

    <!-- 普通模式：保留原 q-item 结构 -->
    <q-list v-else padding class="rounded-borders text-grey-9 q-pt-none">
      <q-item
        class="iHR-item-style q-py-md"
        v-for="(item,index) in chatList"
        :key="item.id"
        :class="index==0?'q-mt-none q-mb-sm':'q-my-sm'"
        clickable v-ripple
        :active="currentChatId === item.id"
        @click="selectChat(item)"
        active-class="iHR-menu-link my-menu-link text-grey-7"
      >
        <q-item-section avatar>
          <q-avatar size="md" color="primary" text-color="white">
            {{ item?.name?.charAt(0)?.toUpperCase() || '?' }}
          </q-avatar>
        </q-item-section>

        <q-item-section>
          <q-item-label>{{ item.name }}</q-item-label>
          <q-item-label caption>{{ item.createTime }}</q-item-label>
        </q-item-section>

        <q-item-section side>
          <q-btn
            round
            flat
            dense
            icon="more_horiz"
            size="sm"
            @click.stop
          >
            <q-menu anchor="bottom left" self="top left" transition-show="flip-right"
                    transition-hide="flip-left">
              <q-list style="min-width: 50px">
                <q-item clickable v-close-popup @click.stop="openRenameDialog(item)">
                  <div class="flex justify-center items-center">
                    <q-icon name="edit" size="xs" />
                    <span class="q-ml-sm">重命名</span>
                  </div>
                </q-item>
                <q-item clickable v-close-popup @click.stop="handleDelete(item)">
                  <div class="flex justify-center items-center">
                    <q-icon name="delete" size="xs" color="negative" />
                    <span class="q-ml-sm">删除</span>
                  </div>
                </q-item>
              </q-list>
            </q-menu>
          </q-btn>
        </q-item-section>
      </q-item>

      <q-item v-if="chatList.length === 0 && !loading">
        <q-item-section class="text-center text-grey">暂无数据</q-item-section>
      </q-item>

      <q-item v-if="loading">
        <q-item-section class="text-center">
          <q-spinner color="primary" size="1.5em" />
          <div class="q-mt-xs text-grey text-caption">加载中...</div>
        </q-item-section>
      </q-item>
    </q-list>

    <!-- 重命名对话框 -->
    <q-dialog v-model="renameDialogVisible">
      <q-card style="min-width: 400px">
        <q-card-section>
          <div class="text-h6 text-grey-8">重命名</div>
        </q-card-section>

        <q-card-section>
          <q-input
            v-model="newName"
            label="请输入名称"
            autofocus
            @keyup.enter="handleRename"
          />
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat label="取消" color="primary" v-close-popup />
          <q-btn flat label="确定" color="primary" @click="handleRename" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, nextTick, watch } from 'vue'
import { useQuasar } from 'quasar'
import { useStore } from 'vuex'
import { getChatList, deleteChat, renameChat, getChatHistory } from 'src/api/chat/ChatApi'
import { isFromMenu, isVisibleThirdA, usePlanVisibility} from 'src/hooks/usePlanVisibility';
import notify from 'src/util/notify'

const $q = useQuasar()
const store = useStore()

// 默认planA企业可使用， 无plan或plan不匹配时默认不可见
const { isVisible } = usePlanVisibility({
  visibleForPlans: ['PlanA'],
  defaultVisible: false
})

const planInfo = computed(() => {
  return store.getters.getUserInfo?.extendData;
});

//三方显示隐藏控制开关
let visibleThirdSwitch = computed(() => {
  return store.getters.getUserInfo?.extendData || '';
});
let headcountId = computed(() => {
  return store.getters.getUserInfo?.extendData?.headcountId || '';
});
let visibleThirdSwitchPlus = computed(() => {
  return ['PlanA'].includes(visibleThirdSwitch.value?.plan || '');
});
//是否来自于菜单
const isFromThirdMenu = computed(() => {
  return visibleThirdSwitch.value?.from === 'recruit-assistant'});
//是否来自于候选人详情页
const isFromCandidateList = computed(() => {
  return visibleThirdSwitch.value?.from === 'recruit-workflow'});

const userInfo = computed(() => store.getters.getUserInfo);

// 状态变量
const loading = ref(false)
const tipsStatus = ref(true)
const chatList = computed(() => store.getters.getChatList) // 使用Vuex中的聊天列表

/* ===== 置顶 & 排序（1:1 对照 ihraisaas JobList.tsx 第 24-29 行 sortedJobs） ===== */
const pinnedJobIds = computed(() => store.getters.getPinnedJobIds || [])

/** 列表渲染时用：置顶项排在前面 */
const sortedChatList = computed(() => {
  const all = Array.isArray(chatList.value) ? chatList.value : []
  const pinSet = new Set(pinnedJobIds.value)
  return [...all].sort((a, b) => {
    const aP = pinSet.has(a?.id)
    const bP = pinSet.has(b?.id)
    if (aP && !bP) return -1
    if (!aP && bP) return 1
    return 0
  })
})

/** 该 chat 当前是否置顶 */
function isItemPinned(id) {
  return pinnedJobIds.value.includes(id)
}

/** 切换置顶（事件 stopPropagation 防止冒泡触发选中） */
function togglePin(id, ev) {
  if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation()
  store.commit('togglePinJob', id)
}

/** 解析 chat.name 形如 "研发 (10001)" → { title: '研发', code: '10001' }；解析失败时 title=整 name */
function parseJobName(name) {
  const raw = String(name || '').trim()
  const m = raw.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
  if (m) return { title: m[1].trim(), code: m[2].trim() }
  return { title: raw, code: '' }
}
const currentChatId = computed(() => store.getters.getLatestChatId || '')
const renameDialogVisible = ref(false)
const newName = ref('')
const currentItem = ref(null)
//jobSearchFilterRef
const jobSearchFilterRef = computed(() => store.getters.getJobSearchFilterRefValue);
//ChatCardRef
const chatCardRef = computed(() => store.getters.getChatCardRefValue);

// 加载聊天列表
const loadChatList = async () => {
  loading.value = true;
  console.log('开始加载聊天列表');
  
  try {
    const response = await getChatList();
    console.log('获取聊天列表响应:', response);
    
    if (response.success === 'success' && response.data && Array.isArray(response.data)) {
      console.log('原始聊天数据:', response.data);
      
      // 转换数据格式
      const formattedChatList = response.data
        .filter(item => {
          if(isVisible.value){
            return item?.positionId;
          }
          return true;
        })
        .map(item => ({
          id: item.chatId,
          name: item.name || `未知对话`,
          createTime: item.updateAt?.slice(0, 16).replace('T', ' ') || '未知时间',
          positionId: item.positionId, // 保留positionId
          jd:item.jd
        }));
      
      console.log('格式化后的聊天列表:', formattedChatList);
      console.log('三方企业状态:', {
        visibleThirdSwitchPlus: visibleThirdSwitchPlus.value,
        isFromThirdMenu: isFromThirdMenu.value
      });
      
      // 将格式化后的聊天列表保存到Vuex中
      store.dispatch('updateChatList', formattedChatList);
      console.log('聊天列表已保存到Vuex');
        
      // 在数据更新到Vuex后，使用nextTick确保DOM已更新
      // 然后再处理三方企业的选择逻辑
      await nextTick();
      
      //如果是三方企业相应的修改逻辑
      if(formattedChatList.length > 0 && visibleThirdSwitchPlus.value){
        //来自于菜单
        if(isFromThirdMenu.value){
          console.log('三方企业，自动选择第一个聊天:', formattedChatList[0]);
          selectChat(formattedChatList[0]);
        }else if(isFromCandidateList.value){
          const filteredList = [formattedChatList.find(item => item.positionId === headcountId.value)].filter(Boolean);
          
          // 判断是否有选中职位，并且查询该职位历史记录，为空则填充JD
          if(Array.isArray(filteredList) && filteredList.length === 1) {
            getChatHistory(filteredList[0].id, userInfo.value?.id).then(res => {
              console.log("res", res);
              if(res.success === "success") {
                const isFill = Array.isArray(res.data.chatHistory) && res.data.chatHistory.length === 0;
                handleRecruitAction(filteredList[0], isFill);
              }
            })
          }
          console.log(store.getters.getUserInfo?.extendData?.headcountId, '三方企业，默认待职位描述:', filteredList[0]);
        }
      } else {
        console.log('不满足自动选择条件:', {
          hasChats: formattedChatList.length > 0,
          isThirdParty: visibleThirdSwitchPlus.value,
          isFromMenu: isFromThirdMenu.value
        });
      }
    } else {
      console.error('加载聊天列表失败, 响应不符合预期:', response);
      notify.error('加载聊天列表失败');
    }
  } catch (e) {
    console.error('加载聊天列表失败:', e);
    notify.error('加载聊天列表失败，请稍后重试');
  } finally {
    loading.value = false;
    console.log('聊天列表加载完成');
  }
}

// 创建新聊天
const handleNewChat = async () => {
  try {
    // 调用chatCardRef中的handleNewChat方法创建新聊天
    if (chatCardRef.value && typeof chatCardRef.value.handleNewChat === 'function') {
      const newChatInfo = await chatCardRef.value.handleNewChat();
      
      // 如果返回了新聊天信息，添加到Vuex
      if (newChatInfo && newChatInfo.id) {
        // 添加到Vuex中（如果chatCardRef.handleNewChat方法中没有自动添加）
        // store.dispatch('addChat', newChatInfo);
      }
    } else {
      console.warn('chatCardRef或其handleNewChat方法不可用');
    }
  } catch (error) {
    console.error('创建新聊天失败:', error);
    notify.error('创建新聊天失败，请稍后重试');
  }
}

const setVuexData  = (item) => {
  // 设置聊天ID
  store.commit('SET_LATEST_CHAT_ID', item.id);
  console.log('已设置最新聊天ID:', item.id);

  // 设置职位ID
  if (item.positionId) {
    store.commit('SET_LATEST_POSITION_ID', item.positionId);
    console.log('已设置最新职位ID:', item.positionId);
  } else {
    store.commit('SET_LATEST_POSITION_ID', '');
    console.log('职位ID为空，已清除');
  }
}

// 选择聊天
const selectChat = (item) => {
  if (!item || !item.id) {
    console.error('尝试选择无效的聊天项', item);
    return;
  }

  console.log('选择聊天:', item);

  try {
    // 刷新搜索条件（嵌入式模式下 JobSearchFilter 只在 results 视图渲染，
    // chat 视图时 ref 可能为 null —— 防御性判空，不抛异常）
    if (jobSearchFilterRef.value && typeof jobSearchFilterRef.value.refreshSearchCondition === 'function') {
      jobSearchFilterRef.value.refreshSearchCondition(item.id);
    } else {
      console.warn('jobSearchFilterRef 不可用，跳过 refreshSearchCondition');
    }

    // 清空 AI 输入框（同上，嵌入式 ChatCard ref 可能为 null）
    if (chatCardRef.value && typeof chatCardRef.value.fillMessageToInput === 'function') {
      chatCardRef.value.fillMessageToInput("");
    } else {
      console.warn('chatCardRef 不可用，跳过 fillMessageToInput');
    }

    // 清空聚合渠道数据
    store.commit('changeChannelConfData', {key: 'ALL', value: []});

    setVuexData(item);
    // // 设置聊天ID
    // store.commit('SET_LATEST_CHAT_ID', item.id);
    // console.log('已设置最新聊天ID:', item.id);
    //
    // // 设置职位ID
    // if (item.positionId) {
    //   store.commit('SET_LATEST_POSITION_ID', item.positionId);
    //   console.log('已设置最新职位ID:', item.positionId);
    // } else {
    //   store.commit('SET_LATEST_POSITION_ID', '');
    //   console.log('职位ID为空，已清除');
    // }
  } catch (error) {
    console.error('选择聊天时发生错误:', error);
  }
}

// 打开重命名对话框
const openRenameDialog = (item) => {
  currentItem.value = item
  newName.value = item.name
  renameDialogVisible.value = true
}

// 处理重命名
const handleRename = async () => {
  if (!newName.value.trim()) {
    notify.warning('名称不能为空')
    return
  }

  try {
    const res = await renameChat(currentItem.value.id, newName.value.trim())
    if (res.success === 'success') {
      // 更新Vuex中的聊天名称
      store.dispatch('renameChatAction', {
        chatId: currentItem.value.id,
        newName: newName.value.trim()
      })
      notify.success('重命名成功')
      renameDialogVisible.value = false
    } else {
      notify.error(res.errorMessage || '重命名失败')
    }
  } catch (e) {
    console.error('重命名失败:', e)
    notify.error('重命名失败，请稍后重试')
  }
}

// 处理删除
const handleDelete = async (item) => {
  try {
    // 使用Quasar的Dialog进行确认
    $q.dialog({
      title: '<div class="text-grey-8">警告</div>',
      message: '<i class="material-icons text-negative q-mr-sm" style="vertical-align: middle;">warning</i> 确定要删除这个对话吗？',
      html: true,
      cancel: true,
      persistent: true
    }).onOk(async () => {
      try {
        const res = await deleteChat(item.id)
        if (res.success === 'success') {
          // 从Vuex中删除聊天
          store.dispatch('deleteChatAction', item.id)
          notify.success('删除成功')
          
          // 如果删除的是当前选中的聊天，则自动创建新的聊天
          if (currentChatId.value === item.id) {
            store.commit('clearSearchConditionId')
            handleNewChat()
          }
        } else {
          notify.error(res.errorMessage || '删除失败')
        }
      } catch (e) {
        console.error('删除聊天失败:', e)
        notify.error('删除失败，请稍后重试')
      }
    })
  } catch (e) {
    console.error('显示确认对话框失败:', e)
  }
}

// 组件挂载时加载数据
onMounted(() => {
  loadChatList()
  
  // 添加一个延迟执行的备选方案，确保在列表加载后能自动选择
  setTimeout(() => {
    if (chatList.value && chatList.value.length > 0 && 
        visibleThirdSwitchPlus.value && isFromThirdMenu.value && 
        !currentChatId.value) {
      console.log('延迟执行：聊天列表已加载，自动选择第一个聊天');
      selectChat(chatList.value[0]);
    }
  }, 1000); // 1秒后检查
})

// 可选：添加一个更可靠的多次尝试机制
let autoSelectAttempts = 0;
const maxAutoSelectAttempts = 3;

const tryAutoSelectFirstChat = () => {
  if (autoSelectAttempts >= maxAutoSelectAttempts) {
    console.log('已达到最大尝试次数，停止自动选择');
    return;
  }
  
  if (chatList.value && chatList.value.length > 0 && 
      visibleThirdSwitchPlus.value && isFromThirdMenu.value && 
      !currentChatId.value) {
    console.log(`尝试 ${autoSelectAttempts + 1}/${maxAutoSelectAttempts}：自动选择第一个聊天`);
    selectChat(chatList.value[0]);
    autoSelectAttempts++;
  } else if (!chatList.value || chatList.value.length === 0) {
    // 如果列表还没加载完，稍后再试
    setTimeout(tryAutoSelectFirstChat, 500);
    autoSelectAttempts++;
  }
};

// 处理招聘操作
const handleRecruitAction = (item, isFill = true) => {
  console.log('招聘操作按钮被点击，聊天ID:', item);
  // 设置聊天ID
  // store.commit('SET_LATEST_CHAT_ID', item.id);
  // console.log('已设置最新聊天ID:', item.id);
  //
  // // 设置职位ID
  // if (item.positionId) {
  //   store.commit('SET_LATEST_POSITION_ID', item.positionId);
  //   console.log('已设置最新职位ID:', item.positionId);
  // } else {
  //   store.commit('SET_LATEST_POSITION_ID', '');
  //   console.log('职位ID为空，已清除');
  // }
  setVuexData(item);
  nextTick(() => {
    // isFill为true表示需要填充JD
    isFill && chatCardRef.value.insertMessageToInput(item.jd);
  })
}

const closeTips = () => {
  tipsStatus.value = false
}

// 在监听器中添加更可靠的处理
watch(chatList, (newChatList) => {
  if (newChatList.length > 0) {
    // 如果当前没有选中的聊天，且有聊天列表数据，则考虑自动选择
    if (!currentChatId.value && visibleThirdSwitchPlus.value && isFromThirdMenu.value) {
      console.log('聊天列表变化，自动选择第一个聊天', newChatList[0]);
      selectChat(newChatList[0]);
    }
  }
  
  // 如果监听器触发但没有选中，启动备选机制
  if (newChatList.length > 0 && !currentChatId.value && 
      visibleThirdSwitchPlus.value && isFromThirdMenu.value) {
    tryAutoSelectFirstChat();
  }
}, { immediate: false })


// 监听 vuex 中的刷新状态
watch(() => store.getters.getNeedRefreshList, async (needRefresh) => {
  if (needRefresh) {
    await new Promise(resolve => setTimeout(resolve, 3500))
    await loadChatList()
    store.commit('SET_NEED_REFRESH_LIST', false)
  }
})
</script>

<style scoped>
.q-item.q-router-link--active, .q-item--active {
  font-weight: bold;
}
</style>
<style lang="sass">
.my-menu-link
  background: var(--q-primary-20)

.iHR-style
  padding: 0
  background: #fff

  // 列表 header（1:1 对照 ihraisaas JobList.tsx 第 38-42 行）
  .iHR-list-header
    display: flex
    align-items: center
    justify-content: space-between
    padding: 16px // p-4
    border-bottom: 1px solid #f5f5f5 // border-neutral-100

  .iHR-list-title
    margin: 0
    font-size: 14px // text-sm
    font-weight: 600 // font-semibold
    color: #262626 // text-neutral-800
    letter-spacing: -0.005em

  .iHR-list-count
    font-size: 10px // text-[10px]
    background: #f5f5f5 // bg-neutral-100
    padding: 2px 8px // px-2 py-0.5
    border-radius: 9999px // rounded-full
    color: #737373 // text-neutral-500
    font-weight: 500 // font-medium
    line-height: 1.4

  .iHR-menu-tips
    margin: 12px 12px 8px 12px
    border-radius: 10px
    line-height: 22px
    background-color: var(--q-primary-10)
    padding-right: 23px

  // ===== 新版职位列表（1:1 ihraisaas JobList.tsx 第 50-130 行）=====
  .iHR-job-list
    padding: 4px 12px 8px 12px
    display: flex
    flex-direction: column
    gap: 2px // 紧凑：列表项之间几乎无 gap
    overflow-y: auto

  // 1:1 对照 ihraisaas JobList.tsx 第 51-149 行
  .job-item
    width: 100%
    text-align: left
    background: #fff
    border: 1px solid #e5e7eb // border-neutral-200
    border-radius: 8px // rounded-lg
    padding: 12px // p-3（与 ihraisaas 一致）
    cursor: pointer
    transition: all 0.2s

    &:hover:not(.active)
      border-color: #99f6e4 // hover:border-primary-200
      background: #fafafa // hover:bg-neutral-50

    &.active
      border-color: #14b8a6 // border-primary-500
      background: #f0fdfa // bg-primary-50
      box-shadow: 0 0 0 1px rgba(20, 184, 166, 0.1)

    &.pinned:not(.active)
      border-color: #ccfbf1 // border-primary-200
      background: rgba(240, 253, 250, 0.125) // bg-primary-50/20

  .job-item-content
    flex: 1
    min-width: 0
    padding-right: 4px // pr-1

  // 行布局：第一行 pin+title；第二行 code+briefcase
  .job-item-row
    display: flex
    align-items: center
    justify-content: space-between
    gap: 4px

  // 第二行（编号 + briefcase）：margin-top 用 title 的 mb-0.5 替代
  .job-item-row-bottom
    margin-top: 0 // title 的 mb-0.5 已经提供间距

  .pin-btn
    display: inline-flex
    align-items: center
    justify-content: center
    margin-right: 6px // mr-1.5
    padding: 2px // p-0.5
    border: 0
    background: transparent
    border-radius: 4px // rounded
    color: #d4d4d8 // 默认 text-neutral-300
    cursor: pointer
    transition: all 0.15s
    flex-shrink: 0

    &:hover
      color: #2dd4bf // hover:text-primary-400
      background: #f5f5f5 // hover:bg-neutral-100

    &.active
      color: #14b8a6 // text-primary-500
      background: #f0fdfa // bg-primary-50

  // 1:1 对照 h4 className="text-sm font-medium truncate mb-0.5"
  .job-title
    margin: 0 0 2px 0 // mb-0.5
    font-size: 14px // text-sm
    font-weight: 500 // font-medium
    color: #262626 // text-neutral-800
    white-space: nowrap
    overflow: hidden
    text-overflow: ellipsis
    line-height: 1.5
    min-width: 0
    flex: 1

  .job-item.active .job-title
    color: #14b8a6 // text-primary-500

  // 1:1 对照 p className="text-xs text-neutral-500 font-mono"
  .job-code
    margin: 0
    font-size: 12px // text-xs
    color: #737373 // text-neutral-500
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace
    line-height: 1.4

  // briefcase 按钮：1:1 对照 ihraisaas idle 时的 Briefcase className="w-3 h-3 text-neutral-300"
  .recruit-btn
    display: inline-flex
    align-items: center
    justify-content: center
    padding: 0
    border: 0
    background: transparent
    color: #d4d4d8 // text-neutral-300
    cursor: pointer
    transition: color 0.15s
    flex-shrink: 0

    &:hover
      color: #14b8a6 // primary-500

  .job-item.active .recruit-btn
    color: #2dd4bf // selected 时变 primary-400（跟 ihraisaas line 134 一致）

  .job-empty
    padding: 16px
    text-align: center
    color: #a3a3a3
    font-size: 12px

  // 老 q-item 样式保留（非客户端模式仍可能用到）
  .iHR-item-style
    border: 1px solid rgba(0, 0, 0, 0.12)
    border-radius: 6px

  .iHR-menu-link
    border-color: var(--q-primary-90) !important
</style>
