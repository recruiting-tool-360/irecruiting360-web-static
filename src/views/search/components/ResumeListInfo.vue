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
        <el-col class="geek-img-el-col el-col-display-Style" :span="14">
          <!--   头像     -->
          <el-avatar class="headerIcons" :size="40" :src="`${geekList.gender===1?'/index/header/icons/geekMan.svg':'/index/header/icons/geekWoman.svg'}`" />
          <el-text class="mx-1 el-button-margin-left" style="font-size: 1rem;font-weight: bold">{{geekList.name}}</el-text>
          <el-text class="mx-1 el-button-margin-left text-gray-color-130">{{geekList.genderStr}} · {{geekList.age}} </el-text>
          <el-button size="small" disabled round style="margin-left: 1rem;">求职意向:
            {{geekList.status?geekList.status:'未知'}}
            <el-tooltip
                class="box-item"
                :content="geekList.status?geekList.status:'未知'"
                placement="bottom"
            >
<!--              <el-text class="el-text-ellipsis" style="margin-left: 5px;color: rgb(96 98 102)">{{geekList.status?geekList.status:'未知'}}</el-text>-->
            </el-tooltip>
          </el-button>
          <!--    其他渠道查找      -->
          <el-tooltip effect="dark"
                      content="其他渠道查找相似简历"
                      placement="bottom">
            <el-button style="background-color: #8578ff;color: #ffffff" class="highestDegreeBtm" size="small" color="#8578ff" round @click.stop="handleSearchChannel(geekList)">
              <el-icon><Search /></el-icon>&nbsp;
              查找相似的简历</el-button>
          </el-tooltip>
        </el-col>
        <el-col class="geek-img-el-col el-col-display-Style" style="justify-content: end" :span="10">
          <el-button v-if="geekList.channel==='boss直聘'" text disabled size="small">
            <el-image :src="'/index/header/searchPage/boss.ico'"></el-image>
            &nbsp;&nbsp;BOSS直聘
          </el-button>
          <el-button v-else-if="geekList.channel==='智联招聘'" text disabled size="small">
            <el-image :src="'/index/header/searchPage/zhilian.svg'"></el-image>
            &nbsp;&nbsp;智联招聘
          </el-button>
          <el-button v-else-if="geekList.channel==='猎聘'" text disabled size="small">
            <el-image :src="'/index/header/searchPage/liepin.svg'"></el-image>
            &nbsp;&nbsp;猎聘
          </el-button>
          <el-button v-else-if="geekList.channel==='前程无忧'" text disabled size="small">
            <el-image :src="'/index/header/searchPage/job51.svg'"></el-image>
            &nbsp;&nbsp;前程无忧
          </el-button>
          <el-button v-else text disabled size="small">
            &nbsp;&nbsp;未知渠道
          </el-button>
          <el-text v-if="chatId" style="margin-right: 8px;color: #E0E0E0">|</el-text>

          <!-- 收藏按钮改为响应式设计 -->
          <div v-if="chatId" class="collect-container" @click.stop="handleCollectClick(geekList)">
            <el-image 
              :src="geekList.inCollection ? '/index/header/searchPage/collectTrue.svg' : '/index/header/searchPage/collectFalse.svg'"
              class="collect-icon"
            ></el-image>
            <span class="collect-text">收藏</span>
          </div>
        </el-col>
      </el-row>
      <!--  学历行    -->
      <el-row class="geek-highestDegree-el-row el-row-width-full el-row-margin-top-6px"  :gutter="0">
        <el-col class="geek-highestDegree-el-col el-col-display-Style" :span="15">
          <el-button style="background-color: #F0F6FF;color: #1F7CFF" class="highestDegreeBtm" color="#F0F6FF" size="small" round>{{geekList.degree?geekList.degree:"学历未知"}}</el-button>
          <el-button style="background-color: #E6FFFB;color: #13C2C2" color="#E6FFFB" class="highestDegreeBtm highestDegreeBtmMgLeft" size="small" round>{{geekList.experienceYear&&geekList.experienceYear>=0?geekList.experienceYear+"年":((geekList.experienceYear&&geekList.experienceYear===-1)?'应届生':'工作年龄未知')}}</el-button>
