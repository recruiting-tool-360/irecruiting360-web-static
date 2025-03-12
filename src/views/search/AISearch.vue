<template>
    <div class="aiSearchPage">
      <el-backtop :right="100" :bottom="100" />
      <!--   搜索操作按钮   -->
      <div class="jobSearch" v-loading="searchAreaLoadingSwitch">
        <el-card class="jobSearch-card ">
          <!--     头部搜索     -->
          <el-row class="search-big-el-row">
            <!--     搜索框       -->
            <el-col class="search-el-col search-el-col-rt">
              <el-input v-model="searchState.selectValue"
                        placeholder="多个关键词空格隔开"
                        class="input-with-select">
                <!-- 右侧图标 -->
                <template #suffix>
                  <div style="height: 100%;display: flex;align-items: center">
                    <el-image  style="height: 16px;width: 16px;" src="/index/header/searchPage/search.svg"></el-image>
                  </div>
                </template>
              </el-input>
              <!--     搜索按钮       -->
              <el-button class="btm-color-white btm-bg-color" @click="searchJobListFn">搜索</el-button>
              <!--      重置筛选项      -->
              <el-button class="btm-color btm-border-blue-style" @click="resetSearchConnect">重置筛选项</el-button>
              <!--     保存搜索条件       -->
<!--              <el-button class="btm-color btm-border-blue-style" @click="searchConditionDialog=true">保存搜索条件</el-button>-->

              <!--     AI人才搜索       -->
