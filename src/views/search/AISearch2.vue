<template>
    <div class="aiSearchPage">
      <!--   搜索操作按钮   -->
      <div class="jobSearch">
        <el-card class="jobSearch-card">
          <!--    搜索区域      -->
          <div class="searchTitle">
            <span>搜索区域</span>
          </div>
          <!--    搜索框      -->
          <el-row class="select-inp">
            <el-col :span="24">
              <el-select class="el-select" size="large"
                         v-model="value"
                         multiple
                         filterable
                         remote
                         reserve-keyword
                         placeholder="Please enter a keyword"
                         :remote-method="remoteMethod"
                         :loading="loading"
                         style="width: 240px"
              >
                <el-option
                    v-for="item in options"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                />
              </el-select>
              <!--      搜索按钮        -->
              <el-button class="search-btm" type="primary" :icon="Search">Search</el-button>
            </el-col>
          </el-row>
        </el-card>
      </div>
      <!--   搜索展示页面   -->
      <div class="main-job-container">
        <el-card class="main-job-container-card">
          <el-table :data="jobList" style="width: 100%">
            <el-table-column type="selection" width="55" />
            <el-table-column property="index" label="Index" width="120">
              <template #default="scope">{{ scope.row.index+1 }}</template>
            </el-table-column>
            <el-table-column label="Name" width="120">
              <template #default="scope">{{ scope.row.data.geekCard.name }}</template>
            </el-table-column>
            <el-table-column label="Age" width="120">
              <template #default="scope">{{ scope.row.data.geekCard.ageDesc }}</template>
            </el-table-column>
            <el-table-column label="School" width="120">
              <template #default="scope">{{ scope.row.data.geekCard.eduSchool }}</template>
            </el-table-column>
<!--            <el-table-column-->
<!--                property="address"-->
<!--                label="address"-->
<!--                width="240"-->
<!--                show-overflow-tooltip-->
<!--            />-->
<!--            <el-table-column property="address" label="address" />-->
            <el-table-column
                label="自我介绍"
                width="240"
                show-overflow-tooltip>
              <template #default="scope">{{ scope.row.data.highlightGeekDescName }}</template>
            </el-table-column>
            <el-table-column
                label="其他"
                width="240"
                show-overflow-tooltip>
              <template #default="scope">{{ JSON.stringify(scope.row.data) }}</template>
            </el-table-column>
            <el-table-column label="platform" width="120">
              <template #default="scope">{{ scope.row.platform===1?'BOSS直聘':'其他' }}</template>
            </el-table-column>
            <el-table-column label="platform" width="120">
              <template #default="scope">
                <el-button @click="openStaffInfo(scope.row)">查询详情</el-button>
              </template>
            </el-table-column>
          </el-table>
          <!--    分页器      -->
          <div class="example-pagination-block">
            <el-pagination layout="prev, pager, next" :total="50" @change="paginationChange"/>
          </div>
        </el-card>
      </div>
      <!--   页面dialog   -->
      <el-drawer
          v-model="staffInfoDialog"
          title="人才详情!"
          direction="ltr"
          class="demo-drawer"
      >
        <el-text>{{boosGeekInfo}}</el-text>
      </el-drawer>
    </div>
</template>
<script setup>
import { onMounted, ref } from 'vue'
import { Search } from '@element-plus/icons-vue'
import {
  getEmptyRequestTemplate,
  boosRequestParametersTemplate, getJobListTemplate
} from "@/components/RequestTemplate";
import PluginMessenger from "@/api/PluginSendMsg";
import { ElMessage } from 'element-plus'
import { ElNotification } from 'element-plus'
import _ from 'lodash';
import qs from 'qs';
import { ElLoading } from 'element-plus'

const list = ref([])
const options = ref([])
const value = ref([])
const loading = ref(false)
const pageIndex = ref(1);
const jobList = ref([]);
const staffInfoDialog =ref(false);
const boosGeekInfo =ref("");
// const { URL,URLSearchParams } = require('url');
let loadingBig ;


