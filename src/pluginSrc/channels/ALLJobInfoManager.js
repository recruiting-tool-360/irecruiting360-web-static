

import {querySearch} from "src/api/search/SearchApi";
import {createPageSearchRequest} from "src/pjo/dto/request/PageSearchConfig";

const channelKey = "ALL";


//全渠道列表查询
export const allChannelSearchList = async (page = 1, filterByRead, searchConditionId, chatId) => {
  let channelSearchConfig = {};
  let responseJobListData = null;
  try {
    let pageSearchRequest = createPageSearchRequest();
    pageSearchRequest.offset=page;
    pageSearchRequest.size =50;
    pageSearchRequest.channel = '全渠道';
    pageSearchRequest.filterByRead = filterByRead;
    pageSearchRequest.searchConditionId = searchConditionId;
    pageSearchRequest.chatId = chatId;
    responseJobListData = await allJobList(pageSearchRequest);
  }catch (e){
    console.log(e);
    return;
  }
  channelSearchConfig.channelPage = responseJobListData.data.offset;
  channelSearchConfig.channelDataTotal = responseJobListData.data.totalCount;
  channelSearchConfig.channelCountSize = 50;
  channelSearchConfig.dataList = responseJobListData.data.data;
  return channelSearchConfig;
}

//boss列表查询
const allJobList = async (pageSearchRequest) => {
 return await querySearch(pageSearchRequest);
}

