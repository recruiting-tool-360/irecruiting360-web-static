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
<!--                <template #append>-->
<!--                  <el-button :icon="CircleClose" @click="searchState.selectValue = ''"/>-->
<!--                </template>-->
                <!-- 右侧图标 -->
                <template #suffix>
                  <div style="height: 100%;display: flex;align-items: center">
                    <el-image  style="height: 16px;width: 16px;" src="/index/header/searchPage/search.svg"></el-image>
                  </div>
                </template>
              </el-input>
              <!--      重置筛选项      -->
              <el-button class="btm-color btm-border-blue-style" @click="resetSearchConnect">重置筛选项</el-button>
              <!--     保存搜索条件       -->
              <el-button class="btm-color btm-border-blue-style" @click="searchConditionDialog=true">保存搜索条件</el-button>
              <!--     搜索按钮       -->
              <el-button class="btm-color-white btm-bg-color" @click="searchJobListFn">搜索</el-button>
              <!--     AI人才搜索       -->
              <el-button class="btm-color-white btm-color btm-ai-btm-bg-color" @click="aiChatDialogFlag=true">
                <el-image :src="'/index/header/icons/aiBtm.svg'" style="margin-right: 8px"></el-image>
                AI人才搜索</el-button>
            </el-col>

<!--            <el-col class="search-el-col search-el-col-rt" :span="9">-->
<!--              &lt;!&ndash;      重置筛选项      &ndash;&gt;-->
<!--              <el-button class="btm-color btm-border-blue-style" @click="resetSearchConnect">重置筛选项</el-button>-->
<!--              &lt;!&ndash;     保存搜索条件       &ndash;&gt;-->
<!--              <el-button class="btm-color btm-border-blue-style">保存搜索条件</el-button>-->
<!--              &lt;!&ndash;     搜索按钮       &ndash;&gt;-->
<!--              <el-button class="btm-color-white btm-bg-color" @click="searchJobListFn">搜索</el-button>-->
<!--              &lt;!&ndash;     AI人才搜索       &ndash;&gt;-->
<!--              <el-button class="btm-color-white btm-color btm-ai-btm-bg-color" @click="aiChatDialogFlag=true">-->
<!--                <el-image :src="'/index/header/icons/aiBtm.svg'" style="margin-right: 8px"></el-image>-->
<!--                AI人才搜索</el-button>-->
<!--            </el-col>-->
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
                  <el-slider class="el-button-margin-left" style="width: 60%" v-model="searchState.workElSliderValue" range :min="1" :max="11" :format-tooltip="(value)=>value<11?value+'年':'10年以上'"/>
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
                  <el-slider class="el-button-margin-left" style="width: 60%" v-model="searchState.ageElSliderValue" range :min="18" :max="51" :format-tooltip="(value)=>value<51?value+'岁':'50岁以上'"/>
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
              <!--            &lt;!&ndash;     性别       &ndash;&gt;-->
              <!--            <el-col class="edu-and-sex-el-col el-col-display-Style " :span="3">-->
              <!--              <el-text class="mx-1 el-text-min-width-style el-text-margin-rg-style">性别:</el-text>-->
              <!--              <el-select v-model="searchState.sexValue"-->
              <!--                         placeholder="性别"-->
              <!--                         size="small"-->
              <!--                         no-data-text="无"-->
              <!--                         no-match-text="无"-->
              <!--              >-->
              <!--                <el-option-->
              <!--                    v-for="item in genderOptions"-->
              <!--                    :key="item.value"-->
              <!--                    :label="item.label"-->
              <!--                    :value="item.value"-->
              <!--                />-->
              <!--              </el-select>-->
              <!--            </el-col>-->
              <!--            &lt;!&ndash;     当前薪资       &ndash;&gt;-->
              <!--            <el-col class="edu-and-sex-el-col el-col-display-Style " :span="5">-->
              <!--              <el-text class="mx-1 el-text-margin-rg-style" style="min-width: 4rem">当前薪资:</el-text>-->
              <!--              &lt;!&ndash;      开始        &ndash;&gt;-->
              <!--              <el-select v-model="searchState.currentSalaryStartValue"-->
              <!--                         placeholder="K"-->
              <!--                         size="small"-->
              <!--                         no-data-text="无"-->
              <!--                         no-match-text="无"-->
              <!--                         style="width: 4rem"-->
              <!--              >-->
              <!--                <el-option-->
              <!--                    v-for="item in salaryConfig"-->
              <!--                    :key="item.value"-->
              <!--                    :label="item.label"-->
              <!--                    :value="item.value"-->
              <!--                />-->
              <!--              </el-select>-->
              <!--              <el-text class="mx-1" style="margin: 0 5px">-</el-text>-->
              <!--              &lt;!&ndash;      结束        &ndash;&gt;-->
              <!--              <el-select v-model="searchState.currentSalaryEndValue"-->
              <!--                         placeholder="K"-->
              <!--                         size="small"-->
              <!--                         no-data-text="无"-->
              <!--                         no-match-text="无"-->
              <!--                         style="width: 4rem"-->
              <!--              >-->
              <!--                <el-option-->
              <!--                    v-for="item in salaryConfig"-->
              <!--                    :key="item.value"-->
              <!--                    :label="item.label"-->
              <!--                    :value="item.value"-->
              <!--                />-->
              <!--              </el-select>-->
              <!--            </el-col>-->
              <!--            &lt;!&ndash;     期望薪资       &ndash;&gt;-->
              <!--            <el-col class="edu-and-sex-el-col el-col-display-Style " :span="5">-->
              <!--              <el-text class="mx-1 el-text-margin-rg-style" style="min-width: 4rem">期望薪资:</el-text>-->
              <!--              &lt;!&ndash;      开始        &ndash;&gt;-->
              <!--              <el-select v-model="searchState.expectedSalaryStartValue"-->
              <!--                         placeholder="K"-->
              <!--                         size="small"-->
              <!--                         no-data-text="无"-->
              <!--                         no-match-text="无"-->
              <!--                         style="width: 4rem"-->
              <!--              >-->
              <!--                <el-option-->
              <!--                    v-for="item in salaryConfig"-->
              <!--                    :key="item.value"-->
              <!--                    :label="item.label"-->
              <!--                    :value="item.value"-->
              <!--                />-->
              <!--              </el-select>-->
              <!--              <el-text class="mx-1" style="margin: 0 5px">-</el-text>-->
              <!--              &lt;!&ndash;      结束        &ndash;&gt;-->
              <!--              <el-select v-model="searchState.expectedSalaryEndValue"-->
              <!--                         placeholder="K"-->
              <!--                         size="small"-->
              <!--                         no-data-text="无"-->
              <!--                         no-match-text="无"-->
              <!--                         style="width: 4rem"-->
              <!--              >-->
              <!--                <el-option-->
              <!--                    v-for="item in salaryConfig"-->
              <!--                    :key="item.value"-->
              <!--                    :label="item.label"-->
              <!--                    :value="item.value"-->
              <!--                />-->
              <!--              </el-select>-->
              <!--            </el-col>-->
              <!--            &lt;!&ndash;     当前工作地点       &ndash;&gt;-->
              <!--            <el-col class="edu-and-sex-el-col el-col-display-Style " :span="8">-->
              <!--              <el-text class="mx-1 el-text-margin-rg-style" style="min-width: 6rem">当前工作地点:</el-text>-->
              <!--              <el-cascader-->
              <!--                  v-model="searchState.currentWorkPlaceValue"-->
              <!--                  :options="citiesConfig"-->
              <!--                  size="small"-->
              <!--                  placeholder="请选择城市"-->
              <!--              />-->
              <!--            </el-col>-->
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
              <!--            &lt;!&ndash;     学校       &ndash;&gt;-->
              <!--            <el-col class="company-and-school-el-col el-col-display-Style" :span="3">-->
              <!--              <el-text class="mx-1 el-text-min-width-style el-text-margin-rg-style">学校:</el-text>-->
              <!--              <el-input v-model="searchState.schoolInpValue" size="small" placeholder="学校" />-->
              <!--            </el-col>-->
              <!--            &lt;!&ndash;     职位       &ndash;&gt;-->
              <!--            <el-col class="company-and-school-el-col el-col-display-Style" :span="3">-->
              <!--              <el-text class="mx-1 el-text-min-width-style el-text-margin-rg-style">职位:</el-text>-->
              <!--              <el-input v-model="searchState.positionInpValue" size="small" placeholder="职位" />-->
              <!--            </el-col>-->
              <!--            &lt;!&ndash;     公司       &ndash;&gt;-->
              <!--            <el-col class="company-and-school-el-col el-col-display-Style" :span="3">-->
              <!--              <el-text class="mx-1 el-text-min-width-style el-text-margin-rg-style">公司:</el-text>-->
              <!--              <el-input v-model="searchState.corporationInpValue" size="small" placeholder="公司" />-->
              <!--            </el-col>-->
              <!--            &lt;!&ndash;     专业       &ndash;&gt;-->
              <!--            <el-col class="company-and-school-el-col el-col-display-Style" :span="3">-->
              <!--              <el-text class="mx-1 el-text-min-width-style el-text-margin-rg-style">专业:</el-text>-->
              <!--              <el-input v-model="searchState.professionInpValue" size="small" placeholder="专业" />-->
              <!--            </el-col>-->
              <!--            &lt;!&ndash;     求职状态       &ndash;&gt;-->
              <!--            <el-col class="company-and-school-el-col el-col-display-Style" :span="4">-->
              <!--              <el-text class="mx-1 el-text-margin-rg-style" style="min-width: 4rem">求职状态:</el-text>-->
              <!--              <el-select v-model="searchState.jobSeekingStatusInpValue"-->
              <!--                         placeholder="求职状态"-->
              <!--                         size="small"-->
              <!--                         no-data-text="无"-->
              <!--                         no-match-text="无"-->
              <!--              >-->
              <!--                <el-option-->
              <!--                    v-for="item in jobStatusOptions"-->
              <!--                    :key="item.value"-->
              <!--                    :label="item.label"-->
              <!--                    :value="item.value"-->
              <!--                />-->
              <!--              </el-select>-->
              <!--            </el-col>-->
              <!--            &lt;!&ndash;     期望工作地点       &ndash;&gt;-->
              <!--            <el-col class="edu-and-sex-el-col el-col-display-Style " :span="8">-->
              <!--              <el-text class="mx-1 el-text-margin-rg-style" style="min-width: 6rem">期望工作地点:</el-text>-->
              <!--              <el-cascader-->
              <!--                  v-model="searchState.expectedWorkLocationValue"-->
              <!--                  :options="citiesConfig"-->
              <!--                  size="small"-->
              <!--                  placeholder="请选择城市"-->
              <!--              />-->
              <!--            </el-col>-->
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
          <el-row class="height-btm-row" style="margin-top: 12px">
            <el-col :span="24" style="display: flex;justify-content: flex-start;align-items: center;flex-wrap: nowrap">
              <el-text class="mx-1 el-text-margin-rg-style">AI推荐:</el-text>
              <el-button class="recommended">ai行业工作经验
                <el-icon class="el-icon--right"><Close /></el-icon>
              </el-button>
              <el-button class="recommended">3年以上人事软件实施工作经验
                <el-icon class="el-icon--right"><Close /></el-icon>
              </el-button>
              <el-button class="recommended">男士优先
                <el-icon class="el-icon--right"><Close /></el-icon>
              </el-button>
              <el-button class="recommended-btm" type="primary" link>清空</el-button>
              <el-button class="recommended-btm" type="primary" link style="margin-left: 8px;">确定</el-button>
            </el-col>
          </el-row>
        </el-card>
      </div>

      <!--   列表部分   -->
      <div class="jobList">
        <el-card class="jobList-card">
          <el-row class="jobList-top-el-row" :gutter="0" style="border-bottom: 1px solid #E8E8E8;min-height: 3rem;min-width: 350px;margin-bottom: 15px">
            <el-col class="jobList-top-el-col el-col-display-Style topBtm">
              <el-descriptions :column="2" style="width: 100%;">
                <!--       按钮列表         -->
                <el-descriptions-item>
                  <div class="top-div" style="min-width: 350px;align-items: center">
