<template>
  <div>
    <!--  列表信息  -->
    <el-card class="geek-card-list" v-for="geekList in jobALlData" :key="geekList.id" @click="clickListInfo(geekList)">
      <!--   已读   -->
      <div v-if="geekList.isRead" class="read-div">
        <el-image :src="'/index/header/searchPage/read.svg'" style="width: 100%;height: 100%"></el-image>
      </div>
      <!--  头像行    -->
      <el-row class="geek-img-el-row el-row-width-full" :gutter="10">
        <el-col class="geek-img-el-col el-col-display-Style" :span="18">
          <!--   头像     -->
          <el-avatar class="headerIcons" :size="40" :src="`${geekList.gender===1?'/index/header/icons/geekMan.svg':'/index/header/icons/geekWoman.svg'}`" />
          <el-text class="mx-1 el-button-margin-left" style="font-size: 1rem;font-weight: bold">{{geekList.name}}</el-text>
          <el-text class="mx-1 el-button-margin-left text-gray-color-130">{{geekList.genderStr}} · {{geekList.age}} · 未知</el-text>
          <el-button size="small" disabled round style="margin-left: 1rem;">求职意向:
            <el-text style="margin-left: 5px;color: rgb(31, 35, 41)">{{geekList.intention}}</el-text>
          </el-button>
        </el-col>
        <el-col class="geek-img-el-col el-col-display-Style" style="justify-content: end" :span="6">
          <el-button v-if="geekList.channel==='boss直聘'" text disabled size="small">
            <el-image :src="'/index/header/searchPage/boss.ico'"></el-image>
            &nbsp;&nbsp;BOSS直聘
          </el-button>
          <el-button v-else-if="geekList.channel==='智联招聘'" text disabled size="small">
            <el-image :src="'/index/header/searchPage/zhilian.svg'"></el-image>
            &nbsp;&nbsp;智联招聘
          </el-button>
          <el-button v-else text disabled size="small">
            &nbsp;&nbsp;未知渠道
          </el-button>
          <el-text style="margin-right: 8px;color: #E0E0E0">|</el-text>
          <el-image v-if="geekList.collectOrNot&&geekList.collectOrNot>=1" :src="'/index/header/searchPage/collectTrue.svg'" @click.stop="handleCollectClick(geekList)"></el-image>
          <el-image v-else :src="'/index/header/searchPage/collectFalse.svg'" @click.stop="handleCollectClick(geekList)"></el-image>
          <el-button disabled text size="small" style="margin-left: -5px;margin-bottom: 2px" @click.stop="handleCollectClick(geekList)">
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
          <div class="geekAIBtm">
            <spa>AI评估</spa>
          </div>
          <div class="geekAINumBtm">
            <el-text v-if="geekList.score!==undefined&&geekList.score!==null&&geekList.score>=sortComparisonValue" style="font-size: 20px;">{{geekList.score}}</el-text>
            <el-image v-else class="rotating" :src="'/index/header/searchPage/quanquan.svg'" style="width: 18px;height: 18px"></el-image>
          </div>
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
import {onMounted,computed,ref,watch,defineExpose} from "vue";
import {useStore} from "vuex";
import {userCollectResume} from "@/api/jobList/JobListApi";
import {ElMessage} from "element-plus";
import {getSortComparisonValue} from "@/config/staticConf/AIConf";

//store
const store = useStore();
// 通过 defineProps 定义 props
const props = defineProps({
  listData: Object,
  clickListInfoFn:Function
});
const jobALlData = computed(()=>props.listData);
const channelKey = "Collect";
const channelConfig =computed(()=>store.getters.getChannelConfByChannel(channelKey));
const sortComparisonValue = getSortComparisonValue();
const clickListInfo = (value) => {
  props.clickListInfoFn(value);
}

const handleCollectClick = async (listInfo, value) => {
  if (listInfo.collectOrNot === undefined || listInfo.collectOrNot === null) {
    listInfo.collectOrNot = 0;
  }
  listInfo.collectOrNot = listInfo.collectOrNot === 0 ? 1 : 0;
  const requestData = {
    userId: 1,
    resumeBlindId: listInfo.id,
    isSaveOtherDelete: listInfo.collectOrNot === 1
  };
  try {
    let {data} = await userCollectResume(requestData);
    channelConfig.value.cardInfoRef.search(1);
    ElMessage.success('操作成功！');
  }catch (e){
    console.log(e);
    ElMessage.error('服务异常，请联系管理员！');
  }
};
</script>

<style scoped lang="scss">
.geek-card-list{
  margin-bottom: 10px;
  position: relative;

  .read-div{
    height: 43px;
    width: 43px;
    position: absolute;
    top: 0;
    left: 0;
  }

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

  :hover{
    cursor: pointer;
  }
}
.highestDegreeBtmMgLeft{
  margin-left: 8px;
}

.geekAIBtm{
  width: 70px;
  height: 36px;
  color: white;
  border-radius: 8.93px 0 0 8.93px;
  background: linear-gradient(248deg, #C7A0FF 0%, #8777FF 11.71%, #5280FC 49.68%, #54A4FF 74.23%, #3CD1F6 90.26%, #74FFCD 100%);
  margin-right: 0 !important;
  border: none;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 13px;
}

.geekAINumBtm{
  width: 56px;
  height: 36px;
  border-radius: 0 8.93px 8.93px 0;
  background: linear-gradient(246.8deg, rgba(199, 160, 255, 0.15) 0%, rgba(136, 120, 255, 0.15) 11.71%, rgba(82, 128, 252, 0.15) 49.68%, rgba(84, 164, 255, 0.15) 74.23%, rgba(60, 209, 246, 0.15) 90.26%, rgba(116, 255, 205, 0.15) 100%);
  margin-left: 0 !important;
  border: none;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 20px;
}

.pageConfig{
  border-top:1px solid #E8E8E8;
  padding: 8px 16px;
  display: flex;
  justify-content: end;

}

.rotating {
  animation: spin 2s linear infinite; /* 2秒完成一圈，线性匀速，无限循环 */
}

@keyframes spin {
  from {
    transform: rotate(0deg); /* 起始角度 */
  }
  to {
    transform: rotate(360deg); /* 结束角度 */
  }
}

.bigGeekInfo{

  .geekInfoCad .el-text{
    margin: 0px 4px;
  }

}
</style>