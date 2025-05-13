<template>
  <div class="q-py-xs q-px-xs">
    <q-card flat bordered class="search-filter-card q-px-xs">
      <!-- 搜索框 -->
      <q-card-section class="flex items-start q-pb-none">
        <!-- 搜索框 -->
        <q-select
          v-model="searchState.selectValue"
          use-input
          hide-selected
          fill-input
          hide-dropdown-icon
          input-debounce="0"
          :options="filteredOptions"
          @filter="filterHotSearches"
          @input-value="updateInputValue"
          class="full-width q-pr-md"
          placeholder="多个关键字空格隔开"
          style="max-width: 63%;height: 27px; min-height: 0;"
          :dense="true"
          @focus="loadHotSearches"
        >
          <template v-slot:append>
            <q-icon class="q-mt-sm" name="search" color="primary" @click="$emit('search')"/>
          </template>

          <!-- 自定义选项模板 -->
          <template v-slot:option="{ itemProps, itemEvents, opt }">
            <q-item
              class="white"
              v-bind="itemProps"
              v-on="itemEvents"
            >
              <!-- <q-item-section avatar class="q-pr-none">
                <q-icon class="q-pr-none" name="local_fire_department" color="primary" />
              </q-item-section> -->

              <q-item-section>
                <q-item-label>{{ opt }}</q-item-label>
                <q-item-label caption>热门搜索</q-item-label>
              </q-item-section>

              <q-item-section side>
                <q-icon name="local_fire_department"  size="xs" color="primary" />
              </q-item-section>
              <q-item-section side>
                <q-icon name="search" color="primary" size="xs" />
              </q-item-section>
            </q-item>
          </template>

          <template v-slot:no-option>
            <q-item v-if="isLoadingHotSearches">
              <q-item-section>
                <q-spinner color="primary" size="sm" class="q-mr-sm" />
                <q-item-label>加载中...</q-item-label>
              </q-item-section>
            </q-item>
            <q-item v-else>
              <q-item-section class="text-grey">
                暂无热门搜索
              </q-item-section>
            </q-item>
          </template>
        </q-select>
        <!-- 搜索按钮 -->
        <div class="flex no-wrap" style="justify-content: space-between;padding-top: 10px;padding-bottom: 10px" >
          <q-btn color="primary" label="搜索" @click="$emit('search')" class="q-mr-xs" style="height: 30px; min-height: 0;" />
          <q-btn flat color="primary" icon="edit_note" label="修改AI标签" @click="openAllTagsEditor" style="height: 30px; min-height: 0;">
            <q-tooltip>
              一键编辑所有类型标签（每种类型最多5个）
            </q-tooltip>
          </q-btn>
          <q-btn outline  color="primary" flat @click="$emit('reset')" class="" style="height: 30px; min-height: 0;">
            <q-icon name="refresh" class="q-mr-xs" size="xs" />
            重置筛选
            <q-tooltip>重置筛选</q-tooltip>
          </q-btn>
          <q-btn color="primary" flat @click="toggleFilterPanel" class="q-mr-xs" style="height: 30px; min-height: 0;">
            <q-icon name="filter_list" class="q-mr-xs" size="xs" />
<!--            <q-icon :name="showFilterPanel ? 'expand_less' : 'expand_more'" right size="xs" />-->
            筛选
