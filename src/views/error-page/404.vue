<template>
  <div class="error-404">
    <div class="icon errorBox">
      <Aicon icon="el-icon-153error40402"></Aicon>
    </div>
    <div class="text errorBox">
      <span>页面不存在</span>
    </div>
    <div class="btm errorBox">
      <el-link :underline="false" @click="goBackLastPage">返回上一页</el-link>
    </div>
  </div>
</template>

<script setup>
import Aicon from "@/components/Aicon";
import router from "@/router";

const goBackLastPage=()=>{
  router.back();
}
</script>

<style lang="scss" scoped>
.error-404{
  height: 100%;
  display: flex;
  align-content: center;
  flex-wrap: wrap;

  .errorBox{
    width: 100%;
    display: flex;
    justify-content: center;
    margin-bottom: 15px;
  }

  .ali-icon{
    font-size: 250px;
    color: #97a8be;
  }

  .text{
    font-size: 18px;
    color: #7e838d;
    font-family: cursive;
    font-weight: bold;
  }

  .el-link{
    color: #b1b2b6;
  }
  .el-link:hover{
    color: #409eff;
  }
}
</style>
