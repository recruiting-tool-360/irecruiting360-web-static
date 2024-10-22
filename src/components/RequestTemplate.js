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
      parameters: {},
      success:false
  }
}

export const boosRequestParametersTemplate = () => {
  return {
      page: 1,
      jobId: "6bb3a0333af8fed01HNz2tu9E1ZQ",
      keywords: undefined,
      tag:undefined,
      city:101020100,
      gender:-1,
      experience:"-1,-1",
      salary:"-1,-1",
      age:"-1,-1",
      schoolLevel:"-1",
      applyStatus:"-1",
      degree:"203,201",
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
      majorCodes:undefined,
      activeness:0,
      certificates:undefined,
      certificateNames:undefined,
      filterParams:{"sortType":1,"region":{"cityCode":101020100,"cityName":"上海","areas":[]},"overSeaWorkExperience":0,"overSeaWorkLanguage":0,"manageExperience":0},
      defaultCondition:2,
      select:true
  }
}