<!--            <q-icon :name="showFilterPanel ? 'expand_less' : 'expand_more'" right size="xs" />-->
          </q-btn>
        </div>
      </q-card-section>

      <!-- 工作时间与年龄 -->
      <q-slide-transition>
        <div v-show="showFilterPanel">
          <q-card-section class="flex items-start q-mt-none q-pb-none">
            <div class="row no-wrap">
              <!-- 工作时间范围选择 -->
              <div class="col-12">
                <div class="text-body2 text-grey-8 q-mb-xs">工作年限</div>
                <div class="flex items-center no-wrap">
                  <q-btn size="sm" outline color="primary" label="不限" @click="searchState.workElSliderValue.min = -1; searchState.workElSliderValue.max = -1" />
                  <q-btn size="md" flat color="primary" label="1-3" @click="searchState.workElSliderValue.min = 1; searchState.workElSliderValue.max = 3" class="q-ml-xs q-pa-sm" />
                  <q-btn size="md" flat color="primary" label="3-5" @click="searchState.workElSliderValue.min = 3; searchState.workElSliderValue.max = 5" class="q-ml-xs q-pa-sm" />
                  <q-btn size="md" flat color="primary" label="5-10" @click="searchState.workElSliderValue.min = 5; searchState.workElSliderValue.max = 10" class="q-mx-xs q-pa-sm " />
                  <div class="q-mt-sm flex no-wrap" style="width: 50%">
                    <span class="text-caption q-mr-sm full-width" style="max-width: 50px">自定义:</span>
                    <q-range
                      v-model="searchState.workElSliderValue"
                      :min="0"
                      :max="11"
                      label
                      label-always
                      style="width: 100%"
                      class="q-ml-sm"
                      :left-label-value="formatWorkSize(searchState.workElSliderValue.min)"
                      :right-label-value="formatWorkSize(searchState.workElSliderValue.max)"
                    />
                  </div>
                </div>
              </div>

              <!-- 年龄范围选择 -->
              <div class="col-12">
                <div class="text-body2 text-grey-8 q-mb-xs">年龄</div>
                <div class="flex items-center no-wrap">
                  <q-btn size="sm" outline color="primary" label="不限" @click="searchState.ageElSliderValue.min = -1; searchState.ageElSliderValue.max = -1" />
                  <q-btn size="md" flat color="primary" label="20-30" @click="searchState.ageElSliderValue.min = 20; searchState.ageElSliderValue.max = 30" class="q-ml-xs q-pa-sm" />
                  <q-btn size="md" flat color="primary" label="30-40" @click="searchState.ageElSliderValue.min = 30; searchState.ageElSliderValue.max = 40" class="q-ml-xs q-pa-sm" />
                  <q-btn size="md" flat color="primary" label="40-50" @click="searchState.ageElSliderValue.min = 40; searchState.ageElSliderValue.max = 50" class="q-mx-xs q-pa-sm" />
                  <div class="q-mt-sm flex no-wrap" style="width: 50%">
                    <span class="text-caption q-mr-sm full-width" style="max-width: 50px">自定义:</span>
                    <q-range
                      v-model="searchState.ageElSliderValue"
                      :min="17"
                      :max="51"
                      class="q-ml-sm"
                      label
                      label-always
                      style="width: 100%"
                      :left-label-value="formatAgeSize(searchState.ageElSliderValue.min)"
                      :right-label-value="formatAgeSize(searchState.ageElSliderValue.max)"
                    />
                  </div>
                </div>
              </div>
            </div>
          </q-card-section>

          <!-- 学历:
          性别:
          当前薪资:
          期望薪资:
          当前工作地点:
          期望工作地点: -->
          <q-card-section class="flex items-start q-mt-sm q-pl-none q-pb-sm">
            <div class="row q-col-gutter-md flex space-around full-width">
              <!-- 学历 -->
              <div class="col-2 q-pt-none">
                <div class="flex items-center">
                  <div class="text-body2 text-grey-8 q-mb-xs">学历:</div>
                  <q-select
                    v-model="searchState.eduValue"
                    :options="degreeOptionsVal"
                    dense
                    stack-label
                    emit-value
                    map-options
                    class="full-width"
                    placeholder="学历"
                  >
                    <template v-slot:prepend>
                      <q-icon name="school" :color="searchState.eduValue!=='201|201' ? 'primary' : 'grey-6'" size="xs" />
                    </template>
                  </q-select>
                </div>
              </div>

              <!-- 性别 -->
              <div class="col-2 q-pt-none">
                <div class="flex items-center">
                  <div class="text-body2 text-grey-8 q-mb-xs">性别:</div>
                  <q-select
                    v-model="searchState.sexValue"
                    :options="genderOptionsVal"
                    dense
                    emit-value
                    map-options
                    class="full-width"
                    placeholder="性别"
                  >
                    <template v-slot:prepend>
                      <q-icon name="transgender" :color="searchState.sexValue!==-1 ? 'primary' : 'grey-6'" size="xs" />
                    </template>
                  </q-select>
                </div>
              </div>

              <!-- 当前薪资 -->
              <div class="col-2 q-pt-none">
                <div class="flex items-center">
                  <div class="text-body2 text-grey-8 q-mb-xs">当前薪资:</div>
                  <div class="flex items-center full-width no-wrap">
                    <q-select
                      v-model="searchState.currentSalaryStartValue"
                      :options="salaryConfig"
                      dense
                      emit-value
                      map-options
                      style="flex: 1"
                      placeholder="K"
                    >
                      <template v-slot:prepend>
                        <q-icon name="credit_score" :color="searchState.currentSalaryStartValue? 'primary' : 'grey-6'" size="xs" />
                      </template>
                    </q-select>
                    <div class="q-mx-sm">~</div>
                    <q-select
                      v-model="searchState.currentSalaryEndValue"
                      :options="salaryConfig"
                      dense
                      emit-value
                      map-options
                      style="flex: 1"
                      placeholder="K"
                    >
                      <template v-slot:prepend>
                        <q-icon name="credit_score" :color="searchState.currentSalaryEndValue? 'primary' : 'grey-6'" size="xs" />
                      </template>
                    </q-select>
                  </div>
                </div>
              </div>

              <!-- 期望薪资 -->
              <div class="col-2 q-pt-none">
                <div class="flex items-center">
                  <div class="text-body2 text-grey-8 q-mb-xs">期望薪资:</div>
                  <div class="flex items-center full-width no-wrap">
                    <q-select
                      v-model="searchState.expectedSalaryStartValue"
                      :options="salaryConfig"
                      dense
                      emit-value
                      map-options
                      style="flex: 1"
                      placeholder="K"
                    >
                      <template v-slot:prepend>
                        <q-icon name="credit_card" :color="searchState.expectedSalaryStartValue? 'primary' : 'grey-6'" size="xs" />
                      </template>
                    </q-select>
                    <div class="q-mx-sm">~</div>
                    <q-select
                      v-model="searchState.expectedSalaryEndValue"
                      :options="salaryConfig"
                      dense
                      emit-value
                      map-options
                      style="flex: 1"
                      placeholder="K"
                    >
                      <template v-slot:prepend>
                        <q-icon name="credit_card" :color="searchState.expectedSalaryEndValue? 'primary' : 'grey-6'" size="xs"  />
                      </template>
                    </q-select>
                  </div>
                </div>
              </div>

              <!-- 当前工作地点 -->
              <div class="col-2 q-pt-none">
                <div class="flex items-center">
                  <div class="text-body2 text-grey-8 q-mb-xs">当前工作地点:</div>
                  <div class="relative-position">
                    <q-input
                      v-model="currentWorkPlaceVal"
                      dense
                      class="full-width"
                      placeholder="请选择城市"
                      readonly
                    >
                      <template v-slot:prepend>
                        <q-icon name="apartment" :color="currentWorkPlaceVal ? 'primary' : 'grey-6'" size="xs" />
                      </template>
                      <template v-slot:append>
                        <q-icon name="arrow_drop_down" />
                      </template>
                    </q-input>

                    <q-menu>
                      <q-list dense style="min-width: 200px">
                        <q-item
                          v-for="city in citiesConfig"
                          :key="city.value"
                          clickable
                          @click="city.children ? null : selectCity(city,false)"
                        >
                          <q-item-section>{{ city.label }}</q-item-section>
                          <q-item-section v-if="city.children && city.children.length" side>
                            <q-icon name="keyboard_arrow_right" />
                          </q-item-section>

                          <q-menu anchor="top end" self="top start" v-if="city.children && city.children.length">
                            <q-list>
                              <q-item
                                v-for="subCity in city.children"
                                :key="subCity.value"
                                dense
                                clickable
                                @click="selectCity(subCity,false)"
                                v-close-popup
                              >
                                <q-item-section>{{ subCity.label }}</q-item-section>
                              </q-item>
                            </q-list>
                          </q-menu>
                        </q-item>
                      </q-list>
                    </q-menu>
                  </div>
                </div>
              </div>

              <!-- 期望工作地点 -->
              <div class="col-2 q-pt-none">
                <div class="flex items-center">
                  <div class="text-body2 text-grey-8 q-mb-xs">期望工作地点:</div>
                  <div class="relative-position">
                    <q-input
                      v-model="expectedWorkLocationLabelVal"
                      dense
                      class="full-width"
                      placeholder="请选择城市"
                      readonly
                    >
                      <template v-slot:prepend>
                        <q-icon name="location_city" :color="expectedWorkLocationLabelVal ? 'primary' : 'grey-6'" size="xs" />
                      </template>
                      <template v-slot:append>
                        <q-icon name="arrow_drop_down" />
                      </template>
                    </q-input>

                    <q-menu>
                      <q-list dense style="min-width: 200px">
                        <q-item
                          v-for="city in citiesConfig"
                          :key="city.value"
                          clickable
                          @click="city.children ? null : selectCity(city)"
                        >
                          <q-item-section>{{ city.label }}</q-item-section>
                          <q-item-section v-if="city.children && city.children.length" side>
                            <q-icon name="keyboard_arrow_right" />
                          </q-item-section>

                          <q-menu anchor="top end" self="top start" v-if="city.children && city.children.length">
                            <q-list>
                              <q-item
                                v-for="subCity in city.children"
                                :key="subCity.value"
                                dense
                                clickable
                                @click="selectCity(subCity)"
                                v-close-popup
                              >
                                <q-item-section>{{ subCity.label }}</q-item-section>
                              </q-item>
                            </q-list>
                          </q-menu>
                        </q-item>
                      </q-list>
                    </q-menu>
                  </div>
                </div>
              </div>
            </div>
          </q-card-section>

          <!--
          院校要求:
          求职状态:
          职位:
          公司:
          学校:
          专业:
          -->
          <q-card-section class="flex items-start q-mt-xs q-pl-none">
            <div class="row q-col-gutter-md flex space-around full-width">
              <!-- 院校要求 -->
              <div class="col-2 q-pt-none">
                <div class="flex items-center">
                  <div class="text-body2 text-grey-8 q-mb-xs">院校要求:</div>
                  <q-select
                    v-model="searchState.educationLevel"
                    :options="schoolLevelOptionsVal"
                    dense
                    stack-label
                    emit-value
                    map-options
                    class="full-width"
                    placeholder="院校要求"
                  >
                    <template v-slot:prepend>
                      <q-icon name="cast_for_education" :color="searchState.educationLevel!=='-1' ? 'primary' : 'grey-6'" size="xs" />
                    </template>
                  </q-select>
                </div>
              </div>

              <!-- 求职状态 -->
              <div class="col-2 q-pt-none">
                <div class="flex items-center">
                  <div class="text-body2 text-grey-8 q-mb-xs">求职状态:</div>
                  <q-select
                    v-model="searchState.jobSeekingStatusInpValue"
                    :options="jobStatusOptionsVal"
                    dense
                    stack-label
                    emit-value
                    map-options
                    class="full-width"
                    placeholder="求职状态"
                  >
                    <template v-slot:prepend>
                      <q-icon name="work" :color="searchState.jobSeekingStatusInpValue!=='-1' ? 'primary' : 'grey-6'" size="xs" />
                    </template>
                  </q-select>
                </div>
              </div>

              <!-- 职位 -->
              <div class="col-2 q-pt-none">
                <div class="flex items-center">
                  <div class="text-body2 text-grey-8 q-mb-xs">职位:</div>
                  <q-input
                    v-model="searchState.positionInpValue"
                    dense
                    class="full-width"
                    placeholder="职位"
                  >
                    <template v-slot:prepend>
                      <q-icon name="business_center" :color="searchState.positionInpValue ? 'primary' : 'grey-6'" size="xs" />
                    </template>
                  </q-input>
                </div>
              </div>

              <!-- 公司 -->
              <div class="col-2 q-pt-none">
                <div class="flex items-center">
                  <div class="text-body2 text-grey-8 q-mb-xs">公司:</div>
                  <q-input
                    v-model="searchState.corporationInpValue"
                    dense
                    class="full-width"
                    placeholder="公司"
                  >
                    <template v-slot:prepend>
                      <q-icon name="maps_home_work" :color="searchState.corporationInpValue ? 'primary' : 'grey-6'" size="xs" />
                    </template>
                  </q-input>
                </div>
              </div>

              <!-- 学校 -->
              <div class="col-2 q-pt-none">
                <div class="flex items-center">
                  <div class="text-body2 text-grey-8 q-mb-xs">学校:</div>
                  <q-input
                    v-model="searchState.schoolInpValue"
                    dense
                    class="full-width"
                    placeholder="学校"
                  >
                    <template v-slot:prepend>
                      <q-icon name="account_balance" :color="searchState.schoolInpValue ? 'primary' : 'grey-6'" size="xs" />
                    </template>
                  </q-input>
                </div>
              </div>

              <!-- 专业 -->
              <div class="col-2 q-pt-none">
                <div class="flex items-center">
                  <div class="text-body2 text-grey-8 q-mb-xs">专业:</div>
                  <q-input
                    v-model="searchState.professionInpValue"
                    dense
                    class="full-width"
                    placeholder="专业"
                  >
                    <template v-slot:prepend>
                      <q-icon name="menu_book" :color="searchState.professionInpValue ? 'primary' : 'grey-6'" size="xs" />
                    </template>
                  </q-input>
                </div>
              </div>
            </div>
          </q-card-section>

          <!-- 使用新的SearchTags组件 -->
          <search-tags v-model="searchState" ref="searchTagsRef"/>

        </div>
      </q-slide-transition>

    </q-card>
  </div>