<!--                    <el-segmented v-model="channelValue" :options="topChannelBtmOptionsConfig" />-->
                      <el-button text @click="jobInfoName='ALL';" :class="{ 'btm-color': jobInfoName === 'ALL' }">聚合渠道({{allChannelDataSize}})</el-button>
                      <el-button v-show="allChannelStatus.BOSS.disable" text @click="jobInfoName='BOSS';" :class="{ 'btm-color': jobInfoName === 'BOSS' }">BOSS(0)&nbsp;
                        <el-text v-if="allChannelStatus.BOSS.login" class="" type="success">已登陆</el-text>
                        <el-text v-else-if="allChannelStatus.BOSS.loading" class="" type="warning">检测中...</el-text>
                        <el-text v-else class="" type="danger">未登陆</el-text>
                        </el-button>
                      <el-button text @click="jobInfoName='Collect';" :class="{ 'btm-color': jobInfoName === 'Collect' }">我的收藏({{allChannelDataSize}})</el-button>
                  </div>
                </el-descriptions-item>
                <el-descriptions-item align="right">
                  <!--    渠道设置      -->
                  <div style="display: flex;justify-content: end;margin-left: 20px;width: 100%">
                    <el-checkbox v-model="searchState.unreadCheckBoxValue" style="height: 32px;font-size: 13px" label="仅显示未读"/>
                    <el-checkbox v-model="searchState.aiSortCheckBoxValue" style="height: 32px;font-size: 13px" label="根据AI评估排序"/>
                    <el-button class="btm-color" style="margin-left: 2rem;height: 32px" @click="channelDialogFlag=true">渠道设置</el-button>
                  </div>
                </el-descriptions-item>
              </el-descriptions>
            </el-col>
          </el-row>
          <!--    不同模版      -->
          <JobInfo ref="jobInfoRef" v-show="jobInfoName==='ALL'" :on-loding-open="loadingOpen" :on-loding-close="loadingClose"></JobInfo>
          <BossJobInfo v-show="jobInfoName==='BOSS'"></BossJobInfo>
        </el-card>
      </div>
      <!--   渠道配置   -->
      <ChannelConfig v-model:dialogVisible="channelDialogFlag" :change-close-status="()=>channelDialogFlag=false" :on-confirm="onChannelConfig"></ChannelConfig>
      <!--   聊天chat   -->
      <AIChat2 :dialog-flag="aiChatDialogFlag" :on-close-click="()=>aiChatDialogFlag=false"></AIChat2>
      <!--  插件安装提示    -->
      <PluginInfo></PluginInfo>
      <!--   保存搜索条件   -->
      <SearchCondition v-model:dialogVisible="searchConditionDialog" :change-close-status="()=>searchConditionDialog=false" :on-condition-request="getSearchConditionRequest"></SearchCondition>
    </div>
