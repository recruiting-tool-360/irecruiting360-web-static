<template>
    <div class="aiSearchPage">
      <!--   搜索操作按钮   -->
      <div class="jobSearch">
        <el-card class="jobSearch-card">
          <!--     头部搜索     -->
          <el-row class="search-big-el-row" :gutter="10">
            <!--     搜索框       -->
            <el-col class="search-el-col" :span="14">

<!--              <el-select class="el-select"-->
<!--                         v-model="searchState.selectValue"-->
<!--                         filterable-->
<!--                         :filter-method="customFilter"-->
<!--                         placeholder="多个关键词空格隔开"-->
<!--                         loading-text="开始搜索"-->
<!--                         no-data-text="开始搜索"-->
<!--                         no-match-text="开始搜索"-->
<!--                         allow-create-->
<!--              >-->
<!--                <el-option-->
<!--                    v-for="item in filteredSearchOptions"-->
<!--                    :key="item.value"-->
<!--                    :label="item.label"-->
<!--                    :value="item.value"-->
<!--                />-->
<!--              </el-select>-->

              <el-input v-model="searchState.selectValue"
                        placeholder="多个关键词空格隔开"
                        class="input-with-select">
                <template #append>
                  <el-button :icon="CircleClose" @click="searchState.selectValue = ''"/>
                </template>
              </el-input>

            </el-col>

            <el-col class="search-el-col" :span="10">
              <!--      重置筛选项      -->
              <el-button class="btm-color btm-border-blue-style" @click="resetSearchConnect">重置筛选项</el-button>
              <!--     保存搜索条件       -->
              <el-button class="btm-color btm-border-blue-style">保存搜索条件</el-button>
              <!--     搜索按钮       -->
              <el-button class="btm-color-white btm-bg-color" @click="searchJobList">搜索</el-button>
              <!--     AI人才搜索       -->
              <el-button class="btm-color-white btm-color btm-ai-btm-bg-color" @click="aiChatDialogFlag=true">
                <el-image :src="'/index/header/icons/aiBtm.svg'" style="margin-right: 8px"></el-image>
                AI人才搜索</el-button>
            </el-col>
          </el-row>

          <!--     工作年限与年龄     -->
          <el-row class="work-and-age-row el-row-margin-top">
            <!--     工作年限       -->
            <el-col class="work-and-age-el-col el-col-display-Style" :span="12">
              <el-text class="mx-1" style="min-width: 4rem">工作年限:</el-text>
              <el-button class="btm-color btm-border-blue-style el-button-margin-left" size="small" @click="searchState.workElSliderValue = [-1,-1]">不限</el-button>
              <el-button class="el-button-margin-left" size="small" link @click="searchState.workElSliderValue = [1,3]">1-3</el-button>
              <el-button class="el-button-margin-left" size="small" link @click="searchState.workElSliderValue = [3,5]">3-5</el-button>
              <el-button class="el-button-margin-left" size="small" link @click="searchState.workElSliderValue = [5,10]">5-10</el-button>
              <div class="el-col-display-Style el-button-margin-left" style="justify-content: start;width: 100%">
                <span class="demonstration">自定义:</span>
                <el-slider class="el-button-margin-left" style="width: 60%" v-model="searchState.workElSliderValue" range :min="1" :max="11" :format-tooltip="(value)=>value<11?value+'年':'10年以上'"/>
              </div>
            <!--      年龄      -->
            </el-col>
            <el-col class="work-and-age-el-col el-col-display-Style" :span="12">
              <el-text class="mx-1 el-text-min-width-style">年龄:</el-text>
              <el-button class="btm-color btm-border-blue-style el-button-margin-left" size="small"  @click="searchState.ageElSliderValue = [-1,-1]">不限</el-button>
              <el-button class="el-button-margin-left" size="small" link @click="searchState.ageElSliderValue = [20,30]">20-30</el-button>
              <el-button class="el-button-margin-left" size="small" link @click="searchState.ageElSliderValue = [30,40]">30-40</el-button>
              <el-button class="el-button-margin-left" size="small" link @click="searchState.ageElSliderValue = [40,50]">40-50</el-button>
              <div class="el-col-display-Style el-button-margin-left" style="justify-content: start;width: 100%">
                <span class="demonstration">自定义:</span>
                <el-slider class="el-button-margin-left" style="width: 60%" v-model="searchState.ageElSliderValue" range :min="18" :max="51" :format-tooltip="(value)=>value<51?value+'岁':'50岁以上'"/>
              </div>
            </el-col>
          </el-row>


          <!--     学历：性别：当前薪资：期望薪资：当前工作地点：期望工作地点：     -->
          <el-row class="edu-and-sex-row el-row-margin-top" gutter="9">
            <!--     学历       -->
            <el-col class="edu-and-sex-el-col el-col-display-Style " :span="3">
              <el-text class="mx-1 el-text-min-width-style el-text-margin-rg-style">学历:</el-text>
              <el-select v-model="searchState.eduValue"
                         placeholder="学历"
                         size="small"
                         no-data-text="无"
                         no-match-text="无"
              >
                <el-option
                    v-for="item in degreeOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                />
              </el-select>
            </el-col>
            <!--     性别       -->
            <el-col class="edu-and-sex-el-col el-col-display-Style " :span="3">
              <el-text class="mx-1 el-text-min-width-style el-text-margin-rg-style">性别:</el-text>
              <el-select v-model="searchState.sexValue"
                         placeholder="性别"
                         size="small"
                         no-data-text="无"
                         no-match-text="无"
              >
                <el-option
                    v-for="item in genderOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                />
              </el-select>
            </el-col>
            <!--     当前薪资       -->
            <el-col class="edu-and-sex-el-col el-col-display-Style " :span="5">
              <el-text class="mx-1 el-text-margin-rg-style" style="min-width: 4rem">当前薪资:</el-text>
              <!--      开始        -->
              <el-select v-model="searchState.currentSalaryStartValue"
                         placeholder="K"
                         size="small"
                         no-data-text="无"
                         no-match-text="无"
                         style="width: 4rem"
              >
                <el-option
                    v-for="item in salaryConfig"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                />
              </el-select>
              <el-text class="mx-1" style="margin: 0 5px">-</el-text>
              <!--      结束        -->
              <el-select v-model="searchState.currentSalaryEndValue"
                         placeholder="K"
                         size="small"
                         no-data-text="无"
                         no-match-text="无"
                         style="width: 4rem"
              >
                <el-option
                    v-for="item in salaryConfig"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                />
              </el-select>
            </el-col>
            <!--     期望薪资       -->
            <el-col class="edu-and-sex-el-col el-col-display-Style " :span="5">
              <el-text class="mx-1 el-text-margin-rg-style" style="min-width: 4rem">期望薪资:</el-text>
              <!--      开始        -->
              <el-select v-model="searchState.expectedSalaryStartValue"
                         placeholder="K"
                         size="small"
                         no-data-text="无"
                         no-match-text="无"
                         style="width: 4rem"
              >
                <el-option
                    v-for="item in salaryConfig"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                />
              </el-select>
              <el-text class="mx-1" style="margin: 0 5px">-</el-text>
              <!--      结束        -->
              <el-select v-model="searchState.expectedSalaryEndValue"
                         placeholder="K"
                         size="small"
                         no-data-text="无"
                         no-match-text="无"
                         style="width: 4rem"
              >
                <el-option
                    v-for="item in salaryConfig"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                />
              </el-select>
            </el-col>
            <!--     当前工作地点       -->
            <el-col class="edu-and-sex-el-col el-col-display-Style " :span="8">
              <el-text class="mx-1 el-text-margin-rg-style" style="min-width: 6rem">当前工作地点:</el-text>
              <el-cascader
                  v-model="searchState.currentWorkPlaceValue"
                  :options="citiesConfig"
                  size="small"
                  placeholder="请选择城市"
              />
            </el-col>
          </el-row>

          <!--     学校：：职位：：公司：：：专业：：求职状态：     -->
          <el-row class="company-and-school-row el-row-margin-top" gutter="9">
            <!--     学校       -->
            <el-col class="company-and-school-el-col el-col-display-Style" :span="3">
              <el-text class="mx-1 el-text-min-width-style el-text-margin-rg-style">学校:</el-text>
              <el-input v-model="searchState.schoolInpValue" size="small" placeholder="学校" />
            </el-col>
            <!--     职位       -->
            <el-col class="company-and-school-el-col el-col-display-Style" :span="3">
              <el-text class="mx-1 el-text-min-width-style el-text-margin-rg-style">职位:</el-text>
              <el-input v-model="searchState.positionInpValue" size="small" placeholder="职位" />
            </el-col>
            <!--     公司       -->
            <el-col class="company-and-school-el-col el-col-display-Style" :span="3">
              <el-text class="mx-1 el-text-min-width-style el-text-margin-rg-style">公司:</el-text>
              <el-input v-model="searchState.corporationInpValue" size="small" placeholder="公司" />
            </el-col>
            <!--     专业       -->
            <el-col class="company-and-school-el-col el-col-display-Style" :span="3">
              <el-text class="mx-1 el-text-min-width-style el-text-margin-rg-style">专业:</el-text>
              <el-input v-model="searchState.professionInpValue" size="small" placeholder="专业" />
            </el-col>
            <!--     求职状态       -->
            <el-col class="company-and-school-el-col el-col-display-Style" :span="4">
              <el-text class="mx-1 el-text-margin-rg-style" style="min-width: 4rem">求职状态:</el-text>
              <el-select v-model="searchState.jobSeekingStatusInpValue"
                         placeholder="求职状态"
                         size="small"
                         no-data-text="无"
                         no-match-text="无"
              >
                <el-option
                    v-for="item in jobStatusOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                />
              </el-select>
            </el-col>
            <!--     期望工作地点       -->
            <el-col class="edu-and-sex-el-col el-col-display-Style " :span="8">
              <el-text class="mx-1 el-text-margin-rg-style" style="min-width: 6rem">期望工作地点:</el-text>
              <el-cascader
                  v-model="searchState.expectedWorkLocationValue"
                  :options="citiesConfig"
                  size="small"
                  placeholder="请选择城市"
              />
            </el-col>
          </el-row>
        </el-card>
      </div>

      <!--   列表部分   -->
      <div class="jobList">
        <el-card class="jobList-card">
          <!--    数据表标签页      -->
          <el-row class="jobList-top-el-row" :gutter="0" style="border-bottom: 2px solid #E8E8E8;min-height: 3rem">
            <!--    头部标签      -->
            <el-col class="jobList-top-el-col el-col-display-Style" style="justify-content: start;align-items: center;" :span="16">
              <el-button text @click="jobInfoName='ALL';activeButton='ALL'" :class="{ 'btm-color': activeButton === 'ALL' }">聚合渠道</el-button>
              <el-button text @click="jobInfoName='BOSS';activeButton='BOSS'" :class="{ 'btm-color': activeButton === 'BOSS' }">BOSS(
                <el-text v-if="allLoginStatus.BOSS" class="" type="success">已登陆</el-text>
                <el-text v-else class="" type="danger">未登陆</el-text>
                )</el-button>
              <el-button text @click="jobInfoName='ALL';activeButton='ZHILIAN'" :class="{ 'btm-color': activeButton === 'ZHILIAN' }">智联招聘</el-button>
              <el-button text @click="jobInfoName='ALL';activeButton='LAGOU'" :class="{ 'btm-color': activeButton === 'LAGOU' }">拉钩</el-button>
            </el-col>
            <!--    渠道设置      -->
            <el-col class="jobList-top-el-col el-col-display-Style" style="justify-content: end;align-items: center" :span="8">
              <el-checkbox v-model="searchState.unreadCheckBoxValue" label="仅显示未读" size="small" />
              <el-checkbox v-model="searchState.aiSortCheckBoxValue" label="根据AI评估排序" size="small" />
              <el-button class="btm-color" size="small" style="margin-left: 2rem">渠道设置</el-button>
            </el-col>
          </el-row>
          <!--    不同模版      -->
          <JobInfo v-if="jobInfoName==='ALL'"></JobInfo>
          <BossJobInfo v-if="jobInfoName==='BOSS'" :large-data="allResponse.BOSS"></BossJobInfo>
        </el-card>
      </div>

      <!--   聊天chat   -->
      <AIChat v-show="false" :dialog-flag="aiChatDialogFlag" :on-close-click="()=>aiChatDialogFlag=false"></AIChat>
    </div>