<!--              <el-button class="btm-color-white btm-color btm-ai-btm-bg-color" @click="openChat('')">-->
<!--                <el-image :src="'/index/header/icons/aiBtm.svg'" style="margin-right: 8px"></el-image>-->
<!--                AI人才搜索</el-button>-->
            </el-col>
          </el-row>

          <!--     搜索条件区域     -->
          <div class="expandable" :style="{ height: searchAriaHeight ? contentHeight + 'px' : '0px' }" style="padding-bottom: 2px" ref="expandableDiv">
            <!--     工作年限与年龄     -->
            <el-row class="work-and-age-row" style="margin-top: 8px">
              <el-col class="work-and-age-el-col el-col-display-Style" :span="12">
                <el-text class="mx-1" style="min-width: 4rem">工作年限:</el-text>
              </el-col>
              <el-col class="work-and-age-el-col el-col-display-Style" :span="12">
                <el-text class="mx-1 el-text-min-width-style">年龄:</el-text>
              </el-col>
              <!--     工作年限       -->
              <el-col class="work-and-age-el-col el-col-display-Style" :span="12">
                <el-button class="btm-color btm-border-blue-style" size="small" @click="searchState.workElSliderValue = [-1,-1]">不限</el-button>
                <el-button class="" size="small" link @click="searchState.workElSliderValue = [1,3]">1-3</el-button>
                <el-button class="" size="small" link @click="searchState.workElSliderValue = [3,5]">3-5</el-button>
                <el-button class="" size="small" link @click="searchState.workElSliderValue = [5,10]">5-10</el-button>
                <div class="el-col-display-Style el-button-margin-left" style="justify-content: start;width: 100%">
                  <span class="demonstration">自定义:</span>
                  <el-slider class="el-button-margin-left" style="width: 60%" v-model="searchState.workElSliderValue" range :min="0" :max="11" :format-tooltip="formatWorkSize"/>
                </div>
                <!--      年龄      -->
              </el-col>
              <el-col class="work-and-age-el-col el-col-display-Style" :span="12">
                <el-button class="btm-color btm-border-blue-style " size="small"  @click="searchState.ageElSliderValue = [-1,-1]">不限</el-button>
                <el-button class="" size="small" link @click="searchState.ageElSliderValue = [20,30]">20-30</el-button>
                <el-button class="" size="small" link @click="searchState.ageElSliderValue = [30,40]">30-40</el-button>
                <el-button class="" size="small" link @click="searchState.ageElSliderValue = [40,50]">40-50</el-button>
                <div class="el-col-display-Style el-button-margin-left" style="justify-content: start;width: 100%">
                  <span class="demonstration">自定义:</span>
                  <el-slider class="el-button-margin-left" style="width: 60%" v-model="searchState.ageElSliderValue" range :min="15" :max="51" :format-tooltip="formatAgeSize"/>
                </div>
              </el-col>
            </el-row>

            <!--     学历：性别：当前薪资：期望薪资：当前工作地点：期望工作地点：     -->
            <el-row class="edu-and-sex-row" gutter="0">
              <!--     学历       -->
              <el-col class="edu-and-sex-el-col el-col-display-Style ">
                <!--     学历       -->
                <div class="edu-div group-div default-input-size">
                  <div style="width: 100%" class="text-inp-margin">
                    <el-text class="mx-1 el-text-min-width-style el-text-margin-rg-style el-text-ellipsis">学历:</el-text>
                  </div>
                  <el-select class="default-module-height" v-model="searchState.eduValue"
                             placeholder="学历"
                             no-data-text="无"
                             no-match-text="无"
                  >
                    <el-option
                        v-for="item in degreeOptionsVal"
                        :key="item.value"
                        :label="item.label"
                        :value="item.value"
                    />
                  </el-select>
                </div>
                <!--     性别       -->
                <div class="sex-div group-div default-input-size default-input-left-margin">
                  <div style="width: 100%" class="text-inp-margin">
                    <el-text class="mx-1 el-text-min-width-style el-text-margin-rg-style el-text-ellipsis">性别:</el-text>
                  </div>
                  <el-select class="default-module-height" v-model="searchState.sexValue"
                             placeholder="性别"
                             no-data-text="无"
                             no-match-text="无"
                  >
                    <el-option
                        v-for="item in genderOptionsVal"
                        :key="item.value"
                        :label="item.label"
                        :value="item.value"
                    />
                  </el-select>
                </div>
                <!--     当前薪资       -->
                <div class="current-salary group-div default-input-size default-input-left-margin">
                  <div style="width: 100%" class="text-inp-margin">
                    <el-text class="mx-1 el-text-min-width-style el-text-margin-rg-style el-text-ellipsis">当前薪资:</el-text>
                  </div>
                  <div style="display: flex;flex-wrap: nowrap;align-items: center">
                    <!--      开始        -->
                    <el-select class="default-module-height default-input-size"  v-model="searchState.currentSalaryStartValue"
                               placeholder="K"
                               no-data-text="无"
                               no-match-text="无"
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
                    <el-select class="default-module-height default-input-size"  v-model="searchState.currentSalaryEndValue"
                               placeholder="K"
                               no-data-text="无"
                               no-match-text="无"
                    >
                      <el-option
                          v-for="item in salaryConfig"
                          :key="item.value"
                          :label="item.label"
                          :value="item.value"
                      />
                    </el-select>
                  </div>

                </div>
                <!--     期望薪资       -->
                <div class="expected-salary group-div default-input-size default-input-left-margin">
                  <div style="width: 100%" class="text-inp-margin">
                    <el-text class="mx-1 el-text-min-width-style el-text-margin-rg-style el-text-ellipsis">期望薪资:</el-text>
                  </div>
                  <div style="display: flex;flex-wrap: nowrap;align-items: center">
                    <!--      开始        -->
                    <el-select class="default-module-height default-input-size" v-model="searchState.expectedSalaryStartValue"
                               placeholder="K"
                               no-data-text="无"
                               no-match-text="无"
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
                    <el-select class="default-module-height default-input-size" v-model="searchState.expectedSalaryEndValue"
                               placeholder="K"
                               no-data-text="无"
                               no-match-text="无"
                    >
                      <el-option
                          v-for="item in salaryConfig"
                          :key="item.value"
                          :label="item.label"
                          :value="item.value"
                      />
                    </el-select>
                  </div>
                </div>
                <!--     当前工作地点       -->
                <div class="Current-work group-div default-input-size default-input-left-margin">
                  <div style="width: 100%" class="text-inp-margin">
                    <el-text class="mx-1 el-text-min-width-style el-text-margin-rg-style el-text-ellipsis">当前工作地点:</el-text>
                  </div>
                  <el-cascader class="default-module-height"
                               v-model="searchState.currentWorkPlaceValue"
                               :options="citiesConfig"
                               placeholder="请选择城市"
                  />
                </div>
                <!--     期望工作地点       -->
                <div class="Desired-duty-station group-div default-input-size default-input-left-margin">
                  <div style="width: 100%" class="text-inp-margin">
                    <el-text class="mx-1 el-text-min-width-style el-text-margin-rg-style el-text-ellipsis">期望工作地点:</el-text>
                  </div>
                  <el-cascader class="default-module-height"
                               v-model="searchState.expectedWorkLocationValue"
                               :options="citiesConfig"
                               placeholder="请选择城市"
                  />
                </div>
              </el-col>
            </el-row>

            <!--     学校：：职位：：公司：：：专业：：求职状态：     -->
            <el-row class="company-and-school-row" gutter="0" style="margin-top: 8px">
              <el-col class="edu-and-sex-el-col el-col-display-Style ">
                <!--     院校要求       -->
                <div class="schoolLevel-status-div group-div default-input-size">
                  <div style="width: 100%" class="text-inp-margin">
                    <el-text class="mx-1 el-text-min-width-style el-text-margin-rg-style el-text-ellipsis">院校要求:</el-text>
                  </div>
                  <el-select class="default-module-height" v-model="searchState.educationLevel"
                             placeholder="院校要求"
                             no-data-text="无"
                             no-match-text="无"
                  >
                    <el-option
                        v-for="item in schoolLevelOptionsVal"
                        :key="item.value"
                        :label="item.label"
                        :value="item.value"
                    />
                  </el-select>
                </div>
                <!--     求职状态       -->
                <div class="job-seeking-status-div group-div default-input-size default-input-left-margin">
                  <div style="width: 100%" class="text-inp-margin">
                    <el-text class="mx-1 el-text-min-width-style el-text-margin-rg-style el-text-ellipsis">求职状态:</el-text>
                  </div>
                  <el-select class="default-module-height" v-model="searchState.jobSeekingStatusInpValue"
                             placeholder="求职状态"
                             no-data-text="无"
                             no-match-text="无"
                  >
                    <el-option
                        v-for="item in jobStatusOptionsVal"
                        :key="item.value"
                        :label="item.label"
                        :value="item.value"
                    />
                  </el-select>
                </div>
                <!--     职位       -->
                <div class="position-div group-div default-input-size default-input-left-margin">
                  <div style="width: 100%" class="text-inp-margin">
                    <el-text class="mx-1 el-text-min-width-style el-text-margin-rg-style el-text-ellipsis">职位:</el-text>
                  </div>
                  <el-input class="default-module-height" v-model="searchState.positionInpValue" placeholder="职位" />
                </div>
                <!--     公司       -->
                <div class="corporation-div group-div default-input-size default-input-left-margin">
                  <div style="width: 100%" class="text-inp-margin">
                    <el-text class="mx-1 el-text-min-width-style el-text-margin-rg-style el-text-ellipsis">公司:</el-text>
                  </div>
                  <el-input class="default-module-height" v-model="searchState.corporationInpValue" placeholder="公司" />
                </div>
                <!--     学校       -->
                <div class="school-div group-div default-input-size default-input-left-margin">
                  <div style="width: 100%" class="text-inp-margin">
                    <el-text class="mx-1 el-text-min-width-style el-text-margin-rg-style el-text-ellipsis">学校:</el-text>
                  </div>
                  <el-input class="default-module-height" v-model="searchState.schoolInpValue" placeholder="学校" />
                </div>
                <!--     专业       -->
                <div class="corporation-div group-div default-input-size default-input-left-margin">
                  <div style="width: 100%" class="text-inp-margin">
                    <el-text class="mx-1 el-text-min-width-style el-text-margin-rg-style el-text-ellipsis">专业:</el-text>
                  </div>
                  <el-input class="default-module-height" v-model="searchState.professionInpValue" placeholder="专业" />
                </div>
                <!--     空位置       -->
