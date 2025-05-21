<template>
  <div class="" style="height: 100%;min-height: 100vh">
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
<!--    <q-separator />-->

    <!-- 聊天列表 -->
    <q-list padding class="rounded-borders  text-grey-9 q-pt-none">
      <q-item
        class="q-py-md"
        v-for="(item,index) in chatList"
        :key="item.id"
        :class="index==0?'q-mt-none q-mb-sm':'q-my-sm'"
        clickable v-ripple
        :active="currentChatId === item.id"
        @click="selectChat(item)"
        active-class="my-menu-link text-grey-7"
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

        <q-item-section side v-if="!visibleThirdSwitchPlus">
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

                <!-- 招聘按钮，仅在三方企业模式下显示 -->
        <q-item-section side v-if="visibleThirdSwitchPlus">
          <q-btn
            round
            flat
            dense
            icon="next_week"
            size="sm"
            color="primary"
            @click.stop="handleRecruitAction(item)"
            class="recruit-action-btn"
          >
            <q-tooltip>招聘需求</q-tooltip>
          </q-btn>
        </q-item-section>
      </q-item>

      <!-- 没有聊天记录时显示 -->
      <q-item v-if="chatList.length === 0 && !loading">
        <q-item-section class="text-center text-grey">
          暂无数据
        </q-item-section>
      </q-item>

      <!-- 加载中 -->
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
import { getChatList, deleteChat, renameChat } from 'src/api/chat/ChatApi'
import { isFromMenu, isVisibleThirdA, usePlanVisibility} from 'src/hooks/usePlanVisibility';
import notify from 'src/util/notify'

const $q = useQuasar()
const store = useStore()

// 默认planA企业可使用， 无plan或plan不匹配时默认不可见
const { isVisible } = usePlanVisibility({
  visibleForPlans: ['PlanA'],
  defaultVisible: false
})

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

console.log('isVisible', isVisible)

// 状态变量
const loading = ref(false)
const chatList = computed(() => store.getters.getChatList) // 使用Vuex中的聊天列表
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
          Array.isArray(filteredList) && filteredList.length === 1 && handleRecruitAction(filteredList[0]);
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
    // 刷新搜索条件
    if (jobSearchFilterRef.value) {
      jobSearchFilterRef.value.refreshSearchCondition(item.id);
    } else {
      console.warn('jobSearchFilterRef不可用，无法刷新搜索条件');
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
const handleRecruitAction = (item) => {
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
  chatCardRef.value.insertMessageToInput(item.jd);
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
</script>

<style scoped>
.q-item.q-router-link--active, .q-item--active {
  font-weight: bold;
}
</style>
<style lang="sass">
.my-menu-link
  background: var(--q-primary-20)
</style>