</template>
<script setup>
import { onMounted, ref} from 'vue'
import { CircleClose } from '@element-plus/icons-vue'
import AIChat from "@/views/search/dto/AIChat.vue";
import {createSearchState} from "@/views/search/dto/request/SearchStateConfig";
import {convertSearchConditionRequest} from "@/domain/request/SaveSearchRequest";
import {degreeOptions,genderOptions,salaryConfig,citiesConfig,jobStatusOptions} from "@/views/search/dto/SearchPageConfig";
import {saveCondition} from "@/api/search/SearchApi";
import PluginMessenger from "@/api/PluginSendMsg";
import {ElLoading, ElMessage} from 'element-plus';
import {getPluginBaseConfigEmptyDTO,getPluginEmptyRequestTemplate, pluginAllRequestType, pluginAllUrls, pluginKeys
} from "@/components/PluginRequestManager";
import {pluginBossResultProcessor, pluginResultProcessor} from "@/components/verifyes/PluginProcessor";
import qs from "qs";
import {useStore} from "vuex";
import {getBoosTestJobList} from "@/views/search/dto/request/TestData";
import {saveJobListRequestTemplate} from "@/domain/request/JobListRequest";
import {saveJobList} from "@/api/jobList/JobListApi";
import JobInfo from "@/views/search/components/JobInfo.vue";
import BossJobInfo from "@/views/search/components/BossJobInfo.vue";
import boosQueueManager from "@/components/QueueManager/queueManager";
import {getBoosHeader} from "@/components/QueueManager/BoosJobInfoManager";