<!--                <div class="empty-div group-div default-input-size default-input-left-margin" style="visibility: hidden;">-->
<!--                  <div style="width: 100%" class="text-inp-margin">-->
<!--                    <el-text class="mx-1 el-text-min-width-style el-text-margin-rg-style"></el-text>-->
<!--                  </div>-->
<!--                </div>-->
              </el-col>
            </el-row>
          </div>

          <!--    按钮      -->
          <el-row class="height-btm-row" style="margin-top: 10px">
            <el-col :span="24" style="display: flex;justify-content: center;align-items: center;flex-wrap: nowrap">
              <div style="width: 100%;border-bottom: 1px dashed #b3bcc7"></div>
              <el-button :icon="searchAriaHeight?ArrowUp:ArrowDown" style="width: 24px;height: 24px;background-color: white;color: #2F70FA;margin: 0 4px" @click="searchAriaHeight=!searchAriaHeight"/>
              <div style="width: 100%;border-bottom: 1px dashed #b3bcc7"></div>
            </el-col>
          </el-row>
        <!--    AI推荐部分      -->
          <AIRecommendation
            v-if="searchState.criteria && Object.keys(searchState.criteria).length > 0"
            v-model:criteria="searchState.criteria"
            @clear="deleteAIConditionFlag=true"
            class="height-btm-row"
            style="margin-top: 12px"
          />
        </el-card>
      </div>

      <!--   列表部分   -->
      <div class="jobList">
        <el-card class="jobList-card">
          <el-row class="jobList-top-el-row" :gutter="0" style="border-bottom: 1px solid #E8E8E8;min-height: 3rem;margin-bottom: 15px">
            <el-col :xs="24" :sm="24" :md="24" :lg="24" :xl="24" class="jobList-top-el-col el-col-display-Style topBtm">
              <div class="menu-container">
                <el-menu
                    v-if="isMenuReady"
                    ref="menuRef"
                    ellipsis
                    class="el-menu-popper-demo"
                    mode="horizontal"
                    :class="menuWidthClass"
                    :popper-offset="16"
                    :default-active="jobInfoName"
                    @select="handleMenuSelect"
                >
                  <!--         渠道配置           -->
                  <template v-for="(channel, key) in allChannelStatus" :key="key">
                    <el-menu-item v-if="key==='ALL'||key==='Collect'" class="menuItems" :index="key" @click="clickMenu(channel)">{{channel.name}}({{channel.dataSize}})</el-menu-item>
                    <el-menu-item v-else-if="channel.disable" class="menuItems" :index="key" @click="clickMenu(channel)">
                      {{key==='BOSS'?'BOSS':channel.name}}({{channel.dataSize}})&nbsp;
                      <el-text v-if="channel.login" class="" type="success">已登录</el-text>
                      <el-text v-else-if="channel.loading" class="" type="warning">检测中...</el-text>
                      <el-text v-else class="" type="danger">未登录</el-text>
                    </el-menu-item>
                  </template>
                </el-menu>
              </div>

              <!--      操作列表        -->
              <div class="action-buttons">
                <div class="action-buttons-wrapper">
                  <el-checkbox v-model="unreadCheckBoxValue" class="unread-checkbox" label="仅显示未读" @click="clickUnreadCheck"/>
                  <div class="buttons-group">
                    <template v-for="(channel, key) in allChannelStatus" :key="key">
<!--                      <el-badge v-if="key===jobInfoName&&key!=='Collect'" :value="channel.name" class="item" type="warning">-->
                        <el-button :disabled="!channel.aiSort" :class="channel.aiSort?'btm-color-white ai-sort-btm':''" v-if="key===jobInfoName&&key!=='Collect'" class="action-button" @click="aiSortSearch(channel)">
                          渠道AI排序
                        </el-button>
<!--                      </el-badge>-->
                    </template>

                    <template v-for="(channel, index) in allThirdPartyChannelConfig" :key="index">
