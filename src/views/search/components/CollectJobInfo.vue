<template>
  <div class="allBobContainer">
    <template v-if="jobALlData===undefined||jobALlData===null||jobALlData.length===0">
      <el-empty description="没有收藏数据" />
    </template>
    <!--  列表信息  -->
    <ResumeListInfo v-model:list-data="jobALlData" :click-list-info-fn="clickListInfo"></ResumeListInfo>

    <BossDetial ref="bossDetialRef" v-model:dialogFlag="geekInfoDialog" v-model:resume-id="resumeId" :change-close-status="()=>{geekInfoDialog=false;resumeId=''}" ></BossDetial>
    <!--  分页信息  -->
    <div class="pageConfig">
      <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10,30,60,100]"
          background
          layout="prev, pager, next,sizes"
          :total="totalNum"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
      />
    </div>
  </div>
</template>

<script setup>
import {ref, computed, watch, defineExpose, onMounted} from "vue";
import {useStore} from "vuex";
import {createPageSearchRequest} from "@/views/search/dto/request/PageSearchConfig";
import {getGeekDetail, querySearch} from "@/api/search/SearchApi";
import {channelOptions} from "@/views/search/dto/SearchPageConfig";
import BossDetial from "@/views/search/components/BossDetial.vue";
import {ElMessage} from "element-plus";
import {markResumeBlindReadStatus} from "@/api/jobList/JobListApi";
import {pluginAllUrls} from "@/components/PluginRequestManager";
import qs from "qs";
import ResumeListInfo from "@/views/search/components/ResumeListInfo.vue";

//store
const store = useStore();
// 通过 defineProps 定义 props
const props = defineProps({
  onLodingOpen: Function,
  onLodingClose: Function,
  thirdPartyChannelConfig:Array
});
const channelKey = "Collect";
const jobALlData =computed(()=>store.getters.getChannelALlData(channelKey));
const channelConfig =computed(()=>store.getters.getChannelConfByChannel(channelKey));
//当前页码数
const currentPage = ref(1);
//当前页显示条目数
const pageSize = ref(10);
//总分页数
const totalNum =ref(10);
//搜索id
const searchConditionId = computed(() => store.getters.getSearchConditionId);
//用户详细信息
const geekInfoDialog = ref(false);
//bossDetialRef
const bossDetialRef = ref(null);


//初始化所有ref
onMounted(async ()=>{
  handleCurrentChange(1);
});

const clickListInfo = async (userInfo) => {
  resumeId.value = userInfo.id;
  geekInfoDialog.value = true;
  //设置为已读
  try {
    let {data} = await markResumeBlindReadStatus([userInfo.id],true);
    userInfo.isRead = 1;
  }catch (e){
    console.log(e);
    ElMessage.error('服务异常，请联系管理员！');
  }
}

const openDetail = (listInfo)=>{
}

//分页设置触发时
const handleSizeChange = (value) => {
  handleCurrentChange(1);
}
//分页设置触发时
const handleCurrentChange = (value) => {
  if(props.onLodingOpen){
    props.onLodingOpen();
  }
  try {
    search(value);
  }catch (e){
    console.log(e)
  }
  if(props.onLodingClose){
    props.onLodingClose();
  }
}

//查询列表信息
const search = async (page) => {
  currentPage.value = page;
  let pageSearchRequest = createPageSearchRequest();
  pageSearchRequest.offset=page;
  pageSearchRequest.size =pageSize.value;
  pageSearchRequest.channel = channelConfig.value.desc;
  pageSearchRequest.searchConditionId = searchConditionId.value;
  let listResponse = null;
  try {
    listResponse = await querySearch(pageSearchRequest);
  } catch (e) {
    console.log(e)
    ElMessage.error('服务异常，请联系管理员！');
  }
  if(listResponse){
    totalNum.value = listResponse.data.totalCount;
  }else{
    totalNum.value = 0;
  }
  if(listResponse&&listResponse.data&&listResponse.data.data){
    // jobALlData.value=listResponse.data.data;
    let scoreList = listResponse.data.data.map(item=>item.id);
    store.commit('setChannelData',{key:channelKey,value:listResponse.data.data});
    listResponse.data.data.forEach(item=>{
      store.commit('addScoreConfigToQueue',{id:item.id,count:0});
    });
  }else{
    // jobALlData.value=[];
    store.commit('setChannelData',{key:channelKey,value:[]})
  }
  store.commit('changeChannelConfDataSize',{key:channelKey,value:totalNum.value});
}


// 使用 expose 暴露方法
defineExpose({
  search,
});

// 如果 props 的值可能会变化，使用 watch 来同步更新 localValue
// watch(() => props.largeData, (newValue) => {
//   jobALlData.value = newValue;
// });
</script>

<style scoped lang="scss">

.pageConfig{
  border-top:1px solid #E8E8E8;
  padding: 8px 16px;
  display: flex;
  justify-content: end;

}

</style>