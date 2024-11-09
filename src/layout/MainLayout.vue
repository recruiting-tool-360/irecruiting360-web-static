
<template>
  <div class="common-layout">
    <el-container class="el-container">
      <el-header class="el-header">
        <Header></Header>
      </el-header>
      <el-container class="el-container-main">
        <el-aside class="el-aside-main">
          <LeftHeader2></LeftHeader2>
        </el-aside>
        <el-main class="el-main" style="background-color: #ffffff">
          <router-view></router-view>
        </el-main>
      </el-container>
    </el-container>
  </div>
</template>

<script setup>
import Header from "@/layout/header/Header.vue";
import LeftHeader2 from "@/layout/header/LeftHeader2.vue";

</script>

<style scoped lang="scss">
.common-layout{
  height: 100%;
  .el-container{
    height: 100%;
    overflow: hidden;
  }
  .el-header{
    padding: 0;
    background-color: rgba(31, 124, 255, 1)
  }
  .el-aside-main{
    //padding: 8px 0 0 0;
    height: 100%;
    background-color: white;
    width: 17rem;
  }

  .el-main{
    padding: 0;
    margin: 8px 0 0 8px;
    height: 100%;
  }
}

</style>