<!--                      <el-badge v-if="channel.key===jobInfoName&&channel.key!=='Collect'&&channel.pageSearch" :value="channel.name" class="item" color="green">-->
                        <el-button
                          :disabled="!channel.login"
                          v-if="channel.key===jobInfoName&&channel.key!=='Collect'"
                          color="rgb(31, 124, 255)"
                          class="action-button load-more-button"
                          @click="pageSearch(channel)"
                        >
                          渠道加载更多数据
                        </el-button>
<!--                      </el-badge>-->
                    </template>

                    <el-button class="btm-color action-button settings-button" @click="channelDialogFlag=true">渠道设置</el-button>
                  </div>
                </div>
              </div>
            </el-col>
          </el-row>
          <!--    不同模版      -->
          <JobInfo ref="jobInfoRef" v-show="jobInfoName==='ALL'" v-model:third-party-channel-config="allThirdPartyChannelConfig" :on-loding-open="loadingOpen" :on-loding-close="loadingClose" v-model:search-state-criteria="searchState.criteria"></JobInfo>
          <BossJobInfo ref="bossJobInfoRef" v-show="jobInfoName==='BOSS'" :on-loding-open="loadingOpen" :on-loding-close="loadingClose" v-model:search-state-criteria="searchState.criteria"></BossJobInfo>
          <ZHILIANJobInfo  ref="zhiLianInfoRef" v-show="jobInfoName==='ZHILIAN'" :on-loding-open="loadingOpen" :on-loding-close="loadingClose" v-model:search-state-criteria="searchState.criteria"></ZHILIANJobInfo>
<!--          <LIEPINJobInfo  ref="liePinInfoRef" v-show="jobInfoName==='LIEPIN'" :on-loding-open="loadingOpen" :on-loding-close="loadingClose" v-model:search-state-criteria="searchState.criteria"></LIEPINJobInfo>-->
          <JOB51  ref="job51InfoRef" v-show="jobInfoName==='JOB51'" :on-loding-open="loadingOpen" :on-loding-close="loadingClose" v-model:search-state-criteria="searchState.criteria"></JOB51>
          <CollectJobInfo ref="collectInfoRef" v-show="jobInfoName==='Collect'" v-model:third-party-channel-config="allThirdPartyChannelConfig" :on-loding-open="loadingOpen" :on-loding-close="loadingClose"></CollectJobInfo>
        </el-card>
      </div>
      <!--   渠道配置   -->
      <ChannelConfig v-model:dialogVisible="channelDialogFlag" :change-close-status="()=>channelDialogFlag=false" :on-confirm="onChannelConfig"></ChannelConfig>
      <!--  插件安装提示    -->
      <PluginInfo></PluginInfo>
      <!--   保存搜索条件   -->
      <SearchCondition v-model:dialogVisible="searchConditionDialog" :change-close-status="()=>searchConditionDialog=false" :on-condition-request="getSearchConditionRequest"></SearchCondition>
      <!--  删除ai推荐  -->
      <DialogTemplate v-if="deleteAIConditionFlag" v-model:dialogVisible="deleteAIConditionFlag" :change-close-status="()=>deleteAIConditionFlag=false" :on-confirm="deleteALlAICondition" :context="'确认删除AI推荐搜索条件!'"></DialogTemplate>
    </div>
</template>
<script setup>
import {computed, onMounted, ref, watch, defineExpose, nextTick} from 'vue'
import {ArrowUp,ArrowDown,Close,MagicStick} from '@element-plus/icons-vue'
import {convertSearchState, createSearchState} from "@/views/search/dto/request/SearchStateConfig";
import {convertSearchConditionRequest} from "@/domain/request/SaveSearchRequest";
import {
  degreeOptions,
  genderOptions,
  salaryConfig,
  citiesConfig,
  jobStatusOptions, schoolLevelOptions
} from "@/views/search/dto/SearchPageConfig";
import {getSearchConditionDefaultDicts, saveCondition} from "@/api/search/SearchApi";
import {ElLoading, ElMessage} from 'element-plus';
import {pluginResultProcessor} from "@/components/verifyes/PluginProcessor";
import {useStore} from "vuex";
import JobInfo from "@/views/search/components/JobInfo.vue";
import BossJobInfo from "@/views/search/components/BossJobInfo.vue";
import ZHILIANJobInfo from "@/views/search/components/ZHILIANJobInfo.vue";
import JOB51 from "@/views/search/components/JOB51.vue";
import CollectJobInfo from "@/views/search/components/CollectJobInfo.vue";
import PluginInfo from "@/views/search/components/PluginInfo.vue";
import SearchCondition from "@/views/search/searchCondition/SearchCondition.vue";
import ChannelConfig from "@/views/search/channel/ChannelConfig.vue";
import _ from "lodash";
import DialogTemplate from "@/components/dialog/DialogTemplate.vue";
import {setDefaultPluginRules} from "@/components/BasePluginManager";
import AIRecommendation from "@/views/search/components/AIRecommendation.vue";
import {debounce} from 'lodash-es';

