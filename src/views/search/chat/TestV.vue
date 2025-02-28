
<template>
<div v-if="!isVisible">
  <el-button @click="hhhhh">ffff</el-button>
</div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted} from 'vue'
const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  chatId: {
    type: String,
    default: ''
  },
  onClose: {
    type: Function,
    required: true
  },
  onEdit: {
    type: Function,
    required: true
  }
})

const isVisible = ref(props.visible)

watch(() => props.visible, (val) => {
  isVisible.value = val
})
const hhhhh = () => {
  console.log("rrr")
  props.onEdit();
}
</script>


<style scoped lang="scss">

</style>