<!--          <el-button style="background-color: #c0bdb6;color: #6c6e6e" class="highestDegreeBtm highestDegreeBtmMgLeft" size="small" disabled round>-->
<!--            {{geekList.gender===1?'男':'女'}}</el-button>-->
          <el-button :style="`${geekList.gender === 1?'background-color: #409EFF;color: white':'background-color: #F56C6C;color: white'}`" :color="geekList.gender === 1?'#409EFF':'#F56C6C'" class="highestDegreeBtm highestDegreeBtmMgLeft" size="small" round>
            {{ geekList.gender === 1 ? '男' : '女' }}
          </el-button>
          <el-button v-show="geekList.intention" style="background-color: #f0f6ff;color: #999" color="#f0f6ff" class="highestDegreeBtm" size="small" round>{{geekList.intention}}</el-button>
<!--          <el-button style="background-color: #FFF7E6;color: #F79000" class="highestDegreeBtm highestDegreeBtmMgLeft" size="small" disabled round>-->
<!--            <el-image class="headerIcons" :src="'/index/header/icons/phone.svg'"></el-image>-->
<!--            {{geekList.gender===1?'男':'女'}}</el-button>-->
<!--          <el-button style="background-color: #F9F0FF;color: #722ED1" class="highestDegreeBtm highestDegreeBtmMgLeft" size="small" disabled round>-->
<!--            <el-image class="headerIcons" :src="'/index/header/icons/email.svg'"></el-image>-->
<!--            12345678910@126.com</el-button>-->
        </el-col>
        <el-col v-if="props.channelConfig&&props.channelConfig.key!=='Collect'&&searchStateAiParamStatusFlag" class="geek-highestDegree-el-col el-col-display-Style" style="justify-content: end" :span="9">
<!--          <div class="geekAIBtm">-->
<!--            <spa>AI评估</spa>-->
<!--          </div>-->
          <div class="geekAIBtm" @click.stop="showAIEvaluation(geekList)">
            <spa>AI评估</spa>
          </div>
          <div class="geekAINumBtm" @click.stop="showAIEvaluation(geekList)">
            <el-text v-if="geekList.score!==undefined&&geekList.score!==null&&geekList.score>=sortComparisonValue" style="font-size: 20px;display: flex;align-items: center">
              <span :style="`color: ${parseFloat(geekList.score.toFixed(0)) > 50 ? 'rgba(31, 35, 41, 1)' : 'rgba(250, 173, 20, 1)'}`">{{parseFloat(geekList.score.toFixed(0))}}</span>
              <el-icon class="ScoreArrowRight" color="#a9abb2" style="font-size: 14px;margin-left: 4px"><ArrowRight /></el-icon>
            </el-text>
            <el-image v-else class="rotating" :src="'/index/header/searchPage/quanquan.svg'" style="width: 18px;height: 18px"></el-image>
          </div>
        </el-col>
      </el-row>

      <!--  工作年龄一行    -->
      <el-row class="geek-work-el-row el-row-width-full el-row-margin-top-6px" :gutter="0" style="justify-content: space-between">
        <div>
          <el-button text style="background-color: rgba(255,230,230,0);color: #878787" class="workBtm" size="small" round>
            <el-image  class="headerIcons" :src="'/index/header/icons/work.svg'" style="margin-right: 10px"></el-image>
            <!--          <el-text>2018.01 - 2020.12   上海力德信息科技有限公司</el-text>-->
            <el-text style="color: #7a889b">
              {{geekList.workExp?(geekList.workExp.name?geekList.workExp.name:"未知"):"未知"}}
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
              <el-text v-show="geekList.workExp?.name">
                <el-text v-show="geekList.workExp?.workStartTime" style="color: #7a889b">{{geekList.workExp?(geekList.workExp.workStartTime?geekList.workExp.workStartTime:"未知"):"未知"}} &nbsp;&nbsp;~&nbsp;&nbsp;</el-text>
                <el-text v-show="geekList.workExp?.workEndTime" style="color: #7a889b">{{geekList.workExp?(geekList.workExp.workEndTime?geekList.workExp.workEndTime:"未知"):"未知"}}</el-text>
              </el-text>
            </el-text>

          </el-button>
        </div>