const store = useStore();
//用户信息
const userInfo = computed(() => store.getters.getUserInfo);
//搜索id
const searchConditionId = computed(() => store.getters.getSearchConditionId);
//渠道历史查询参数
const allSearchChannelConditionRequestData = computed(() => store.getters.getSearchChannelConditionRequestData);
const unreadCheckBoxValue = ref(false);
//搜索区域loading
const searchAreaLoadingSwitch = ref(false);
//固定条件搜索属性
let searchStateConfig =createSearchState();
const searchState = ref(searchStateConfig);
//加载 loading
let loadingBig ;
//结果集渲染模版名称
const jobInfoName = ref("ALL");
//ref
const jobInfoRef = ref(null);
const bossJobInfoRef = ref(null);
const zhiLianInfoRef = ref(null);
// const liePinInfoRef = ref(null);
const job51InfoRef = ref(null);
const collectInfoRef = ref(null);
//所有渠道配置
const allChannelStatus = computed(() => store.getters.getChannelConf);
//所有第三方渠道
const allThirdPartyChannelConfig = computed(() => {
  return Object.entries(allChannelStatus.value)
      .filter(([key, channel]) => !(key==='ALL'||key==='Collect'))
      .map(([key, channel]) => ({...channel })); // 返回过滤后的对象
});
//渠道对话框开关
const channelDialogFlag = ref(false);
//ai对话框开关
const aiChatDialogFlag = ref(false);
//搜索收缩按钮开关
const expandableDiv = ref(null);
const contentHeight =ref(0);
const searchAriaHeight = ref(true);
//保存搜索条件
const searchConditionDialog = ref(false);
//清除AI搜索条件
const deleteAIConditionFlag = ref(false);
//配置信息
//性别
const genderOptionsVal = ref(genderOptions);
//学校类型
const schoolLevelOptionsVal = ref(schoolLevelOptions);
//在职状态
const jobStatusOptionsVal = ref(jobStatusOptions);
//学历状态
const degreeOptionsVal = ref(degreeOptions);

const currentChatId = ref('')

//控制菜单渲染的状态
const isMenuReady = ref(false)
const menuRef = ref(null)

//onMounted 生命周期函数
onMounted(async () => {
  //搜索区域初始高度
  if (expandableDiv.value) {
    contentHeight.value = expandableDiv.value.scrollHeight;
  }
  //初始化渠道ref
  store.commit('changeChannelCardInfoRef',{key:"ALL",value:jobInfoRef.value});
  store.commit('changeChannelCardInfoRef',{key:"BOSS",value:bossJobInfoRef.value});
  store.commit('changeChannelCardInfoRef',{key:"ZHILIAN",value:zhiLianInfoRef.value});
  // store.commit('changeChannelCardInfoRef',{key:"LIEPIN",value:liePinInfoRef.value});
  store.commit('changeChannelCardInfoRef',{key:"JOB51",value:job51InfoRef.value});
  store.commit('changeChannelCardInfoRef',{key:"Collect",value:collectInfoRef.value});
  //设置插件规则
  let ruleConfig = await setDefaultPluginRules();
  if(!pluginResultProcessor(ruleConfig)){
    ElMessage.error('插件异常，请联系管理员');
    return;
  }
  // console.log("ruleConfig:",ruleConfig)
  //加载登陆状态
  allThirdPartyChannelConfig.value.forEach((item)=>{
    item.cardInfoRef.userLoginStatus();
  })
  // bossJobInfoRef.value.userLoginStatus();
  // zhiLianInfoRef.value.userLoginStatus();

  // 在DOM更新后延迟一些时间再显示菜单
  nextTick(() => {
    setTimeout(() => {
      isMenuReady.value = true

      // 在菜单渲染后再次使用nextTick确保尺寸稳定
      nextTick(() => {
        if (menuRef.value) {
          // 使用MutationObserver替代ResizeObserver监听菜单变化
          const observer = new MutationObserver(
            debounce(() => {
              // 菜单内容变化时的处理逻辑
              console.log('Menu content updated')
            }, 200)
          )

          observer.observe(menuRef.value.$el, {
            childList: true,
            subtree: true,
            attributes: true
          })
        }
      })
    }, 50) // 延迟50ms，避免初始渲染的计算冲突
  })
})

// 加载效果
const handleMenuSelect = async (index) => {
  loadingOpen();
  try {
    // 模拟数据加载
    await new Promise((resolve) => setTimeout(resolve, 150));
  } finally {
    loadingClose();
  }
};

//点击tab事件
const clickMenu = (obj) => {
  jobInfoName.value=obj.key
}
//仅显示已读
const clickUnreadCheck = () => {
  store.commit('changeUnreadCheckBoxV',!unreadCheckBoxValue.value);
  if (allSearchChannelConditionRequestData.value){
    let newVar = allThirdPartyChannelConfig.value.filter((channel) => channel.disable&&channel.login).map((item) => (item))||[];
    newVar.push(allChannelStatus.value['ALL']);
    newVar.forEach((item) => {
      item.cardInfoRef.handleCurrentChange(1);
    });
    // allChannelStatus.value['ALL'].cardInfoRef.handleCurrentChange(1);
  }
}

//加载所有配置
const loadingAllSearchConfig = async () => {
  try {
    const {data} = await getSearchConditionDefaultDicts();
    if (data) {
      genderOptionsVal.value = data.GENDER ? data.GENDER : genderOptions;
      schoolLevelOptionsVal.value = data.EDUCATION_LEVEL ? data.EDUCATION_LEVEL : schoolLevelOptions;
      jobStatusOptionsVal.value = data.AVAILABILITY_STATUS ? data.AVAILABILITY_STATUS : jobStatusOptions;
      degreeOptionsVal.value = data.DEGREE ? data.DEGREE : degreeOptions;
    }
  } catch (e) {
    ElMessage.error('后端服务异常，请联系管理员');
  }
}
loadingAllSearchConfig();

