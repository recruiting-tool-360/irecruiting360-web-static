<template>
  <div class="bossContainer">
    <!--  列表信息  -->
    <el-card class="geek-card-list" v-for="geekList in jobALlData" :key="geekList.id">
      <!--  头像行    -->
      <el-row class="geek-img-el-row el-row-width-full" :gutter="10">
        <el-col class="geek-img-el-col el-col-display-Style" :span="18">
          <!--   头像     -->
          <el-avatar class="headerIcons" :size="40" :src="`${geekList.genderStr==='男'?'/index/header/icons/geekMan.svg':'/index/header/icons/geekWoman.svg'}`" />
          <el-text class="mx-1 el-button-margin-left" style="font-size: 1rem;font-weight: bold">{{geekList.name}}</el-text>
          <el-text class="mx-1 el-button-margin-left text-gray-color-130">{{geekList.genderStr}} · {{geekList.age}} · 未知</el-text>
          <el-button size="small" disabled round style="margin-left: 1rem;">求职意向:
            <el-text style="margin-left: 5px;color: rgb(31, 35, 41)">{{geekList.intention}}</el-text>
            </el-button>
        </el-col>
        <el-col class="geek-img-el-col el-col-display-Style" style="justify-content: end" :span="6">
          <el-button text disabled size="small">BOSS直聘</el-button>
          <el-text style="margin-right: 8px;color: #E0E0E0">|</el-text>
          <el-rate :v-model="geekList.collectOrNot" :max="1"/>
          <el-button disabled text size="small" style="margin-left: -5px">
            收藏
          </el-button>
        </el-col>
      </el-row>
      <!--  学历行    -->
      <el-row class="geek-highestDegree-el-row el-row-width-full el-row-margin-top-6px"  :gutter="0">
        <el-col class="geek-highestDegree-el-col el-col-display-Style" :span="15">
          <el-button style="background-color: #F0F6FF;color: #1F7CFF" class="highestDegreeBtm" size="small" disabled round>{{geekList.educationStr}}</el-button>
          <el-button style="background-color: #E6FFFB;color: #13C2C2" class="highestDegreeBtm highestDegreeBtmMgLeft" size="small" disabled round>{{geekList.experienceYear}}年</el-button>
          <el-button style="background-color: #FFF7E6;color: #F79000" class="highestDegreeBtm highestDegreeBtmMgLeft" size="small" disabled round>
            <el-image class="headerIcons" :src="'/index/header/icons/phone.svg'"></el-image>
            12345678910</el-button>
          <el-button style="background-color: #F9F0FF;color: #722ED1" class="highestDegreeBtm highestDegreeBtmMgLeft" size="small" disabled round>
            <el-image class="headerIcons" :src="'/index/header/icons/email.svg'"></el-image>
            12345678910@126.com</el-button>
        </el-col>
        <el-col class="geek-highestDegree-el-col el-col-display-Style" style="justify-content: end" :span="9">
          <el-button class="geekAIBtm" size="large">AI评估</el-button>
          <el-button class="geekAINumBtm" size="large">0</el-button>
        </el-col>
      </el-row>

      <!--  工作年龄一行    -->
      <el-row class="geek-work-el-row el-row-width-full el-row-margin-top-6px" :gutter="0">
        <el-button text style="background-color: rgba(255,230,230,0);" class="workBtm" size="small" disabled round>
          <el-image  class="headerIcons" :src="'/index/header/icons/work.svg'" style="margin-right: 10px"></el-image>
          <el-text>2018.01 - 2020.12   上海力德信息科技有限公司</el-text>
        </el-button>
      </el-row>

      <!--  学校一行    -->
      <el-row class="geek-school-el-row el-row-width-full el-row-margin-top-6px" :gutter="0">
        <el-button text style="background-color: rgba(255,230,230,0);" class="schoolBtm" size="small" disabled round>
          <el-image  class="headerIcons" :src="'/index/header/icons/school.svg'" style="margin-right: 10px"></el-image>
          <el-text>2013.09 - 2017.06   清华大学  视觉传达设计</el-text>
        </el-button>
      </el-row>

    </el-card>
  </div>
</template>

<script setup>
import {Star} from '@element-plus/icons-vue'
import {ref,watch} from "vue";
// 通过 defineProps 定义 props
const props = defineProps({
  largeData: {
    type: Array,
    required: true
  }
});
const jobALlData =ref(props.largeData);


// 如果 props 的值可能会变化，使用 watch 来同步更新 localValue
watch(() => props.largeData, (newValue) => {
  jobALlData.value = newValue;
});
</script>

<style scoped lang="scss">
  .geek-card-list{
    margin-bottom: 10px;

    .el-row-margin-top-6px{
      margin-top: 6px
    }
    .el-col-display-Style{
      display: flex;
      align-items: center;
    }
    .el-button-margin-left{
      margin-left: 0.5rem;
    }

  }
  .highestDegreeBtmMgLeft{
    margin-left: 8px;
  }

  .geekAIBtm{
    color: white;
    border-radius: 10% 0 0 10%;
    background: linear-gradient(248deg, #C7A0FF 0%, #8777FF 11.71%, #5280FC 49.68%, #54A4FF 74.23%, #3CD1F6 90.26%, #74FFCD 100%);
    margin-right: 0 !important;
    border: none;
  }

  .geekAINumBtm{
    border-radius: 0 0 0 0;
    transform: rotate(180deg);
    background: linear-gradient(94deg, #bfacda 0%, #aca6d7 11.71%, #ced2de 49.68%, #c9cccf 74.23%, #c5d8dd 90.26%, #c7e1d8 100%);
    margin-left: 0 !important;
    border: none;
    font-size: 2rem;
  }

</style>