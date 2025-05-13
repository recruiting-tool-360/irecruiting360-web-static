
export const createSearchState = ()=>{
    return {

        // 头部搜索属性
        /**
         * 搜索框的选中值
         * @type {string}
         */
        selectValue : "",
        searchQuery : "",

        // 工作年限
        /**
         * 工作年限选择范围
         * @type {Array<number>}
         */
        // workElSliderValue : [-1, 6],
        workElSliderValue : {min:-1,max:-1},

        // 年龄属性
        /**
         * 年龄选择范围
         * @type {Array<number>}
         */
        // ageElSliderValue : [17, 45],
        ageElSliderValue : {min:-1,max:-1},

        // 学历属性
        /**
         * 学历选项
         * @type {string}
         */
        eduValue : "201|201",
        // 院校要求
        /**
         * 院校要求
         * @type {string}
         */
        educationLevel : "-1",

        // 性别属性
        /**
         * 性别选项
         * @type {string|null}
         */
        sexValue : -1,

        // 当前薪资属性
        /**
         * 当前薪资
         * @type {number|null}
         */
        currentSalaryValue : null,

        /**
         * 当前薪资范围的起始值
         * @type {number|null}
         */
        currentSalaryStartValue : null,

        /**
         * 当前薪资范围的结束值
         * @type {number|null}
         */
        currentSalaryEndValue : null,

        // 期望薪资属性
        /**
         * 期望薪资
         * @type {number|null}
         */
        expectedSalaryValue : null,

        /**
         * 期望薪资范围的起始值
         * @type {number|null}
         */
        expectedSalaryStartValue : null,

        /**
         * 期望薪资范围的结束值
         * @type {number|null}
         */
        expectedSalaryEndValue : null,

        // 当前工作地点属性
        /**
         * 当前工作地点
         * @type {string|null}
         */
        currentWorkPlaceValue : null,

        // 期望工作地点属性
        /**
         * 期望工作地点
         * @type {string|null}
         */
        expectedWorkLocationValue : ['31', '3101'],

        // 学校属性
        /**
         * 学校名称
         * @type {string}
         */
        schoolInpValue : "",

        // 职位属性
        /**
         * 职位名称
         * @type {string}
         */
        positionInpValue : "",

        // 公司属性
        /**
         * 公司名称
         * @type {string}
         */
        corporationInpValue : "",

        // 专业属性
        /**
         * 专业名称
         * @type {string}
         */
        professionInpValue : "",

        // 求职状态属性
        /**
         * 求职状态
         * @type {string}
         */
        jobSeekingStatusInpValue : "-1",

        // 数据表标签页属性
        /**
         * 标签页选中的值
         * @type {string}
         */
        jobListTopTabsValue : 'first',

        // 仅显示未读
        /**
         * 未读筛选状态
         * @type {boolean|null}
         */
        unreadCheckBoxValue : null,

        // 根据 AI 评估排序
        /**
         * AI 排序选项
         * @type {boolean|null}
         */
        aiSortCheckBoxValue : null,
        //ai 推荐
        // criteria:null,
        criteria:{
          "professional_skills": [
            "具备强悍编码能力，熟悉linux开发环境，熟悉Hadoop/Hive优先",
            "具备扎实数据结构功底，熟悉机器学习等一项或多项技术"
          ],
          "soft_skills": [
            "具备较好数理基础和逻辑分析能力",
            "对解决挑战性问题充满激情",
            "具备较好主动性和团队合作精神"
          ],
          "work_experience": [
            "有搜索引擎、推荐系统等相关领域经验者优先"
          ]
        },
        //用户id
        userId:null
    };
}

export const convertSearchState = (obj) => {
    const searchState = createSearchState();
    searchState.selectValue= obj.keyWord;
    // let workElSlider = [obj.experienceFrom,obj.experienceTo];
    // searchState.workElSliderValue = workElSlider;
    searchState.workElSliderValue.min = obj.experienceFrom;
    searchState.workElSliderValue.max = obj.experienceTo;
    // let ages =[obj.ageFrom,obj.ageTo];
    // searchState.ageElSliderValue = ages;
    searchState.ageElSliderValue.min = obj.ageFrom;
    searchState.ageElSliderValue.max = obj.ageTo;

    searchState.eduValue =obj.degree || searchState.eduValue;
    searchState.educationLevel = obj.educationLevel || searchState.educationLevel;
    searchState.sexValue =obj.gender?obj.gender*1:searchState.sexValue;

    searchState.currentSalaryStartValue =obj.currentSalaryFrom?(obj.currentSalaryFrom<=0?null:obj.currentSalaryFrom+""):null;
    searchState.currentSalaryEndValue =obj.currentSalaryTo?(obj.currentSalaryTo<=0?null:obj.currentSalaryTo+""):null;
    searchState.expectedSalaryStartValue =obj.expectedSalaryFrom?(obj.expectedSalaryFrom<=0?null:obj.expectedSalaryFrom+""):null;

    searchState.expectedSalaryEndValue =obj.expectedSalaryTo?(obj.expectedSalaryTo<=0?null:obj.expectedSalaryTo+""):null;
    searchState.currentWorkPlaceValue = obj.currentLocations;
    searchState.expectedWorkLocationValue = (obj.expectedLocations&&obj.expectedLocations.length==2)?obj.expectedLocations:searchState.expectedWorkLocationValue;
    searchState.jobSeekingStatusInpValue = obj.availabilityStatus || searchState.jobSeekingStatusInpValue;

    searchState.positionInpValue = obj.position;
    searchState.corporationInpValue = obj.company;
    searchState.schoolInpValue = obj.school;
    searchState.professionInpValue = obj.major;
    searchState.searchChannels = [];
    let newCriteria = null;
    if(obj.criteria&&obj.criteria['professional_skills']&&obj.criteria['professional_skills'].length===0&&
        obj.criteria['soft_skills']&&obj.criteria['soft_skills'].length===0&&obj.criteria['work_experience']&&obj.criteria['work_experience'].length===0){
        newCriteria = null;
    }else{
        newCriteria = obj.criteria;
    }

    searchState.criteria = newCriteria;
    searchState.userId =obj.userId
    // console.log("新的值：",searchState)
    return searchState;
}