//渠道确认回调函数
const onChannelConfig = (keys) => {
  if(keys&&keys.length>0&&jobInfoName.value!=='ALL'&&jobInfoName.value!=='Collect'&&keys.indexOf(jobInfoName.value)>=0){
    jobInfoName.value='ALL';
  }
  channelDialogFlag.value = false;
}

//清除所有ai推荐
const deleteALlAICondition = async () => {
  searchState.value.criteria = null;
  deleteAIConditionFlag.value = false;
  searchAreaLoadingSwitch.value = true;
  try {
    // 模拟数据加载
    await new Promise((resolve) => setTimeout(resolve, 250));
  } catch (e) {
    console.log(e)
  }
  searchAreaLoadingSwitch.value = false;
}

//ai 排序
const aiSortSearch = (channel) => {
  if(channel&&channel.cardInfoRef){
    channel.cardInfoRef.handleCurrentChange(1);
  }
}


/**
 * 搜索
 * 保存搜索条件，
 * 接受渠道搜索条件，
 * 查询渠道简历列表
 * 同步列表
 * 异步同步数据（队列）
 * 渲染页面
 */
const searchJobListFn = async () => {
  try {
    loadingOpen();
    await searchJobList();
  }catch (e){
    console.log(e);
    loadingClose();
  }
  loadingClose();
}
/**
 * 搜索
 * 保存搜索条件，
 * 接受渠道搜索条件，
 * 查询渠道简历列表
 * 同步列表
 * 异步同步数据（队列）
 * 渲染页面
 */
const searchJobList = async () => {
  let searchConditionRequest = getSearchConditionRequest();
  searchConditionRequest.userId=userInfo.value.id;
  //搜索条件
  let searchRequestData;
  try {
    const {data} = await saveCondition(searchConditionRequest);
    data.config=[];
    searchRequestData = data;
    if(data.channelSearchConditions){
      data.channelSearchConditions.forEach((item)=>{
        data.config.push({
          channelDataTotal:0,
          channelPage:0,
          channelCountSize:0,
          totalPage:0,
          channelKey:item.channel
        })
      })
    }
    store.commit('changeSearchChannelConditionRequestData',data);
    store.commit('changeSearchConditionId',searchRequestData.id);
  }catch (e){
    ElMessage.error('后端服务异常，请联系管理员');
    console.log(e);
    return;
  }
  try {
    // 使用 Promise.all 等待两个方法并行执行完毕
    await Promise.all([
      bossJobInfoRef.value.channelSearch(searchRequestData),
      zhiLianInfoRef.value.channelSearch(searchRequestData),
      // liePinInfoRef.value.channelSearch(searchRequestData),
      job51InfoRef.value.channelSearch(searchRequestData),
    ]);

    // 两个方法执行完毕后，执行 JobInfo 的逻辑
    if (jobInfoRef.value) {
      // console.log("全渠道执行完了")
      await jobInfoRef.value.search(1);
      console.log("全渠道执行完了")
      // jobInfoRef.value.channelSearch(searchRequestData);
    }
  } catch (error) {
    console.error('Error during search:', error);
  }
}

const pageSearch = async (channel) => {
  if (!channel.login) {
    ElMessage.warning(channel.name + '渠道没有登陆');
    return;
  }
  if (!allSearchChannelConditionRequestData.value) {
    ElMessage.warning('请先搜索，再加载' + channel.name + '渠道更多数据');
    return;
  }
  let channelSearchCondition = allSearchChannelConditionRequestData.value.channelSearchConditions.find((item) => item.channel === channel.key);
  if (!channelSearchCondition && channelSearchCondition.conditionData) {
    ElMessage.warning(channel.name + '渠道无法查到搜索条件');
    return;
  }
  let channelSearchConfig = allSearchChannelConditionRequestData.value.config.find((item) => item.channelKey === channel.key);
  if (!channelSearchConfig) {
    ElMessage.warning(channel.name + '渠道无法查到分页搜索条件');
    return;
  }
  const newChannelPage = channelSearchConfig.channelPage + 1;
  if (newChannelPage > channelSearchConfig.totalPage) {
    ElMessage.warning(channel.name + '渠道没有更多的数据');
    return;
  }
  try {
    loadingOpen();
    await Promise.all([
      channel.cardInfoRef.channelSearch(allSearchChannelConditionRequestData.value, newChannelPage)
    ]);
    await jobInfoRef.value.search(1);
  }catch (e){
    console.log(e);
    loadingClose();
  }
  loadingClose();
}