<!--  <q-btn @click="()=>console.log(props.searchState)" >测试打印2</q-btn>-->
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import { useStore } from 'vuex';
import notify from 'src/util/notify';
import {getSearchConditionDefaultDicts} from "src/api/search/SearchApi";
import {  degreeOptions,
  genderOptions,
  salaryConfig,
  citiesConfig,
  jobStatusOptions, schoolLevelOptions} from "src/pjo/dto/SearchPageConfig";
import SearchTags from 'src/pages/search/AITags.vue';
import {getSearchStateValues} from "src/pluginSrc/util/SearchParamUtils";
import {getCurrentConditionByChatId} from "src/api/chat/ChatApi";
import {createSearchState} from "src/pjo/dto/request/SearchStateConfig";

// 获取 store 实例
const store = useStore();

// 接收props
const props = defineProps({
  searchState: {
    type: Object,
    required: true
  }
});

// 定义事件
const emit = defineEmits(['update:searchState', 'search', 'reset']);
const searchState = computed({
  get: () => props.searchState,
  set: (newValue) => {
    emit('update:searchState', newValue);
  }
});

const searchTagsRef = ref(null);

//期望地址内容
const expectedWorkLocationLabelVal = ref('')
//当前工作地点内容
const currentWorkPlaceVal = ref('')