const store = useStore();

//固定条件搜索属性
let searchStateConfig =createSearchState();
const searchState = ref(searchStateConfig);
//加载 loading
let loadingBig ;
//结果集渲染模版名称
const jobInfoName = ref("ALL");
const activeButton = ref('ALL');
//结果集
const allResponse = ref({
  ALL:{},
  BOSS:{},
  ZHILIAN:{},
  LAGOU:{},
});
//登陆状态
const allLoginStatus = ref({
  BOSS:false,
  ZHILIAN:false,
  LAGOU:false,
});
//ai对话框开关
const aiChatDialogFlag = ref(false);




//onMounted 生命周期函数
onMounted(async () => {
  const userLoginStatus = await boosUserStatus();
  console.log("userLoginStatusu",userLoginStatus)
  allLoginStatus.value.BOSS = pluginBossResultProcessor(userLoginStatus);
})

/**
 * 搜索
 * 保存搜索条件，
 * 接受渠道搜索条件，
 * 查询渠道简历列表
 * 同步列表
 * 异步同步数据（队列）
 */
const searchJobList = async () => {
  //处理工作年限边界
  const workElSliderValue = searchState.value.workElSliderValue;
  workElSliderValue[1] = workElSliderValue[1] === 11 ? workElSliderValue[1] = -1 : workElSliderValue[1];
  //处理年龄边界
  const ageElSliderValue = searchState.value.ageElSliderValue;
  ageElSliderValue[1] = ageElSliderValue[1] === 51 ? ageElSliderValue[1] = -1 : ageElSliderValue[1];
  //处理其他参数
  let searchConditionRequest = convertSearchConditionRequest(searchState.value);
  searchConditionRequest.experienceTo = workElSliderValue[1];
  searchConditionRequest.ageTo = ageElSliderValue[1];
  const {data} = await saveCondition(searchConditionRequest);
  console.log("data",data)
  const newObject888 = data.channelSearchConditions[0].conditionData;
  //如果开启测试，不需要查询数据列表
  let responseJobListData;
  if(store.getters.getTestSwitch){
    responseJobListData = getBoosTestJobList().BOSS;
  }else{
    responseJobListData = await boosJobList(data.channelSearchConditions[0].conditionData);
  }
  if(!pluginBossResultProcessor(responseJobListData)){
    ElMessage.error('Boos数据查询异常！请联系管理员！')
    return;
  }
  //列表存到后端
  const boosList = responseJobListData.responseData.data.zpData.geeks;
  let saveJobListRequest = saveJobListRequestTemplate();
  saveJobListRequest.outId = data.requestId;
  saveJobListRequest.searchConditionId = data.id;
  saveJobListRequest.channel = "BOSS";
  saveJobListRequest.resumeList = boosList;
  let {data:jobList} = await saveJobList(saveJobListRequest);
  allResponse.value.BOSS =jobList;
  console.log("allResponse.value.BOSS",allResponse.value.BOSS)
  //处理id
  if(!jobList||jobList.length===0){
    return;
  }
  const rtGeeksListIds = boosList.map(item => {
    const match = jobList.find(a => a.rawDataId === item.uniqSign);
    if (match) {
      return { [`'${match.rawDataId}'`]: match.id };
    }
    return item;
  });
  console.log(rtGeeksListIds)
  //查询渠道信息
  //生成异步任务
  boosList.forEach((item, index) => {
    const match = jobList.find(a => a.rawDataId === item.uniqSign);
    if (match) {
      let jobHunterInfo = item.geekCard;
      const queryString = `securityId=${jobHunterInfo.securityId}&segs=${jobHunterInfo.lidTag}&lid=${jobHunterInfo.lid}`;
      const outId = saveJobListRequest.outId;
      const resumeBlindId = match.id;
      const type ="1";
      const taskRequest = {queryString,outId,resumeBlindId,type};
      boosQueueManager.enqueue(taskRequest);
    }
  });
}