</template>
<script setup>
import {computed, onMounted, ref, watch} from 'vue'
import {CircleClose, ArrowUp,ArrowDown,Close} from '@element-plus/icons-vue'
import AIChat2 from "@/views/search/chat/AIChat2.vue";
import {createSearchState} from "@/views/search/dto/request/SearchStateConfig";
import {convertSearchConditionRequest} from "@/domain/request/SaveSearchRequest";
import {
  degreeOptions,
  genderOptions,
  salaryConfig,
  citiesConfig,
  jobStatusOptions,
  topChannelBtmOptions, schoolLevelOptions
} from "@/views/search/dto/SearchPageConfig";
import {getSearchConditionDefaultDicts, querySearch, saveCondition} from "@/api/search/SearchApi";
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
import {createPageSearchRequest} from "@/views/search/dto/request/PageSearchConfig";
import PluginInfo from "@/views/search/components/PluginInfo.vue";
import {getChatIdByUserId} from "@/api/chat/ChatApi";
import SearchCondition from "@/views/search/searchCondition/SearchCondition.vue";
import ChannelConfig from "@/views/search/channel/ChannelConfig.vue";

const store = useStore();
//新的搜索体
const searchConditionRequestData = computed(() => store.getters.getSearchConditionRequestData);
//搜索id
const searchConditionId = computed(() => store.getters.getSearchConditionId);
//搜索区域loading
const searchAreaLoadingSwitch = ref(false);
//固定条件搜索属性
let searchStateConfig =createSearchState();
const searchState = ref(searchStateConfig);
//加载 loading
let loadingBig ;
//结果集渲染模版名称
const jobInfoName = ref("ALL");
const activeButton = ref('ALL');
//渠道值
const channelValue = ref('ALL');
//聚合数据数量
const allChannelDataSize = computed(() => store.getters.getAllChannelCount);
//结果集
const allResponse = ref({
  ALL:{},
  BOSS:{},
});
//ref
const jobInfoRef = ref(null);
//登陆状态
// const allChannelStatus = ref({
//   BOSS:{
//     login:false,
//     loading:false,
//     name:"boss直聘",
//     disable:true
//   },
// });
const allChannelStatus = computed(() => store.getters.getChannelConf);
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
//配置信息
//性别
const genderOptionsVal = ref(genderOptions);
//学校类型
const schoolLevelOptionsVal = ref(schoolLevelOptions);
//在职状态
const jobStatusOptionsVal = ref(jobStatusOptions);
//学历状态
const degreeOptionsVal = ref(degreeOptions);