<!--        <div>-->
<!--          &lt;!&ndash;    其他渠道查找      &ndash;&gt;-->
<!--          <el-tooltip effect="dark"-->
<!--                      content="其他渠道查找"-->
<!--                      placement="bottom">-->
<!--            <el-button style="background-color: rgb(84 140 254);color: #ffffff" class="highestDegreeBtm" size="small" color="rgb(84 140 254)" round @click.stop="handleSearchChannel(geekList)">查找相似的简历</el-button>-->
<!--          </el-tooltip>-->
<!--        </div>-->

      </el-row>

      <!--  学校一行    -->
      <el-row class="geek-school-el-row el-row-width-full el-row-margin-top-6px" :gutter="0" style="justify-content: space-between">
        <div>
          <el-button text style="background-color: rgba(255,230,230,0);" class="schoolBtm" size="small" round>
            <el-image  class="headerIcons" :src="'/index/header/icons/school.svg'" style="margin-right: 10px"></el-image>
            <!--          <el-text>2013.09 - 2017.06   清华大学  视觉传达设计</el-text>-->
            <!--          <el-text>{{geekList.eduExp?geekList.eduExp:"未知"}}</el-text>-->
<!--            <el-text>{{geekList.eduExp?(geekList.eduExp.name?geekList.eduExp.name:"未知"):"未知"}}</el-text>-->
            <el-text style="color: #7a889b">
              {{geekList.eduExp?(geekList.eduExp.name?geekList.eduExp.name:"未知"):"未知"}}
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
              <el-text v-show="geekList.eduExp?.name">
                <el-text v-show="geekList.eduExp?.educationStartTime" style="color: #7a889b">{{geekList.eduExp?(geekList.eduExp.educationStartTime?geekList.eduExp.educationStartTime:"未知"):"未知"}} &nbsp;&nbsp;~&nbsp;&nbsp; </el-text>
                <el-text v-show="geekList.eduExp?.educationEndTime" style="color: #7a889b">{{geekList.eduExp?(geekList.eduExp.educationEndTime?geekList.eduExp.educationEndTime:"未知"):"未知"}}</el-text>
              </el-text>
            </el-text>
          </el-button>
        </div>
        <div>
        <!--    简要描述      -->
          <el-tooltip effect="dark"
                      :content="geekList.description"
                      placement="bottom">
            <el-button style="background-color: #f0f6ff;color: #999" class="highestDegreeBtm" size="small" color="#f0f6ff" round>简要描述</el-button>
          </el-tooltip>
        </div>

      </el-row>

    </el-card>

    <AIEvaluationCard 
      v-if="showAIDialog" 
      :visible="showAIDialog" 
      :evaluation-data="currentEvaluation" 
      :dimension-map="dimensionMap"
      :dimension-items="currentEvaluation ? getDimensionItems(currentEvaluation) : {}"
      @update:visible="(val) => showAIDialog = val" :on-user-info="clickListInfo">
    </AIEvaluationCard>
<!--    查询相似的人-->
<SearchChannelDialog ref="searchChannelDialogRef"
                     v-model:visible="showSearchChannelDialog"
                     @close="showSearchChannelDialog = false"
                     :collect-click="handleCollectClick"
                     :list-info-click="clickListInfoNoAsync"/>
</div>
</template>

