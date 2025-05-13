import {convertSearchState} from "src/pjo/dto/request/SearchStateConfig";
import {convertSearchConditionRequest} from "src/pjo/dto/request/SaveSearchRequest";
import {getCurrentConditionByChatId} from "src/api/chat/ChatApi";

export const getSearchStateValues = (data) => {
  let convertSearchStateVal = convertSearchState(data);
  console.log("1.1",convertSearchStateVal)
  //处理工作年限边界
  const workElSliderValue = convertSearchStateVal.workElSliderValue;
  if(workElSliderValue.min===-1&&workElSliderValue.max===-1){
    workElSliderValue.min=-1;
    workElSliderValue.max=-1;
  }else{
    workElSliderValue.min = (workElSliderValue.min <= 0) ? 0 : workElSliderValue.min;
    workElSliderValue.max = (workElSliderValue.max <= 0) ? 11 : workElSliderValue.max;
  }
  if(workElSliderValue.min===0&&workElSliderValue.max===11){
    workElSliderValue.min=-1;
    workElSliderValue.max=-1;
  }
  convertSearchStateVal.workElSliderValue = workElSliderValue;
  //处理年龄边界
  const ageElSliderValue = convertSearchStateVal.ageElSliderValue;
  if(ageElSliderValue.min===-1&&ageElSliderValue.max===-1){
    ageElSliderValue.min=-1;
    ageElSliderValue.max=-1;
  }else{
    ageElSliderValue.min = (ageElSliderValue.min <= 15) ? 15 : ageElSliderValue.min;
    ageElSliderValue.max = (ageElSliderValue.max <= 15) ? 51 : ageElSliderValue.max;
  }
  if(ageElSliderValue.min===15&&ageElSliderValue.max===51){
    ageElSliderValue.min=-1;
    ageElSliderValue.max=-1;
  }
  convertSearchStateVal.ageElSliderValue = ageElSliderValue;
  console.log(convertSearchStateVal)
  return convertSearchStateVal;
}


//获取搜索条件
export const getSearchConditionRequest = (data,chatId,userId,searchChannels) => {
  const copyData = JSON.parse(JSON.stringify(data))
  const searchDto = copyData;
  //处理工作年限边界
  const workElSliderValue = searchDto.workElSliderValue;
  workElSliderValue.min = (workElSliderValue.min <=0||workElSliderValue.min >10) ? workElSliderValue.min = -1 : workElSliderValue.min;
  workElSliderValue.max = (workElSliderValue.max <=0||workElSliderValue.max >10) ? workElSliderValue.max = -1 : workElSliderValue.max;
  //处理年龄边界
  const ageElSliderValue = searchDto.ageElSliderValue;
  ageElSliderValue.min = (ageElSliderValue.min <=15||ageElSliderValue.min >50) ? ageElSliderValue.min = -1 : ageElSliderValue.min;
  ageElSliderValue.max = (ageElSliderValue.max <=15||ageElSliderValue.max >50) ? ageElSliderValue.max = -1 : ageElSliderValue.max;
  //用户id
  // searchState.value.userId=1;
  //处理其他参数
  let searchConditionRequest = convertSearchConditionRequest(searchDto);
  searchConditionRequest.searchChannels = searchChannels
  searchConditionRequest.experienceFrom = workElSliderValue.min;
  searchConditionRequest.experienceTo = workElSliderValue.max;
  searchConditionRequest.ageFrom = ageElSliderValue.min;
  searchConditionRequest.ageTo = ageElSliderValue.max;
  //用户信息
  searchConditionRequest.userId=userId;
  searchConditionRequest.chatId=chatId;
  console.log(searchConditionRequest)
  return searchConditionRequest;
}


//获取搜索条件
const getChatConditionRequest = async (chatId) => {
  try {
    let response = await getCurrentConditionByChatId(chatId);
    if (response && response.data) {
      return response.data;
    } else {
      console.warn('API 返回的数据为空');
      return null;
    }
  } catch (error) {
    console.error('获取聊天条件出错:', error);
    return null;
  }
}


