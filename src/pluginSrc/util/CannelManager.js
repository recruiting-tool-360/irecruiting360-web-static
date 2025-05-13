import {saveJobList, saveSearchPlus} from "src/api/jobList/JobListApi";

const saveJobListRequestTemplate =()=>{
  return {
    searchConditionId:null,
    outId:null,
    channel:null,
    resumeList:null
  }
}
// 保存渠道数据
export const channelDataSave = async (outId,searchConditionId,channel,channelList) => {
  let saveJobListRequest = saveJobListRequestTemplate();
  saveJobListRequest.outId = outId;
  saveJobListRequest.searchConditionId = searchConditionId;
  saveJobListRequest.channel = channel;
  saveJobListRequest.resumeList = channelList;
  let jobList;
  try {
    let {data:jobListData} = await saveJobList(saveJobListRequest);
    jobList = jobListData;
  }catch (e){
    console.log(e);
    return;
  }
  //处理id
  if(!jobList||jobList.length===0){
    return;
  }
  return jobList;
}
// 保存渠道数据
export const channelDataSavePlus = async (outId,searchConditionId,channel,channelList,chatId,isRead) => {
  let saveJobListRequest = saveJobListRequestTemplate();
  saveJobListRequest.outId = outId;
  saveJobListRequest.searchConditionId = searchConditionId;
  saveJobListRequest.channel = channel;
  saveJobListRequest.resumeList = channelList;
  saveJobListRequest.chatId = chatId;
  saveJobListRequest.filterByRead = isRead;
  let jobList;
  try {
    let {data:jobListData} = await saveSearchPlus(saveJobListRequest);
    jobList = jobListData;
  }catch (e){
    console.log(e);
    return;
  }
  //处理id
  if(!jobList||jobList.length===0){
    return;
  }
  return jobList;
}
