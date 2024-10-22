
<template>
  <div class="common-layout">
    <el-container class="el-container">
      <el-header class="el-header" style="background-color: #00d7c6">
        <Header></Header>
      </el-header>
      <el-container class="el-container-main">
        <el-aside class="el-aside-main" width="200px" style="background-color: #545c64">
          <LeftHeader></LeftHeader>
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
import LeftHeader from "@/layout/header/LeftHeader.vue";

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
  }
  .el-aside-main{
    //padding: 8px 0 0 0;
    height: 100%;
  }

  .el-main{
    padding: 0;
    margin: 8px 0 0 8px;
    height: 100%;
  }
}

</style>