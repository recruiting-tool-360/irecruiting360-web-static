
//搜索条件类
// SearchConditionRequest.js
export const SearchConditionRequest =()=>{
    return {
        // 搜索条件ID，主键，做入参时不填
        /**
         * 搜索条件ID（主键，作为入参时不填）
         * @type {number|null}
         */
        id : null,

        // 用户ID
        /**
         * 用户ID
         * @type {number|null}
         */
        userId : null,

        // 关键词
        /**
         * 搜索关键词列表
         * @type {string}
         */
        keyWord : '',

        // 工作经验范围
        /**
         * 工作经验，最小值
         * @type {number}
         */
        experienceFrom : -1,

        /**
         * 工作经验，最大值
         * @type {number}
         */
        experienceTo : -1,

        // 年龄范围
        /**
         * 年龄，最小值
         * @type {number}
         */
        ageFrom : -1,

        /**
         * 年龄，最大值
         * @type {number}
         */
        ageTo : -1,

        // 教育水平
        /**
         * 教育水平
         * @type {string}
         */
        educationLevel : '',

        // 性别
        /**
         * 性别
         * @type {string}
         */
        gender : '',

        // 当前薪资范围
        /**
         * 当前薪资，最小值
         * @type {number}
         */
        currentSalaryFrom : 0,

        /**
         * 当前薪资，最大值
         * @type {number}
         */
        currentSalaryTo : 0,

        // 期望薪资范围
        /**
         * 期望薪资，最小值
         * @type {number}
         */
        expectedSalaryFrom : 0,

        /**
         * 期望薪资，最大值
         * @type {number}
         */
        expectedSalaryTo : 0,

        // 当前工作地点
        /**
         * 当前工作地点列表
         * @type {Array<string>}
         */
        currentLocations : [],

        // 期望工作地点
        /**
         * 期望工作地点列表
         * @type {Array<string>}
         */
        expectedLocations : [],

        // 求职状态
        /**
         * 求职状态
         * @type {string}
         */
        jobSeekingStatus : '',

        // 岗位
        /**
         * 岗位
         * @type {string}
         */
        position : '',

        // 公司
        /**
         * 公司
         * @type {string}
         */
        company : '',

        // 学校
        /**
         * 学校
         * @type {string}
         */
        school : '',

        // 专业
        /**
         * 专业
         * @type {string}
         */
        major : '',

        // 渠道
        /**
         * 渠道
         * @type {Array<string>}
         */
        searchChannels: [],
    }
}

export const convertSearchConditionRequest = (obj) => {
  const searchConditionRequest = SearchConditionRequest();
    searchConditionRequest.keyWord = obj.selectValue;
    let workElSliderValue = obj.workElSliderValue;
    searchConditionRequest.experienceFrom =workElSliderValue[0];
    searchConditionRequest.experienceTo = workElSliderValue[1];
    let ageElSliderValue = obj.ageElSliderValue;
    searchConditionRequest.ageFrom =ageElSliderValue[0];
    searchConditionRequest.ageTo =ageElSliderValue[1];
    searchConditionRequest.educationLevel =obj.eduValue
    searchConditionRequest.gender =obj.sexValue;
    searchConditionRequest.currentSalaryFrom =obj.currentSalaryStartValue;
    searchConditionRequest.currentSalaryTo =obj.currentSalaryEndValue;
    searchConditionRequest.expectedSalaryFrom =obj.expectedSalaryStartValue;
    searchConditionRequest.expectedSalaryTo =obj.expectedSalaryEndValue;
    searchConditionRequest.currentLocations = obj.currentWorkPlaceValue;
    searchConditionRequest.expectedLocations = obj.expectedWorkLocationValue;
    searchConditionRequest.jobSeekingStatus = obj.jobSeekingStatusInpValue;
    searchConditionRequest.position = obj.positionInpValue;
    searchConditionRequest.company = obj.corporationInpValue;
    searchConditionRequest.school = obj.schoolInpValue;
    searchConditionRequest.major = obj.professionInpValue;
    searchConditionRequest.searchChannels = ['boss直聘'];
    searchConditionRequest.userId =obj.userId
    return searchConditionRequest;
}
