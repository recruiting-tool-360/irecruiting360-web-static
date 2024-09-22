<template>
  <i class="ali-icon" :class="innerIcon"></i>
</template>

<script setup>

import {computed} from "vue";

const props = defineProps({
  icon:{
    type:String,
    required: true
  }
});
const innerIcon = computed(()=>"element-icons "+ (props.icon||''));

</script>

<style scoped>

</style>