//配置信息
//性别
const genderOptionsVal = ref(genderOptions);
//学校类型
const schoolLevelOptionsVal = ref(schoolLevelOptions);
//在职状态
const jobStatusOptionsVal = ref(jobStatusOptions);
//学历状态
const degreeOptionsVal = ref(degreeOptions);

// 热门搜索相关
const hotSearches = ref([]);
const isLoadingHotSearches = ref(false);
const filteredOptions = ref([]);

// 更新输入值
const updateInputValue = (val) => {
  if (searchState.value) {
    searchState.value.selectValue = val;
  }
};

// 过滤热门搜索
const filterHotSearches = (val, update) => {
  if (val === '') {
    update(() => {
      filteredOptions.value = hotSearches.value;
    });
    return;
  }

  update(() => {
    const needle = val.toLowerCase();
    filteredOptions.value = hotSearches.value.filter(
      v => v.toLowerCase().indexOf(needle) > -1
    );
  });
};

// 获取热门搜索数据
const loadHotSearches = async () => {
  try {
    if (hotSearches.value.length > 0) {
      filteredOptions.value = hotSearches.value;
      return;
    }

    isLoadingHotSearches.value = true;
    // 这里应该调用API获取热门搜索关键词
    // const { data } = await getHotSearchKeywords();

    // 模拟热门搜索关键词数据
    const data = ['前端开发', '后端工程师', 'Java开发', 'UI设计师', '产品经理', '人工智能', '数据分析', '运维工程师', '测试工程师', '全栈开发'];

    if (data && Array.isArray(data)) {
      hotSearches.value = data.slice(0, 10); // 只显示前10个热门搜索
      filteredOptions.value = hotSearches.value;
    }
  } catch (error) {
    notify.error('获取热门搜索失败');
    hotSearches.value = [];
    filteredOptions.value = [];
  } finally {
    isLoadingHotSearches.value = false;
  }
};

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
    notify.error('服务异常，请联系管理员');
  }
}
loadingAllSearchConfig();

