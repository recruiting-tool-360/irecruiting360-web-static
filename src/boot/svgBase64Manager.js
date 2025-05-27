import { boot } from 'quasar/wrappers'
import SvgBase64Class from 'src/util/svgBase64Manager'

export default boot(({ app }) => {
  const svgBase64Manager = new SvgBase64Class();
  app.config.globalProperties.$svgBase64Manager = svgBase64Manager;

  // 页面卸载前清理
  window.addEventListener('beforeunload', () => {
    svgBase64Manager.cleanupAll()
  })
})