export const getJobListTemplate = () =>{
    return {
        id:null,
        index:0,
        platform :1,
        data:null
    }
}
export const getEmptyRequestTemplate = () => {
  return {
      header:[],
      type:"",
      group:"Default",
      action:"",
      id:"",
      responseData: {
          data:null,
          success:false
      },
      parameters: null,
      requestHeader:[],
      requestPath:null,
      requestType:"POST",
      requestCredentials:"include",
      success:false
  }
}

export const boosRequestParametersTemplate = () => {
  return {
      page: 1,//页码数
      jobId: "6bb3a0333af8fed01HNz2tu9E1ZQ",//职位标签id 比如java=6bb3a0333af8fed01HNz2tu9E1ZQ ｜不限 “”
      keywords: undefined,//搜索关键字
      tag:undefined,
      city:101020100,//城市代码
      gender:-1,//**性别**  ｜ 不限“-1” ｜ 男“1” ｜ 女“0”
      experience:"-1,-1",//**工作经验**  ｜ 不限“-1,-1” ｜在校/应届“-3,-3” ｜1-3年“1,3” ｜3-5年“3,5” ｜5-10年“5,10” ｜ 自定义2-8年“2,8”
      salary:"-1,-1", //**薪资**  ｜ 不限“-1,-1” ｜ 3k-8k“3,8” ｜2k-不限 “2,-1”
      age:"-1,-1", //**年龄** ｜不限“-1,-1” ｜ 20-25 “20,25” ｜ 30-35 “30,35” ｜ 50以上 “50,-1” ｜ 自定义21-28年“21,28”
      schoolLevel:"-1",//**院校** ｜ 不限“-1” ｜统招本科“1101” ｜ 双一流院校“1102”｜ 211院校“1103”｜ 985院校“1104”｜ 留学生“1105”｜ QS 100“1107”｜ QS 500“1106”｜
      applyStatus:"-1",//**在职状态** ｜ 不限“-1” ｜ 离职-随时到岗“701” ｜ 在职-暂不考虑“702” ｜ 在职-考虑机会“703” ｜ 在职-月内到岗“704”
      degree:"203,201",//**学历** ｜不限“201,201” ｜ 本科及以上“203,201”｜ 硕士及以上“204,201”｜博士“205,205” -----初中及以下-博士“209,205” ｜ 中专/中技-博士“208,205” ｜ 高中-博士“206,205” ｜ 大专-博士“202,205” ｜ 本科-博士 “203,205” ｜ 硕士-博士 “204,205”
      switchFreq:0,
      manageExperience:0,
      geekJobRequirements:0,
      exchangeResume:0,
      viewResume:0,
      firstDegree:0,
      queryAnd:0,
      companyNamesForHunter:undefined,
      companySearchTypeForHunter:0,
      source:4,
      majorCodes:undefined,//专业--理论上boos独有的 是专业代码
      activeness:0,
      certificates:undefined,
      certificateNames:undefined,
      filterParams:{"sortType":1,"region":{"cityCode":101020100,"cityName":"上海","areas":[]},"overSeaWorkExperience":0,"overSeaWorkLanguage":0,"manageExperience":0},//需要搜索的城市
      defaultCondition:2,
      select:true
  }
}