onMounted(async () => {
  let emptyRequestTemplate = getEmptyRequestTemplate();
  emptyRequestTemplate.group = "hasPluginInstalled";
  let res = await i360Request('HasPluginInstalled', emptyRequestTemplate,3000);
  if(res===undefined){
    ElNotification({
      title: 'Error',
      message: `系统无法查到【i快找】浏览器插件，请及时安装插件！\n 插件下载地址：http://www.xxx.com/xxx`,
      type: 'error',
      duration: 0
    })
    ElMessage.error('系统无法查到【i快找】浏览器插件，请及时安装插件！')
  }else{
    let emptyRequestTemplate = getEmptyRequestTemplate();
    emptyRequestTemplate.group = "boos";
    let boosRequestParams = boosRequestParametersTemplate();
    boosRequestParams.page = 1;
    boosRequestParams.filterParams = {"sortType":1,"region":{"cityCode":101020100,"cityName":"上海","areas":[]},"overSeaWorkExperience":0,"overSeaWorkLanguage":0,"manageExperience":0};
    emptyRequestTemplate.parameters = boosRequestParams;
    await getJobList(emptyRequestTemplate);
  }
  list.value = states.map((item) => {
    return {value: `value:${item}`, label: `label:${item}`}
  })
})

const remoteMethod = (query) => {
  if (query) {
    loading.value = true
    setTimeout(() => {
      loading.value = false
      options.value = list.value.filter((item) => {
        return item.label.toLowerCase().includes(query.toLowerCase())
      })
    }, 200)
  } else {
    options.value = []
  }
}

const paginationChange = async (value) => {
  console.log(value,generateTraceId())
  let emptyRequestTemplate = getEmptyRequestTemplate();
  emptyRequestTemplate.group = "boos";
  let boosRequestParams = boosRequestParametersTemplate();
  boosRequestParams.page = value;
  boosRequestParams.filterParams = {"sortType":1,"region":{"cityCode":101020100,"cityName":"上海","areas":[]},"overSeaWorkExperience":0,"overSeaWorkLanguage":0,"manageExperience":0};
  emptyRequestTemplate.parameters = boosRequestParams;
  await getJobList(emptyRequestTemplate);
  console.log("response2")
}
function xireliFn(){
  console.log("xireli mamat")
  return "xireli";
}

const getJobList = async (request)=>{
  const newObject = Object.fromEntries(
      Object.entries(request.parameters).filter(([key, value]) => value !== undefined)
  );
  newObject._=Date.now();
  const filterParamsJSON = JSON.stringify(newObject.filterParams);
  const queryString = qs.stringify({
    ...newObject,
    filterParams: undefined // 移除 filterParams，之后手动添加
  });
  const finalQueryString = `${queryString}&filterParams=${encodeURIComponent(filterParamsJSON)}`;
  request.parameters = finalQueryString;
  request.fn=xireliFn.toString();
  let responseData = await i360Request('BoosGetJobList',request);
  console.log(responseData)
  loadingClose();
  if(responseData===undefined||responseData.success===false||responseData.responseData.success===false||(!responseData.responseData.data)||(!responseData.responseData.data.message)){
    ElMessage.error('查询失败，请联系管理员')
    return;
  }
  if(responseData.responseData.data.message!=='Success'){
    if(responseData.responseData.data.code===7){
      ElMessage.error('Boos招聘平台 '+responseData.responseData.data.message);
      return;
    }
    ElMessage.error('查询失败，请联系管理员')
    return;
  }
  if(responseData.responseData.data.zpData){
    const zpData =responseData.responseData.data.zpData;
    const rtPage = zpData.page;
    const rtTotalCount = zpData.totalCount;
    const rtStartIndex = zpData.startIndex;
    if(zpData.geeks){
      const job = zpData.geeks.map((item, index) => {
        let jobListTemplate = getJobListTemplate();
        jobListTemplate.platform = 1;
        jobListTemplate.id = item.uniqSign;
        jobListTemplate.index = index;
        jobListTemplate.data = item;
        return jobListTemplate;
      });
      jobList.value = job;
      console.log(jobList.value)
    }
  }
  console.log("response",responseData)
}

