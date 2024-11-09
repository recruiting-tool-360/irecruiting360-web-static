<template>
  <div class="left-header-container">
    <el-row class="el-row" justify="center">
      <el-col class="el-col" :span="24">
        <div>保存的搜索条件(0)</div>
      </el-col>
      <el-col class="el-col" :span="24">
        <el-input
            v-model="searchInp"
            style="width: 240px"
            placeholder="通过关键字检索已保存搜索条件"
            :suffix-icon="Search"
        />
      </el-col>
    </el-row>
  </div>

</template>

<script setup>
import {ref} from "vue";
import Aicon from "@/components/Aicon/index.vue";
import { Search } from '@element-plus/icons-vue'
import router from "@/router";

//搜索
const searchInp = ref("");

const myHerf = (menuConfig) => {
  router.push(menuConfig.path?menuConfig.path:"/")
}

</script>

<style scoped lang="scss">

.left-header-container{

  .el-row{
    padding: 1.5rem 1rem 0 1rem;

    .el-col{
      margin: 0.5rem 0;
    }
  }

}

</style>