//boos数据列表
const boosJobList = async (searchConfig) => {
  const headers = await getBoosHeader(true);
  searchConfig.page = 1;
  const queryString = qs.stringify(searchConfig);
  //访问Boos
  let pluginEmptyRequestTemplate = getPluginEmptyRequestTemplate();
  pluginEmptyRequestTemplate.parameters = null;
  pluginEmptyRequestTemplate.requestHeader = headers;
  pluginEmptyRequestTemplate.requestType = pluginAllRequestType.GET;
  pluginEmptyRequestTemplate.requestPath = pluginAllUrls.BOSS.baseUrl+pluginAllUrls.BOSS.getAllJobList+"?"+queryString;
  return await i360Request(pluginEmptyRequestTemplate.action,pluginEmptyRequestTemplate);
}

//boos 请求头信息
// const getBoosHeader = async () => {
//   let headers = {};
//   //请求头信息
//   let pluginBaseConfigEmptyDTO = getPluginBaseConfigEmptyDTO();
//   pluginBaseConfigEmptyDTO.parameters = pluginKeys.BoosStorageKey;
//   let boosRequestHeader = await i360Request(pluginBaseConfigEmptyDTO.action, pluginBaseConfigEmptyDTO);
//   if(pluginResultProcessor(boosRequestHeader)){
//     const httpHeader = boosRequestHeader.responseData.data.headersData;
//     if(httpHeader){
//       headers= httpHeader;
//     }
//   }else{
//     ElMessage.error('系统无法监测到Boos直聘网站认证信息！如果问题还没解决请联系管理员！')
//     throw new Error("request error");
//   }
//   //认证信息
//   let pluginCookieBaseConfigEmpty = getPluginBaseConfigEmptyDTO();
//   pluginCookieBaseConfigEmpty.parameters =pluginKeys.BoosCookieStorageKey;
//   let responseCookieData = await i360Request(pluginCookieBaseConfigEmpty.action,pluginCookieBaseConfigEmpty);
//   if(pluginResultProcessor(responseCookieData)){
//     const httpHeader = responseCookieData.responseData.data.cookieData;
//     if(httpHeader){
//       headers= Object.assign(headers,{Cookie:httpHeader})
//     }else{
//       ElMessage.error('系统无法监测到Boos直聘网站认证信息！如果问题还没解决请联系管理员！')
//       throw new Error("request error");
//     }
//   }else{
//     ElMessage.error('系统无法监测到Boos直聘网站认证信息！如果问题还没解决请联系管理员！')
//     throw new Error("request error");
//   }
//   return headers;
// }


