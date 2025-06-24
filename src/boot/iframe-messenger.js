import { boot } from 'quasar/wrappers'
import IframeMessenger from 'src/util/iframeMessenger'

const targetOrigin = [
  'http://192.168.50.225:3000', // 本地ip

  'https://ambulance1a.ihr360.com', // ihr环境
  'https://passport-qa2.ihr360.com', // qa2
  'https://uatstable.ihr360.com', // uatstable
  'https://qa2-vip.ihr360.com', // qa2-vip
  'https://account.ihr360.com', // 账号中心
  'https://v5.ihr360.com', // 线上

  //钉钉
  //qa2
  'https://ding-qa2.ihr360.com',
  //uatstable
  'https://ding-uatstable.ihr360.com',
  // 线上
  'https://ding-isv.ihr360.com',

  //杭州云
  'https://ding-hangzhou.ihr360.com',
  'https://ding-hangzhou1.ihr360.com',
  'https://ding-hangzhou2.ihr360.com',
  'https://ding-hangzhou3.ihr360.com',
  'https://ding-hangzhou4.ihr360.com',
  'https://ding-hangzhou5.ihr360.com',
  'https://ding-hangzhou6.ihr360.com',
  'https://ding-hangzhou7.ihr360.com',
  'https://ding-hangzhou8.ihr360.com',
  'https://ding-hangzhou9.ihr360.com',
  'https://ding-hangzhou10.ihr360.com',
  'https://ding-hangzhou11.ihr360.com',
  'https://ding-hangzhou12.ihr360.com',
  'https://ding-hangzhou13.ihr360.com',
  'https://try-handy.com',
  'https://ding-hangzhou1.try-handy.com',
  'https://ding-hangzhou2.try-handy.com',
  'https://ding-hangzhou3.try-handy.com',
  'https://ding-hangzhou4.try-handy.com',
  'https://ding-hangzhou5.try-handy.com',
  'https://ding-hangzhou6.try-handy.com',
  'https://ding-hangzhou7.try-handy.com',
  'https://ding-hangzhou8.try-handy.com',
  'https://ding-hangzhou9.try-handy.com',
  'https://ding-hangzhou10.try-handy.com',
  'https://ding-hangzhou11.try-handy.com',
  'https://ding-hangzhou12.try-handy.com',
  'https://ding-hangzhou13.try-handy.com',
  'https://ding-hangzhou2.lethic.cn',
  'https://ding-hangzhou.lethic.cn',

  //钉钉isv
  'https://app45424.eapps.dingtalkcloud.com',
  'https://app117034.eapps.dingtalkcloud.com',

  // 北京云
  'https://ding-fzsm.ihr360.com',
  'https://ding-fzsm.try-handy.com',
  
  // 华为云
  'https://ding-hw.ihr360.com',
  'https://ding-hw.try-handy.com',

  // 企微or飞书
  // 杭州云
  'https://www.ihr360.com',
  //北京云
  'https://vip.ihr360.com',
  //华为云
  'https://hw.ihr360.com',
]

export default boot(({ app }) => {
  // 初始化 IframeMessenger
  const iframeMessenger = new IframeMessenger({
    targetWindow: window.parent,
    targetOrigin,
    sourceName: 'kuaizhao'
  })
  
  // 连接
  iframeMessenger.connect()
  // 挂载到全局
  app.config.globalProperties.$iframeMessenger = iframeMessenger
  // 页面卸载前清理
  window.addEventListener('beforeunload', () => {
    iframeMessenger.destroy()
  })
})