//获取搜索条件
const getSearchConditionRequest = () => {
  //处理工作年限边界
  const workElSliderValue = _.cloneDeep(searchState.value.workElSliderValue);
  workElSliderValue[0] = (workElSliderValue[0] <=0||workElSliderValue[0] >10) ? workElSliderValue[0] = -1 : workElSliderValue[0];
  workElSliderValue[1] = (workElSliderValue[1] <=0||workElSliderValue[1] >10) ? workElSliderValue[1] = -1 : workElSliderValue[1];
  //处理年龄边界
  const ageElSliderValue = _.cloneDeep(searchState.value.ageElSliderValue);
  ageElSliderValue[0] = (ageElSliderValue[0] <=15||ageElSliderValue[0] >50) ? ageElSliderValue[0] = -1 : ageElSliderValue[0];
  ageElSliderValue[1] = (ageElSliderValue[1] <=15||ageElSliderValue[1] >50) ? ageElSliderValue[1] = -1 : ageElSliderValue[1];
  //用户id
  // searchState.value.userId=1;
  //处理其他参数
  let searchConditionRequest = convertSearchConditionRequest(searchState.value);
  searchConditionRequest.searchChannels = allThirdPartyChannelConfig.value.filter((channel) => channel.disable&&channel.login).map((item) => (item.name))||[];
  searchConditionRequest.experienceFrom = workElSliderValue[0];
  searchConditionRequest.experienceTo = workElSliderValue[1];
  searchConditionRequest.ageFrom = ageElSliderValue[0];
  searchConditionRequest.ageTo = ageElSliderValue[1];
  return searchConditionRequest;
}

const formatWorkSize =(value)=>{
  if(value<=0){
    return "不限";
  }else if(value>10){
    return '10年以上';
  }else{
    return value+'年';
  }
}

const formatAgeSize =(value)=>{
  if(value<=15){
    return "不限";
  }else if(value>50){
    return '50岁以上';
  }else{
    return value+'岁';
  }
}

//打开加载 loding
const loadingOpen = () => {
  loadingBig = ElLoading.service({
    lock: true,
    text: '数据加载中'
  })
}
//关闭加载 loding
const loadingClose = ()=>{
  loadingBig.close();
}

/**
 * 重置搜索条件
 */
const resetSearchConnect = ()=>{
  searchState.value = createSearchState();
}

//替换搜索条件
function replaceSearchConditionRequest(data, triggerSearch = false) {
  searchAreaLoadingSwitch.value = true;
  // try {
  //   // 模拟数据加载
  //   await new Promise((resolve) => setTimeout(resolve, 150));
  // } catch (e) {
  //   console.log(e)
  // }
  let convertSearchStateVal = convertSearchState(data);
  //处理工作年限边界
  const workElSliderValue = convertSearchStateVal.workElSliderValue;
  workElSliderValue[0] = (workElSliderValue[0] <= 0) ? 0 : workElSliderValue[0];
  workElSliderValue[1] = (workElSliderValue[1] <= 0) ? 11 : workElSliderValue[1];
  convertSearchStateVal.workElSliderValue = workElSliderValue;
  //处理年龄边界
  const ageElSliderValue = convertSearchStateVal.ageElSliderValue;
  ageElSliderValue[0] = (ageElSliderValue[0] <= 15) ? 15 : ageElSliderValue[0];
  ageElSliderValue[1] = (ageElSliderValue[1] <= 15) ? 51 : ageElSliderValue[1];
  convertSearchStateVal.ageElSliderValue = ageElSliderValue;
  searchState.value = convertSearchStateVal;
  searchAreaLoadingSwitch.value = false;

  // 如果triggerSearch为true，自动触发搜索
  if (triggerSearch) {
    searchJobListFn();
  }
}

//监听搜索体
// watch(() => searchConditionRequestData.value, async (newValue) => {
//   // console.log(newValue)
//   if(newValue){
//     searchAreaLoadingSwitch.value = true;
//     try {
//       // 模拟数据加载
//       await new Promise((resolve) => setTimeout(resolve, 150));
//     } catch (e){
//       console.log(e)
//     }
//     let convertSearchStateVal = convertSearchState(newValue);
//     //处理工作年限边界
//     const workElSliderValue = convertSearchStateVal.workElSliderValue;
//     workElSliderValue[0] = (workElSliderValue[0] <=0) ? 0 : workElSliderValue[0];
//     workElSliderValue[1] = (workElSliderValue[1] <=0) ? 11 : workElSliderValue[1];
//     convertSearchStateVal.workElSliderValue = workElSliderValue;
//     //处理年龄边界
//     const ageElSliderValue = convertSearchStateVal.ageElSliderValue;
//     ageElSliderValue[0] = (ageElSliderValue[0] <=15) ? 15: ageElSliderValue[0];
//     ageElSliderValue[1] = (ageElSliderValue[1] <=15) ? 51: ageElSliderValue[1];
//     convertSearchStateVal.ageElSliderValue = ageElSliderValue;
//     searchState.value = convertSearchStateVal;
//     searchAreaLoadingSwitch.value = false;
//     store.commit('changeSearchConditionRequestData',null);
//     await searchJobListFn();
//   }
// });

const openChat = (chatId = '') => {
  console.log('Opening chat with ID:', chatId)
  currentChatId.value = chatId
  aiChatDialogFlag.value = true
}

const handleCloseChat = () => {
  aiChatDialogFlag.value = false
  currentChatId.value = ''
}

// 暴露属性和方法给父组件
defineExpose({
  aiChatDialogFlag,
  openChat,
  replaceSearchConditionRequest
})

// 添加菜单宽度的计算属性
const menuWidthClass = computed(() => {
  return (jobInfoName.value === 'ALL' || jobInfoName.value === 'Collect')
    ? 'wide-menu'
    : 'narrow-menu'
})

