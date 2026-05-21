/**
 * Tailwind CSS 3.x 配置
 *
 * 用途：渲染后端 SSE 推送过来的富文本卡片 HTML（scenario='CHAT'，messageType='TASK_COMPLETION_CARD'），
 * 后端 HTML 已经用了大量 Tailwind 类名（含 arbitrary value：`bg-[#15B8A6]` / `text-[15px]` / `rounded-[8px]` ...），
 * 前端要装 Tailwind 把这些类编译成实际样式。
 *
 * 难点：Tailwind 3 的 JIT 通过**静态扫描源文件字符串**决定生成哪些类。
 *      后端 HTML 是运行时通过 v-html 注入的，根本不在 src/ 目录里 → JIT 扫不到 → 类名失效。
 *
 * 解决：把后端模板的 HTML 副本放到 `src/server-html-templates/*.html`，让 JIT 静态扫描这些副本，
 *      就能正确生成所需 CSS。后续后端新增卡片类型时，把对应 HTML 复制一份过来即可。
 *
 * 命名冲突：Quasar 已有大量类名（q-pa-md 等），跟 Tailwind 不冲突；但 Tailwind 的 `container`
 *      可能跟其他东西冲突 —— 用 corePlugins 关掉避免。
 */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}',
    './src/server-html-templates/**/*.html'
  ],
  // 跟 Quasar 共存：不要把 reset (preflight) 用上，避免覆盖 q-page / 字体等基础样式
  // 只保留 components + utilities，让 Tailwind 类按需注入而不破坏 Quasar 基础布局
  corePlugins: {
    preflight: false,
    container: false
  },
  theme: {
    extend: {
      colors: {
        // 后端 HTML 里出现的语义色（如 decoration-primary-200 / text-primary-500），
        // 这里给 primary 一个简单调色板（按 Tailwind 默认 teal 近似 #15B8A6）
        primary: {
          50: '#F0FDFA',
          100: '#CCFBF1',
          200: '#99F6E4',
          300: '#5EEAD4',
          400: '#2DD4BF',
          500: '#15B8A6',
          600: '#0D9488',
          700: '#0F766E',
          800: '#115E59',
          900: '#134E4A'
        }
      }
    }
  },
  plugins: []
};
