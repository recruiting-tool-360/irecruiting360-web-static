import { boot } from 'quasar/wrappers'
import IframeMessenger from 'src/util/iframeMessenger'

export default boot(({ app }) => {
  // 初始化 IframeMessenger
  const iframeMessenger = new IframeMessenger({
    targetWindow: window.parent,
    targetOrigin: [
      'http://192.168.50.225:3000', // 纳速码本地ip
      'http://192.168.110.200:3000', // ihr本地ip
      "http://192.168.0.103:3000", // 公寓
      'http://192.168.0.102:3000',
      'https://ambulance1a.ihr360.com', // ihr环境
      'https://passport-qa2.ihr360.com', // qa2
      'https://uatstable.ihr360.com', // uatstable
      'https://qa2-vip.ihr360.com', // qa2-vip
      'https://account.ihr360.com', // 账号中心
      'https://v5.ihr360.com', // 线上
    ],
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