</script>
<style scoped lang="scss">
  .aiSearchPage{
    min-width: 550px;
    height: 100%;
    .jobSearch{
      min-height: 20%;
      .jobSearch-card{
        width: 100%;
        padding: 16px;

        ::v-deep(.el-card__body){
          padding: 0 0 !important;
        }

        .input-with-select{
          height: 30px;
        }

        .search-el-col-rt{
          display: flex;
          flex-wrap: nowrap;
          justify-content: space-between;

          .el-button{
            height: 30px;
            margin-left: 8px;
          }
        }

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

        .edu-and-sex-el-col{
          display: flex;
          justify-content: space-between;

          .text-inp-margin{
            margin-bottom: 3px;
          }
        }

        .recommended{
          font-size: 12px;
          height: 22px;
          padding: 8px 6px;
          margin-left: 5px;
          background-color: #F5F5F5;
        }
        .recommended-btm{
          color: #1F7CFF;
          font-size: 14px;
          //font-weight: 500;

          :hover{
            opacity: 0.6;
          }
        }
        .el-text-ellipsis{
          display: inline-block; /* 确保是块级或内联块级元素 */
          max-width: 88px; /* 根据需要设置合适的宽度 */
          white-space: nowrap; /* 防止内容换行 */
          overflow: hidden; /* 隐藏超出范围的内容 */
          text-overflow: ellipsis; /* 设置省略号 */
        }
      }
    }
    .jobList{
      margin-top: 8px;
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
        .topBtm{
          justify-content: space-between;
          //大元素配置
          ::v-deep(.el-descriptions__table tbody tr){
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
          }
          .top-div{

            .el-segmented {
              --el-segmented-item-selected-color: rgba(31, 124, 255, 1);
              --el-segmented-item-selected-bg-color: rgba(31, 124, 255, 0.06);
              --el-segmented-bg-color: rgba(215, 203, 203, 0);
              --el-segmented-item-hover-bg-color: rgba(147, 255, 31, 0);
              --el-segmented-item-hover-color:rgba(31, 124, 255, 1);
              --el-segmented-item-active-bg-color: rgba(31, 124, 255, 0.06);
              font-size: 14px;
            }
          }
        }

        .el-menu-popper-demo{
          border-bottom: none;
          height: 32px;

          .menuItems{
            --el-menu-active-color:rgba(31, 124, 255, 1);
            --el-menu-hover-bg-color: #f5f6f9;
            --el-menu-text-color: none;
            border:none;
            font-size:14px;
            font-weight:500;
            height: 32px;
            color: #626675;

            :focus{
              background-color:#ffffff00;
            }
          }
        }

        .ai-sort-btm{
          //background: linear-gradient(208deg, rgb(255 192 160) 0%, rgb(219 255 119) 11.71%, rgb(252 82 245) 49.68%, rgb(198 84 255) 74.23%, rgb(246 211 60) 90.26%, rgb(217 255 116) 100%) !important;
          //background:linear-gradient(208deg, rgb(84 128 252) 0%, rgb(119 246 255) 11.71%, rgb(178 178 178) 49.68%, rgb(112 123 253) 74.23%, rgb(64 212 243) 90.26%, rgb(105 125 253) 100%) !important;
          background: linear-gradient(248deg, #C7A0FF 0%, #8777FF 11.71%, #5280FC 49.68%, #54A4FF 74.23%, #3CD1F6 90.26%, #74FFCD 100%) !important;
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
<style scoped lang="scss">
.expandable {
  overflow: hidden; /* 防止内容溢出 */
  height: 0; /* 默认高度为 0 */
  transition: height 0.3s ease; /* 平滑过渡效果 */
}

.jobList-top-el-row {
  flex-wrap: wrap;
}

.jobList-top-el-col {
  flex-direction: column;
  
  @media (min-width: 768px) {
    flex-direction: row;
  }
}

.menu-container {
  width: 100%;
}

.el-menu-popper-demo {
  min-width: 300px;
  width: 100%;
  max-width: 100%;
}

.action-buttons {
  width: 100%;
  margin-top: 8px;
  
  @media (min-width: 768px) {
    margin-top: 0;
  }
}

.action-buttons-wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;
  
  @media (min-width: 768px) {
    flex-direction: row;
    justify-content: flex-end;
  }
}

.unread-checkbox {
  height: 32px;
  font-size: 13px;
  margin-right: 16px;
  margin-bottom: 8px;
  
  @media (min-width: 768px) {
    margin-bottom: 0;
  }
}

.buttons-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
  
  @media (min-width: 768px) {
    width: auto;
    justify-content: flex-end;
  }
}

.action-button {
  height: 32px;
}

.load-more-button {
  margin-left: 0;
  
  @media (min-width: 768px) {
    margin-left: 16px;
  }
}

.settings-button {
  margin-left: 0;
  
  @media (min-width: 768px) {
    margin-left: 16px;
  }
}

// 使用固定的类替代动态内联样式
.wide-menu {
  min-width: 755px !important;
}

.narrow-menu {
  min-width: 585px !important;
}

// 菜单占位符样式
.menu-placeholder {
  height: 32px;
  background-color: transparent;
}

// 使用固定的类替代动态内联样式
.wide-menu {
  min-width: 755px !important;
  width: 755px !important; // 添加固定宽度
}

.narrow-menu {
  min-width: 585px !important;
  width: 585px !important; // 添加固定宽度
}

// 添加更强的样式覆盖
.el-menu-popper-demo {
  transition: none !important; // 禁用过渡效果
  overflow: visible !important;
}
</style>