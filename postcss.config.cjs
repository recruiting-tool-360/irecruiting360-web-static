/* eslint-disable */
// https://github.com/michael-ciniawsky/postcss-load-config
//
// PostCSS 插件链（顺序敏感）：
//   1. tailwindcss  → 把 `@tailwind` 指令展开成生成的 utility 类（JIT 按 tailwind.config.js content 扫描）
//   2. autoprefixer → 给 CSS 加浏览器前缀
//
// 用对象格式（key=插件名，value=options 对象）让 PostCSS loader 自动 require + invoke

module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {
      overrideBrowserslist: [
        'last 4 Chrome versions',
        'last 4 Firefox versions',
        'last 4 Edge versions',
        'last 4 Safari versions',
        'last 4 Android versions',
        'last 4 ChromeAndroid versions',
        'last 4 FirefoxAndroid versions',
        'last 4 iOS versions'
      ]
    }
    // https://github.com/elchininet/postcss-rtlcss
    // If you want to support RTL css, uncomment and `yarn add -D postcss-rtlcss`
    // 'postcss-rtlcss': {}
  }
};
