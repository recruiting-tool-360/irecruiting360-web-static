<template>
  <div class="" style="height: 100%;min-height: 100vh">
    <!-- 新建AI聊天按钮 -->
    <div class="q-mx-md q-my-md">
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
import { ref, onMounted, computed } from 'vue'
import { useQuasar } from 'quasar'
import { useStore } from 'vuex'
import { getChatList, deleteChat, renameChat } from 'src/api/chat/ChatApi'
import {isFromMenu, isVisibleThirdA, usePlanVisibility} from 'src/hooks/usePlanVisibility';
import notify from 'src/util/notify'

const $q = useQuasar()
const store = useStore()

// 默认planA企业可使用， 无plan或plan不匹配时默认不可见
const { isVisible } = usePlanVisibility({
  visibleForPlans: ['planA'],
  defaultVisible: false
})

//三方显示隐藏控制开关
let visibleThirdSwitch = isVisibleThirdA();

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
  loading.value = true
  try {
    const response = await getChatList()
    if (response.success === 'success' && response.data && Array.isArray(response.data)) {
      // 转换数据格式
      const formattedChatList = response.data
        .filter(item => {
          if(isVisible.value){
            return item?.positionId
          }
          return true
        })
        .map(item => ({
          id: item.chatId,
          name: item.name || `未知对话`,
          createTime: item.updateAt?.slice(0, 16).replace('T', ' ') || '未知时间',
          positionId: item.positionId // 保留positionId
        }));
      
      // 将格式化后的聊天列表保存到Vuex中
      store.dispatch('updateChatList', formattedChatList);
        
      //如果是三方企业相应的修改逻辑
      if(chatList.value && chatList.value.length>0 && visibleThirdSwitch){
        //来自于菜单
        if(isFromMenu()){
          selectChat(chatList.value[0])
        }else{

        }
      }
    } else {
      notify.error('加载聊天列表失败')
    }
  } catch (e) {
    console.error('加载聊天列表失败:', e)
    notify.error('加载聊天列表失败，请稍后重试')
  } finally {
    loading.value = false
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

// 选择聊天
const selectChat = (item) => {
  // 刷新搜索条件
  if (jobSearchFilterRef.value) {
    jobSearchFilterRef.value.refreshSearchCondition(item.id)
  }
  
  // 清空聚合渠道数据
  store.commit('changeChannelConfData', {key: 'ALL', value: []});
  
  // 设置聊天ID
  store.commit('SET_LATEST_CHAT_ID', item.id)
  
  // 设置职位ID
  if (item.positionId) {
    store.commit('SET_LATEST_POSITION_ID', item.positionId)
  } else {
    store.commit('SET_LATEST_POSITION_ID', '')
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
</style>