<script setup>
import {onMounted,computed,ref,watch,defineExpose} from "vue";
import {useStore} from "vuex";
import {userCollectResume, getScoreListDetailed, getScoreListDetailedPlus} from "@/api/jobList/JobListApi";
import {ElButton, ElMessage} from "element-plus";
import {getSortComparisonValue} from "@/config/staticConf/AIConf";
import {ArrowRight, Search, SwitchButton} from "@element-plus/icons-vue";
import AIEvaluationCard from './AIEvaluationCard.vue';
import {generateSearchCondition} from "@/api/research/ResearchApi";
import {saveCondition} from "@/api/search/SearchApi";
import SearchChannelDialog from '@/views/search/components/SearchChannelDialog.vue';

//store
const store = useStore();
// 通过 defineProps 定义 props
const props = defineProps({
  listData: Object,
  clickListInfoFn:Function,
  channelConfig:Object,
  searchStateCriteria: {
    type: Object,
    default: () => ({})
  }
});
const searchChannelDialogRef = ref(null);
const jobALlData = computed(()=>props.listData);
const channelKey = "Collect";
const channelConfig =computed(()=>store.getters.getChannelConfByChannel(channelKey));
const sortComparisonValue = getSortComparisonValue();
const clickListInfo = (value) => {
  props.clickListInfoFn(value,true);
}
const clickListInfoNoAsync = (value) => {
  props.clickListInfoFn(value,false);
}
//用户信息
const userInfo = computed(() => store.getters.getUserInfo);
//ai推荐
const searchStateAIParam = computed(()=>props.searchStateCriteria);
const searchStateAiParamStatus = computed(() => {return (searchStateAIParam.value && Object.keys(searchStateAIParam.value).length > 0)?"JDMATCH":"SCORE";});
const searchStateAiParamStatusFlag = computed(() => searchStateAiParamStatus.value === "JDMATCH");
//当前chat id
const chatId = computed(() => store.getters.getLatestChatId);
//搜索id
const searchConditionId = computed(() => store.getters.getSearchConditionId);
//aiSearchRef
const aiSearchRef = computed(() => store.getters.getAiSearchRefValue);

// AI评估相关
const showAIDialog = ref(false);
const currentEvaluation = ref(null);
//类似的人才loading
const showSearchChannelDialog = ref(false);

// 定义维度映射
const dimensionMap = {
  '专业技能': 'professional',
  '工作经历': 'experience',
  '软实力': 'softSkills'
};

// 定义标准评估维度数组
const standardDimensions = [
  {
    groupKey: '专业技能',
    items: [
      {
        name: '技术栈',
        requirement: '岗位所需技术栈',
        candidateField: 'skills',
        candidateFallback: '未提供技术栈信息',
        matchCondition: (geek) => geek.skills,
        matchResult: { match: '匹配', noMatch: '部分匹配' }
      },
      {
        name: '专业知识',
        requirement: '相关专业知识',
        candidateField: 'professionalKnowledge',
        candidateFallback: '未详细说明',
        matchCondition: (geek) => geek.professionalKnowledge,
        matchResult: { match: '匹配', noMatch: '部分匹配' }
      }
    ]
  },
  {
    groupKey: '工作经历',
    items: [
      {
        name: '工作年限',
        requirement: '3年以上相关经验',
        candidateField: 'experienceYear',
        candidateFormatter: (geek) => `${geek.experienceYear >= 0 ? geek.experienceYear + '年经验' : '经验未知'}`,
        matchCondition: (geek) => geek.experienceYear > 3,
        matchResult: { match: '匹配', noMatch: '部分匹配' }
      },
      {
        name: '项目经验',
        requirement: '有相关项目经验',
        candidateField: 'workExp',
        candidateFallback: '未详细说明',
        matchCondition: (geek) => geek.workExp,
        matchResult: { match: '匹配', noMatch: '不匹配' }
      }
    ]
  },
  {
    groupKey: '软实力',
    items: [
      {
        name: '沟通能力',
        requirement: '良好的沟通能力',
        candidateField: 'communicationSkill',
        candidateFormatter: (geek) => geek.communicationSkill ? '具备良好沟通能力' : '未评估',
        matchCondition: (geek) => geek.communicationSkill,
        matchResult: { match: '匹配', noMatch: '部分匹配' }
      },
      {
        name: '团队协作',
        requirement: '良好的团队协作能力',
        candidateField: 'teamwork',
        candidateFormatter: (geek) => geek.teamwork ? '具备团队协作能力' : '未评估',
        matchCondition: (geek) => geek.teamwork,
        matchResult: { match: '匹配', noMatch: '部分匹配' }
      }
    ]
  }
];