//滑动模块标签格式化 工作年龄
const formatWorkSize =(value)=>{
  if(value<=0){
    return "不限";
  }else if(value>10){
    return '10年以上';
  }else{
    return value+'年';
  }
}
//滑动模块标签格式化 年龄
const formatAgeSize =(value)=>{
  if(value<=17){
    return "不限";
  }else if(value>50){
    return '50岁以上';
  }else{
    return value+'岁';
  }
}

//期望工作地点
const selectCity = (city,isExpectedWorkLocationLabel=true) => {
  // console.log(city)
  let lebel = '';
  lebel = city.label;
  if(city?.label&& city.label==='市辖区'){
    let find = citiesConfig.find(e=>e.value===city.parentCode);
    lebel = find.label;
  }
  if(isExpectedWorkLocationLabel){
    expectedWorkLocationLabelVal.value = lebel
    searchState.value.expectedWorkLocationValue = [city.parentCode, city.value];
  }else{
    currentWorkPlaceVal.value = lebel
    searchState.value.currentWorkPlaceValue = [city.parentCode, city.value];
  }
}

//初始化城市
const initCitiesConfig = (newValue) => {
  if (newValue && newValue.length === 2) {
    const provinceValue = newValue[0];
    const cityValue = newValue[1];
    // 查找省级选项
    const province = citiesConfig.find(item => item.value === provinceValue);
    if (province && province.children) {
      // 在省级选项的子选项中查找城市
      const city = province.children.find(item => item.value === cityValue);
      if (city) {
        // 调用selectCity方法并传入找到的城市对象
        selectCity(city);
      }
    }
  }
}
initCitiesConfig(searchState.value.expectedWorkLocationValue);

