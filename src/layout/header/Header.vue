<template>
  <div class="header-container">
<!--    <div class="my-el-row">-->
<!--      -->
<!--    </div>-->
    <el-row class="el-row">
      <el-col :span="3" class="el-avatar-big">
        <el-avatar :size="50" :src="require('@/assets/128.png')" />
      </el-col>
      <el-col :span="5">
        <el-text class="title" size="large">i 快招</el-text>
<!--        <el-avatar :size="50" :src="require('@/assets/128.png')" />-->
      </el-col>
      <el-col :span="4"><div class="grid-content ep-bg-purple" /></el-col>
      <el-col :span="4"><div class="grid-content ep-bg-purple-light" /></el-col>
      <el-col :span="4"><div class="grid-content ep-bg-purple" /></el-col>
      <el-col class="col-ai-fend-btm" :span="2">
        <el-button class="ai-fend-btm">AI人才搜索</el-button>
      </el-col>
      <el-col class="col-operation-guide" :span="2">
        <el-text class="operation-guide" size="default">操作指南</el-text>
        <el-tooltip
            class="box-item"
            effect="dark"
            content="用户"
            placement="bottom">
          <el-avatar :size="30" :src="require('@/assets/128.png')" />
        </el-tooltip>
      </el-col>
    </el-row>
  </div>

</template>

<script setup>

</script>

<style scoped lang="scss">
.header-container{
  height: 100%;
  display: flex;
  flex-wrap: wrap;
  align-content: center;

  .el-row{
    height: 100%;
    width: 100%;
    .el-avatar-big{
      justify-content: right;
    }
    .title{
      padding-left: 1rem;
      font-size: 1.5rem;
      color: white;
    }
    .operation-guide{
      padding-right: 0.4rem;
    }
    .col-ai-fend-btm{
      justify-content: right;
    }

    .el-col{
      height: 100%;
      display: flex;
      align-content: center;
      align-items: center;
    }
    .col-operation-guide{
      justify-content: right;
      padding-right: 0.8rem;
    }
  }
}
</style>