// 显示AI评估对话框
const showAIEvaluation = async (geek) => {
  try {
    // 调用API获取评估数据
    const { data } = await getScoreListDetailedPlus({resumeBlindIds:[geek.id],channel:channelKey,searchId:searchConditionId.value}); // 传递geekList.id作为参数

    // const { data } = await getScoreListDetailedPlus({resumeBlindIds:["1904739754998632448"],channel:channelKey,searchId:"1904740386996477953"}); // 传递geekList.id作为参数

    if (data && data.length > 0) {
      const evaluationData = data[0];
      
      // 计算每个维度的平均分
      const dimensionScores = {
        professional: 0,
        experience: 0,
        softSkills: 0
      };
      
      // 默认初始化成基础分数
      // dimensionScores.professional = 70;
      // dimensionScores.experience = 70;
      // dimensionScores.softSkills = 70;
      // console.log("evaluationData",evaluationData)
      if(!evaluationData.standardDimensions){
        ElMessage.warning('AI正在评估中，请稍后查看');
        return;
      }
      // 如果有详细评分，根据matched项来调整每个维度的分数
      evaluationData.standardDimensions.forEach(dimension => {
        // if (dimension.items && dimension.items.length > 0) {
          // const matchCount = dimension.items.filter(item => item.matchResult === "匹配").length;
          // const totalCount = dimension.items.length;
          //
          // if (totalCount > 0) {
          //   const matchPercentage = (matchCount / totalCount) * 100;
          //
            if (dimension.groupKey === "专业技能") {
              // dimensionScores.professional = Math.min(Math.max(60 + matchPercentage * 0.4, 60), 95);
              dimensionScores.professional = parseFloat(dimension.score.toFixed(2))
            } else if (dimension.groupKey === "工作经历") {
              // dimensionScores.experience = Math.min(Math.max(60 + matchPercentage * 0.4, 60), 95);
              dimensionScores.experience = parseFloat(dimension.score.toFixed(2))
            } else if (dimension.groupKey === "软实力") {
              // dimensionScores.softSkills = Math.min(Math.max(60 + matchPercentage * 0.4, 60), 95);
              dimensionScores.softSkills = parseFloat(dimension.score.toFixed(2))
            }
          // }
        // }
      });
      
      // 构建完整的评估对象
      currentEvaluation.value = {
        ...geek,
        scores: dimensionScores,
        apiData: evaluationData
      };
      
      showAIDialog.value = true;
    } else {
      // 如果API没有返回数据，使用基础信息展示
      ElMessage.warning('AI正在评估中，请稍后查看');
      return
    }
  } catch (error) {
    console.error("获取AI评估数据失败:", error);
    ElMessage.error('获取AI评估数据失败，请联系管理员');
    return
  }
};

// 使用API数据获取维度项目
const getDimensionItems = (geek) => {
  // 如果有API数据，使用API数据
  if (geek.apiData) {
    const apiDimensions = geek.apiData.standardDimensions;
    const result = {};
    
    apiDimensions.forEach(dimension => {
      result[dimension.groupKey] = dimension.items.map(item => ({
        name: item.name,
        requirement: item.requirement,
        candidate: item.candidateFallback || '未知',
        match: item.matchResultStr
      }));
    });
    
    return result;
  }
  
  // 否则使用默认数据（保留原有逻辑作为备选）
  const result = {};
  
  standardDimensions.forEach(dimension => {
    result[dimension.groupKey] = dimension.items.map(item => {
      let candidateValue;
      
      if (item.candidateFormatter) {
        candidateValue = item.candidateFormatter(geek);
      } else if (geek[item.candidateField]) {
        candidateValue = geek[item.candidateField];
      } else {
        candidateValue = item.candidateFallback || '未知';
      }
      
      const isMatch = item.matchCondition(geek);
      const matchValue = isMatch ? item.matchResult.match : item.matchResult.noMatch;
      
      return {
        name: item.name,
        requirement: item.requirement,
        candidate: candidateValue,
        match: matchValue
      };
    });
  });
  
  return result;
};