const openStaffInfo = async (data) => {
  const staffInfo = data.data.geekCard;
  const request = {
    securityId:staffInfo.securityId,
    segs:staffInfo.lidTag,
    lid:staffInfo.lid
  }
  let emptyRequestTemplate = getEmptyRequestTemplate();
  emptyRequestTemplate.group = "boos";
  //const queryString = qs.stringify(request);
  const queryString = `securityId=${staffInfo.securityId}&segs=${staffInfo.lidTag}&lid=${staffInfo.lid}`;
  emptyRequestTemplate.parameters = queryString;
  let responseData = await i360Request('BoosGeekInfo',emptyRequestTemplate);
  loadingClose();
  if(responseData===undefined||responseData.success===false||responseData.responseData.success===false||(!responseData.responseData.data)||(!responseData.responseData.data.message)){
    ElMessage.error('查询失败，请联系管理员')
    return;
  }
  if(responseData.responseData.data.message!=='Success'){
    ElMessage.error('查询失败，请联系管理员')
    return;
  }
  if(responseData.responseData.data.zpData){
    boosGeekInfo.value = JSON.stringify(responseData.responseData.data.zpData);
    staffInfoDialog.value=true;
  }
  console.log("用户详细",responseData)
}

const i360Request= async (action,emptyRequestTemplate, timeout = 5000) => {
  loadingOpen();
  try {
    const response = await PluginMessenger.sendMessage(action, emptyRequestTemplate, timeout);
    return response;
  } catch (error) {
    console.error('Error:', error.message);
  }
  loadingClose();
}

function generateTraceId() {
  // 随机生成前四位
  const prefix = Math.floor(Math.random() * 10000).toString().padStart(4, '0');

  // 随机生成后16位（包含字母和数字）
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let suffix = '';
  for (let i = 0; i < 16; i++) {
    suffix += characters.charAt(Math.floor(Math.random() * characters.length));
  }

  // 合并成完整的 traceId
  return `F-${prefix}${suffix}`;
}

const loadingOpen = () => {
  loadingBig = ElLoading.service({
    lock: true,
    text: 'Loading'
  })
  setTimeout(() => {
    loadingClose()
  }, 8000)
}

const loadingClose = ()=>{
  loadingBig.close();
}

const states = [
  'Alabama',
  'Alaska',
  'Arizona',
  'Arkansas',
  'California',
  'Colorado',
  'Connecticut',
  'Delaware',
  'Florida',
  'Georgia',
  'Hawaii',
  'Idaho',
  'Illinois',
  'Indiana',
  'Iowa',
  'Kansas',
  'Kentucky',
  'Louisiana',
  'Maine',
  'Maryland',
  'Massachusetts',
  'Michigan',
  'Minnesota',
  'Mississippi',
  'Missouri',
  'Montana',
  'Nebraska',
  'Nevada',
  'New Hampshire',
  'New Jersey',
  'New Mexico',
  'New York',
  'North Carolina',
  'North Dakota',
  'Ohio',
  'Oklahoma',
  'Oregon',
  'Pennsylvania',
  'Rhode Island',
  'South Carolina',
  'South Dakota',
  'Tennessee',
  'Texas',
  'Utah',
  'Vermont',
  'Virginia',
  'Washington',
  'West Virginia',
  'Wisconsin',
  'Wyoming',
]

const tableData = [
  {
    index: '1',
    name: 'Aleyna Kutzner',
    address: 'Lohrbergstr. 86c, Süd Lilli, Saarland',
    platform: 1,
    platformData: null
  },
  {
    index: '2',
    name: 'Helen Jacobi',
    address: '760 A Street, South Frankfield, Illinois',
    platform: 1,
    platformData: null
  },
  {
    index: '3',
    name: 'Brandon Deckert',
    address: 'Arnold-Ohletz-Str. 41a, Alt Malinascheid, Thüringen',
    platform: 1,
    platformData: null
  },
  {
    index: '4',
    name: 'Margie Smith',
    address: '23618 Windsor Drive, West Ricardoview, Idaho',
    platform: 1,
    platformData: null
  },
]
</script>
<style scoped lang="scss">
  .aiSearchPage{
    height: 100%;
    .jobSearch{
      min-height: 40%;
      .jobSearch-card{
        width: 100%;
        height: 100%;


      }
    }
    .main-job-container{
      min-height: 60%;
      .main-job-container-card{
        width: 100%;
        height: 100%;
      }
    }


    .select-inp{
      width: 100%;
      height: 10%;
      margin-top: 2rem;

      .search-btm{
        margin-left: 2rem;
      }
    }
    ::v-deep(.select-inp .el-select){
      width: 80% !important;
    }

    .example-pagination-block{
      margin-top: 1.5rem;
    }

  }
</style>