// 搜索
const onSearch = () => {
  emit('search');
};

// 重置
const onReset = () => {
  emit('reset');
};

//设置搜索条件
const setSearchState = (newValue) => {
  searchState.value = newValue;
}

//获取搜索条件
const getChatConditionRequest = async (chatId) => {
  try {
    let {data} = await getCurrentConditionByChatId(chatId);
    return data;
  } catch (error) {
    console.error('获取聊天条件出错:', error);
    return null;
  }
}
//刷新搜索条件
const refreshSearchCondition = async (chatId) => {
  if (!chatId) {
    let searchStateConfig =createSearchState();
    setSearchState(searchStateConfig);
    return;
  }
  try {
    let chatConditionRequest = await getChatConditionRequest(chatId);
    if(chatConditionRequest){
      console.log("1",chatConditionRequest)
      let searchStateValues = getSearchStateValues(chatConditionRequest);
      console.log("2",searchStateValues)
      setSearchState(searchStateValues);
    } else {
      console.warn('没有获取到聊天条件数据');
    }
  } catch (error) {
    console.error('刷新搜索条件出错:', error);
  }
}

// 刷新搜索条件并搜索
const refreshAndSearchFN = async (chatId) => {
  await refreshSearchCondition(chatId);
  onSearch();
}

// 筛选面板显示状态，从 Vuex 获取
const showFilterPanel = computed(() => store.getters.getShowFilterPanel);

// 切换筛选面板显示/隐藏
const toggleFilterPanel = () => {
  store.commit('toggleFilterPanel');
  
  // 如果是展开面板，则在下一个渲染周期重新计算标签
  if (!showFilterPanel.value) {
    nextTick(() => {
      if (searchTagsRef.value) {
        // 给容器一点时间完全展开
        setTimeout(() => {
          searchTagsRef.value.recalculateAllTags();
        }, 300); // 与 q-slide-transition 的过渡时间匹配
      }
    });
  }
};

const openAllTagsEditor = () => {
  if(searchTagsRef.value){
    searchTagsRef.value.openAllTagsEditor();
  }
};

// 监听筛选面板显示状态的变化
watch(() => showFilterPanel.value, (newVal) => {
  if (newVal) {
    // 面板展开时，重新计算标签
    nextTick(() => {
      // 给容器一点时间完全展开
      setTimeout(() => {
        if (searchTagsRef.value) {
          searchTagsRef.value.recalculateAllTags();
        }
      }, 300); // 与 q-slide-transition 的过渡时间匹配
    });
  }
});

// 暴露给父组件的方法
defineExpose({
  setSearchState,refreshSearchCondition,refreshAndSearchFN
});
</script>

<style scoped>

</style>