//boos 用户登陆状态
const boosUserStatus = async () => {
  const headers = await getBoosHeader(true);
  let pluginEmptyRequestTemplate = getPluginEmptyRequestTemplate();
  pluginEmptyRequestTemplate.parameters = null;
  pluginEmptyRequestTemplate.requestHeader = headers;
  pluginEmptyRequestTemplate.requestType = pluginAllRequestType.GET;
  pluginEmptyRequestTemplate.requestPath = pluginAllUrls.BOSS.baseUrl+pluginAllUrls.BOSS.checkUserAuth;
  return await i360Request(pluginEmptyRequestTemplate.action,pluginEmptyRequestTemplate);
}


//打开加载 loding
const loadingOpen = () => {
  loadingBig = ElLoading.service({
    lock: true,
    text: 'Loading'
  })
  setTimeout(() => {
    loadingClose()
  }, 8000)
}
//关闭加载 loding
const loadingClose = ()=>{
  loadingBig.close();
}
//请求
const i360Request= async (action,emptyRequestTemplate, timeout = 5000) => {
  loadingOpen();
  try {
    const response = await PluginMessenger.sendMessage(action, emptyRequestTemplate, timeout);
    loadingClose();
    return response;
  } catch (error) {
    console.error('Error:', error.message);
  }
  loadingClose();
}

