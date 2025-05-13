import { boot } from 'quasar/wrappers'
import { createI18n } from 'vue-i18n'
import { Quasar } from 'quasar';
import langZhCn from 'quasar/lang/zh-CN';
import messages from 'src/i18n'

const i18n = createI18n({
  // locale: 'en-US',
  locale: 'zh-CN',
  messages
})
export default boot(({ app }) => {
  // Set i18n instance on app
  Quasar.lang.set(langZhCn);
  app.use(i18n)
})

// 导出 i18n 实例
export { i18n };