const handleCollectClick = async (listInfo, value) => {
  // if (listInfo.collectOrNot === undefined || listInfo.collectOrNot === null) {
  //   listInfo.collectOrNot = 0;
  // }
  // listInfo.inCollection = listInfo.collectOrNot === 0 ? 1 : 0;
  const requestData = {
    userId: userInfo.value.id,
    resumeBlindId: listInfo.id,
    isSaveOtherDelete: !listInfo.inCollection,
    chatId:chatId.value
  };
  try {
    let {data} = await userCollectResume(requestData);
    channelConfig.value.cardInfoRef.search(1);
    listInfo.inCollection = requestData.isSaveOtherDelete;
    ElMessage.success('操作成功！');
  }catch (e){
    console.log(e);
    ElMessage.error('服务异常，请联系管理员！');
  }
};

const handleSearchChannel = (geekList) => {
  showSearchChannelDialog.value = true;
  searchChannelData(geekList);
};

//查找相似人
const searchChannelData = async (geek) => {
  try {
    let {data:serachConditionRequest} = await generateSearchCondition(geek.id,searchConditionId.value);
    let searchStateValues = aiSearchRef.value.getSearchStateValues(serachConditionRequest);
    let searchConditionRequest = aiSearchRef.value.getSearchConditionRequest(searchStateValues);
    const {data:channelSearchCondition} = await saveCondition(searchConditionRequest);
    // console.log(channelSearchCondition)
    await searchChannelDialogRef.value.handleSearch(channelSearchCondition,geek.id);
  }catch (e){
    console.log(e);
  }
}
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
  padding-left: 8px;
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

.el-text-ellipsis{
  //display: -webkit-box !important; /* 必须要设置为 WebKit 的盒模型 */
  -webkit-box-orient: vertical; /* 设置垂直排列 */
  -webkit-line-clamp: 2; /* 限制显示的行数 */
  overflow: hidden; /* 隐藏超出范围的内容 */
  text-overflow: ellipsis; /* 设置省略号 */
  word-wrap: break-word; /* 防止长单词撑破布局 */
  max-width: 100px; /* 根据需要设置最大宽度 */
  width: 100px;
}

.male-btn {
  background-color: #409EFF;
  color: white;
}
.female-btn {
  background-color: #F56C6C;
  color: white;
}

/* 收藏按钮容器 */
.collect-container {
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s ease;
  
  &:hover {
    background-color: rgba(0, 0, 0, 0.05);
  }
  
  .collect-icon {
    width: 16px;
    height: 16px;
    transition: transform 0.2s ease;
  }
  
  &:hover .collect-icon {
    transform: scale(1.1);
  }
  
  .collect-text {
    margin-left: 4px;
    color: #a8abb2;
    font-size: 12px;
    
    /* 在小屏幕上隐藏文字 */
    //@media (max-width: 1200px) {
    //  display: none;
    //}
  }
}

/* 在更小的屏幕上调整图标大小 */
@media (max-width: 768px) {
  .collect-container {
    padding: 4px;
    
    .collect-icon {
      width: 10px;
      height: 10px;
    }
  }
}

/* 在极小的屏幕上进一步调整 */
@media (max-width: 576px) {
  .collect-container {
    padding: 2px;
  }
  
  /* 调整渠道显示 */
  .geek-img-el-col {
    .el-button {
      padding: 4px;
      
      .el-image {
        margin-right: 0;
      }
      
      /* 隐藏渠道文字 */
      &::after {
        content: none;
      }
    }
  }
}
</style>