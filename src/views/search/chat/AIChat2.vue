<template>
  <div>
    <!-- 打开按钮 -->
<!--    <el-button type="primary" @click="openDrawer">打开抽屉</el-button>-->

    <!-- 抽屉 -->
    <transition name="drawer-slide">
      <div
          v-if="isDrawerVisible"
          class="drawer"
          :style="{ width: drawerWidth + 'px' }"
      >
        <!-- 抽屉内容 -->
        <div class="content">
          <Chat :on-close-click="()=>isDrawerVisible=false"></Chat>
          <!-- 关闭按钮 -->
<!--          <el-button type="danger" @click="closeDrawer">关闭抽屉</el-button>-->
        </div>

        <!-- 拖动条 -->
        <div class="resize-handle" @mousedown="startDrag">
<!--          <div class="resize-handle-div">-->

<!--          </div>-->
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import {ref, reactive, onMounted, watch} from "vue";
import Chat from "@/views/search/chat/Chat.vue";
const props = defineProps({
  dialogFlag: {
    type: Boolean,
    default:false
  },
  onCloseClick: {
    type: Function,
    required: true
  }
});
// 控制抽屉的显示状态
const isDrawerVisible = ref(props.dialogFlag);

// 抽屉的宽度
const drawerWidth = ref(360);

// 用于拖动状态的标志和起始位置
const dragState = reactive({
  isDragging: false,
  startX: 0,
  initialWidth: 0,
});

// 打开抽屉
const openDrawer = () => {
  isDrawerVisible.value = true;
};

// 关闭抽屉
const closeDrawer = () => {
  isDrawerVisible.value = false;
};

// 开始拖动
const startDrag = (event) => {
  dragState.isDragging = true;
  dragState.startX = event.clientX;
  dragState.initialWidth = drawerWidth.value;
  document.addEventListener("mousemove", handleDrag);
  document.addEventListener("mouseup", stopDrag);
};

// 拖动处理
const handleDrag = (event) => {
  if (!dragState.isDragging) return;

  const diffX = dragState.startX - event.clientX;
  const newWidth = Math.min(1000, Math.max(360, dragState.initialWidth + diffX));
  drawerWidth.value = newWidth;
};

// 停止拖动
const stopDrag = () => {
  dragState.isDragging = false;
  document.removeEventListener("mousemove", handleDrag);
  document.removeEventListener("mouseup", stopDrag);
};

// 如果 props 的值可能会变化，使用 watch 来同步更新 localValue
watch(() => props.dialogFlag, (newValue) => {
  isDrawerVisible.value = newValue;
});
// 如果 visible关闭回调父组件
watch(() => isDrawerVisible.value, (newValue) => {
  if(newValue===false){
    props.onCloseClick();
  }
});
</script>

<style scoped>
/* 抽屉基础样式 */
.drawer {
  position: fixed;
  top: 0;
  right: 0;
  height: 100%;
  background-color: #fff;
  border-left: 1px solid #ddd;
  box-shadow: -2px 0 5px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  z-index: 1000;
  display: flex;
  flex-direction: column;
}

/* 内容样式 */
.content {
  overflow: auto;
  flex: 1;
  white-space: pre-line;
  //padding-left: 10px;
}

/* 拖动条样式 */
.resize-handle {
  position: absolute;
  top: 0;
  left: -1px;
  width: 10px;
  height: 100%;
  cursor: ew-resize;
  //background-color: rgba(0, 0, 0, 0.04);
  background-color: transparent;
  transition: background-color 0.2s ease;
  z-index: 1001;
  background-image: url('/public/index/header/chat/tuodong.svg'); /* 本地 SVG 文件 */
  background-size: 141%;
  background-position: left;
  background-repeat: no-repeat;
}
.resize-handle:hover {
  //background-color: rgba(0, 0, 0, 0.3);
  background-color: transparent;
}

/* 过渡效果 */
.drawer-slide-enter-active,
.drawer-slide-leave-active {
  transition: transform 0.2s ease;
}
.drawer-slide-enter-from {
  transform: translateX(100%);
}
.drawer-slide-leave-to {
  transform: translateX(100%);
}
.resize-handle-div{
  width: 100%;
  height: 100%;
  position: relative;
  user-select: none;
  z-index: 99;

  .headerIcons{
    position: absolute;
    width: 10px;
    height: 10px;
    top:50%;
    bottom: 50%;
    left: 2px;
  }
}
</style>