/**
 * 监听数据表头部事件
 * @param tab
 * @param event
 */
const jobListTopTabHandleClick = (tab,event) => {
  console.log(tab, event)
}
/**
 * 重置搜索条件
 */
const resetSearchConnect = ()=>{
  searchState.value = createSearchState();
}


</script>
<style scoped lang="scss">
  .aiSearchPage{
    height: 100%;
    .jobSearch{
      min-height: 20%;
      .jobSearch-card{
        width: 100%;
        height: 100%;
        padding: 0 1rem;

        //el-row-width-full
        .el-row-width-full{
          width: 100%;
        }
        .el-row-margin-top{
          margin-top: 1rem;
        }
        .el-button-margin-left{
          margin-left: 1rem;
        }
        .el-col-display-Style{
          display: flex;
          align-items: center;
        }
        .el-text-display-block-style{
          display: block;
        }
        .el-text-min-width-style{
          min-width: 2rem;
        }
        .el-text-margin-rg-style{
          margin-right: 5px;
        }
        .demonstration {
          font-size: 14px;
          color: var(--el-text-color-secondary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          margin-bottom: 0;
        }
      }
    }
    .jobList{
      margin-top: 1rem;
      min-height: 50%;
      .jobList-card{
        width: 100%;
        height: 100%;
        padding: 0 1rem;

        //el-row-width-full
        .el-row-width-full{
          width: 100%;
        }
        .el-row-margin-top{
          margin-top: 1rem;
        }
        .el-button-margin-left{
          margin-left: 1rem;
        }
        .el-col-display-Style{
          display: flex;
          align-items: center;
        }
        .el-text-display-block-style{
          display: block;
        }
        .el-text-min-width-style{
          min-width: 2rem;
        }
        .el-text-margin-rg-style{
          margin-right: 5px;
        }
      }
    }
    ::v-deep(.input-with-select .el-input-group__append) {
      background-color: #1f7cff0d;

      :hover{
        transform: scale(1.05);
      }
    }

    .geek-card-list{
      width: 100%;
      padding: 0 1rem;

      //el-row-width-full
      .el-row-width-full{
        width: 100%;
      }
      .el-row-margin-top{
        margin-top: 1rem;
      }
      .el-button-margin-left{
        margin-left: 1rem;
      }
      .el-col-display-Style{
        display: flex;
        align-items: center;
      }
      .el-text-display-block-style{
        display: block;
      }
      .el-text-min-width-style{
        min-width: 2rem;
      }
      .el-text-margin-rg-style{
        margin-right: 5px;
      }
    }
  }
</style>