//onMounted 生命周期函数
onMounted(async () => {
  //搜索区域初始高度
  if (expandableDiv.value) {
    contentHeight.value = expandableDiv.value.scrollHeight;
  }
  //加载登陆状态
  let userLoginStatus;
  try {
    allChannelStatus.value.BOSS.loading = true;
    setTimeout(async () => {
      userLoginStatus = await boosUserStatus();
      allChannelStatus.value.BOSS.login = pluginBossResultProcessor(userLoginStatus);
      allChannelStatus.value.BOSS.loading = false;
    }, 2000)
    // userLoginStatus = await boosUserStatus();
    // allLoginStatus.value.BOSS = pluginBossResultProcessor(userLoginStatus);
  }catch (e){
    ElMessage.error('系统无法监测到Boos直聘网站认证信息！如果问题还没解决请联系管理员！');
    allChannelStatus.value.BOSS.login = false;
    allChannelStatus.value.BOSS.loading = false;
  }
})

onMounted(async ()=>{
  try {
    const {data}= await getChatIdByUserId(1);
    store.commit('changeLocalUserChatId',data);
  }catch (e){
    ElMessage.error('后端服务异常，请联系管理员');
  }
});

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
  }finally {
    loadingClose();
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
const searchJobList = async () => {
  // //处理工作年限边界
  // const workElSliderValue = searchState.value.workElSliderValue;
  // workElSliderValue[1] = workElSliderValue[1] === 11 ? workElSliderValue[1] = -1 : workElSliderValue[1];
  // //处理年龄边界
  // const ageElSliderValue = searchState.value.ageElSliderValue;
  // ageElSliderValue[1] = ageElSliderValue[1] === 51 ? ageElSliderValue[1] = -1 : ageElSliderValue[1];
  // //用户id
  // searchState.value.userId=1;
  // //处理其他参数
  // let searchConditionRequest = convertSearchConditionRequest(searchState.value);
  // searchConditionRequest.experienceTo = workElSliderValue[1];
  // searchConditionRequest.ageTo = ageElSliderValue[1];
  let searchConditionRequest = getSearchConditionRequest();
  //搜索条件
  let searchRequestData;
  try {
    const {data} = await saveCondition(searchConditionRequest);
    searchRequestData = data;
    store.commit('changeSearchConditionId',searchRequestData.id);
  }catch (e){
    ElMessage.error('后端服务异常，请联系管理员');
    console.log(e);
    return;
  }
  //如果开启测试，不需要查询数据列表
  let responseJobListData;
  // if(store.getters.getTestSwitch){
  //   responseJobListData = getBoosTestJobList().BOSS;
  // }else{
  //
  // }
  try {
    responseJobListData = await boosJobList(searchRequestData.channelSearchConditions[0].conditionData);
  }catch (e){
    console.log(e);
    loadingClose();
    return;
  }
  if(!pluginBossResultProcessor(responseJobListData)){
    ElMessage.error('Boos数据查询异常！请联系管理员！'+(responseJobListData?.responseData?.data?.message))
    return;
  }
  //列表存到后端
  const boosList = responseJobListData.responseData.data.zpData.geeks;
  let saveJobListRequest = saveJobListRequestTemplate();
  saveJobListRequest.outId = searchRequestData.requestId;
  saveJobListRequest.searchConditionId = searchRequestData.id;
  saveJobListRequest.channel = "boss直聘";
  saveJobListRequest.resumeList = boosList;
  let jobList;
  try {
    let {data:jobListData} = await saveJobList(saveJobListRequest);
    jobList = jobListData;
  }catch (e){
    ElMessage.error('后端服务异常，请联系管理员');
    console.log(e);
    return;
  }
  allResponse.value.BOSS =jobList;
  console.log("allResponse.value.BOSS",allResponse.value.BOSS)
  //处理id
  if(!jobList||jobList.length===0){
    return;
  }
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
      if(index<1){
        boosQueueManager.enqueue(taskRequest);
      }
    }
  });
  //各个渠道列表
  if (jobInfoRef.value) {
    jobInfoName.value='ALL';
    // activeButton.value='ALL';
    jobInfoRef.value.search(1);
  }
}

