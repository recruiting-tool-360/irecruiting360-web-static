import {saveJobList} from "src/api/jobList/JobListApi";
// 任务化迁移：channelDataSavePlus 已经**完全用任务侧 /search/taskChannel/{tcId}/results 取代
// 老业务接口 /search/saveSearchPlus**。
//
// 老接口写两份表（业务库 condition_resume + 任务库 task_resume），新流程只写任务库，统一数据源。
// jobList 由 postBatchResultsToTaskChannel 从 /results 响应的 taskResumes[i].resume（ResumeBlindVO
// 投影）组装好返回，跟老 saveSearchPlus 的 jobList 形态保持兼容。
import { postBatchResultsToTaskChannel } from "./taskResumeBridge";

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
// 保存渠道数据（只调任务侧新接口 /search/taskChannel/{tcId}/results，**不再调老接口 saveSearchPlus**）
//
// jobList 由 postBatchResultsToTaskChannel 从后端响应的 taskResumes[i].resume（ResumeBlindVO 投影）
// 组装好返回，里面会带 taskResumeId / resumeBlindId / channel / 平摊的 resume 字段，
// 跟老 saveSearchPlus 时代的 jobList 形态保持兼容，业务方（BossJobInfo.vue 等）零侵入。
//
// finished=true 搜索一次拿完直接触发后端 completeChannel（搜索目前没有自动分页）。
// 推荐渠道分页加载时不走这里，由 BossRecommendData 自己分批传 finished=false。
export const channelDataSavePlus = async (outId, searchConditionId, channel, channelList, chatId, isRead) => {
  // outId 参数留着是为了不改业务方的调用签名；任务侧 /results 不需要这个字段
  void outId;
  try {
    const jobList = await postBatchResultsToTaskChannel({
      chatId,
      channelDesc: channel,        // "boss直聘" / "智联招聘" / "前程无忧" / "猎聘"
      resumeList: channelList,
      searchConditionId,
      filterByRead: isRead,
      finished: true               // SEARCH 一次拿完，直接 true 触发 completeChannel
    });
    return Array.isArray(jobList) ? jobList : [];
  } catch (e) {
    console.warn('[CannelManager] channelDataSavePlus failed:', e?.message || e);
    return [];
  }
}
