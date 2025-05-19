import {pluginAllUrls} from "src/pluginSrc/config/PluginRequestManager";
import qs from "qs";

export const getChannelUrl = (resume) => {
  return channelConfig.find(item=>item.channel===resume.channel).fn(resume)
}

export const bossUrl = (resume) => {
  const requestParams = JSON.parse(resume.originalResumeUrlInfo);
  return pluginAllUrls.BOSS.geekDetailUrl+`?isInnerAccount=0&isResume=1&isPreview=0&status=5&jobId=-1&securityId=${requestParams.request.securityId}`;
}

export const zhilianUrl = (resume) => {
  const requestParams = JSON.parse(resume.originalResumeUrlInfo);
  const requestData ={
    "t": requestParams.request.t,
    "resumeNumber": requestParams.request.resumeNumber,
    "k": requestParams.request.k
  }
  return pluginAllUrls.ZHILIAN.baseUrl+pluginAllUrls.ZHILIAN.geekDetailUrl+`?`+qs.stringify(requestData);
}

export const liepinUrl = (resume) => {
  const requestParams = JSON.parse(resume.originalResumeUrlInfo);
  return requestParams.request.resumeUrl;
}

export const job51Url = (resume) => {
  const requestParams = JSON.parse(resume.originalResumeUrlInfo);
  const userid=requestParams.request.userid;
  const requestid=requestParams.request.requestid;
  const keyWord =requestParams.request.keyWord;
  const requestData ={
    resumeId:userid,
    requestId:requestid,
    keyword:keyWord
  }
  return pluginAllUrls.JOB51.geekDetailUrl+`?`+qs.stringify(requestData);
}

const channelConfig=[
  {
    channel:'boss直聘',
    fn:bossUrl
  },
  {
    channel:'智联招聘',
    fn:zhilianUrl
  },
  {
    channel:'猎聘',
    fn:liepinUrl
  },
  {
    channel:'前程无忧',
    fn:job51Url
  }
]