//获取搜索条件
const getSearchConditionRequest = () => {
  //处理工作年限边界
  const workElSliderValue = searchState.value.workElSliderValue;
  workElSliderValue[1] = workElSliderValue[1] === 11 ? workElSliderValue[1] = -1 : workElSliderValue[1];
  //处理年龄边界
  const ageElSliderValue = searchState.value.ageElSliderValue;
  ageElSliderValue[1] = ageElSliderValue[1] === 51 ? ageElSliderValue[1] = -1 : ageElSliderValue[1];
  //用户id
  searchState.value.userId=1;
  //处理其他参数
  let searchConditionRequest = convertSearchConditionRequest(searchState.value);
  searchConditionRequest.experienceTo = workElSliderValue[1];
  searchConditionRequest.ageTo = ageElSliderValue[1];
  return searchConditionRequest;
}

//boos数据列表
const boosJobList = async (searchConfig) => {
  const headers = await getBoosHeader(true);
  if(!headers){
    ElMessage.error('系统无法监测到Boos直聘网站认证信息！如果问题还没解决请联系管理员！');
    throw new Error("系统无法监测到Boos直聘网站认证信息！如果问题还没解决请联系管理员！");
  }
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


//boos 用户登陆状态
const boosUserStatus = async () => {
  const headers = await getBoosHeader(true);
  if(!headers){
    ElMessage.error('系统无法监测到Boos直聘网站认证信息！如果问题还没解决请联系管理员！');
    return;
  }
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
  try {
    const response = await PluginMessenger.sendMessage(action, emptyRequestTemplate, timeout);
    return response;
  } catch (error) {
    console.error('Error:', error.message);
  }
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

//监听搜索体
watch(() => searchConditionRequestData.value, (newValue) => {
  searchAreaLoadingSwitch.value=true;
  console.log("监听搜索体",newValue)
  setTimeout(async () => {
    searchAreaLoadingSwitch.value=false;
  },2000);
});

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
</style>