import { boot } from 'quasar/wrappers'
import IframeMessenger from 'src/util/iframeMessenger'

export default boot(({ app }) => {
  // 初始化 IframeMessenger
  const iframeMessenger = new IframeMessenger({
    targetWindow: window.parent,
    targetOrigin: [
      'http://192.168.50.225:3000',
      'http://192.168.0.102:3000',
      'https://ambulance1a.ihr360.com', // ihr环境
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