const { defineConfig } = require('@vue/cli-service')
const webpack = require('webpack');
module.exports = defineConfig({
  transpileDependencies: true,
  configureWebpack: {
    plugins: [
      new webpack.DefinePlugin({
        'process.env': {
          'NODE_ENV': JSON.stringify(process.env.NODE_ENV),
          'CHROME_API': JSON.stringify(true)
        }
      })
    ]
  },
  devServer:{
    proxy: {
      // '/api': {
      //   target: process.env.VUE_APP_API_BASE_URL+'/', // 你的后端接口地址
      //   changeOrigin: true,           // 是否更改请求的源地址
      //   ws: true,                     // 是否启用 WebSocket 代理
      //   pathRewrite: {
      //     '^/api': '',                // 重写路径，将 /api 去除
      //   },
      // },
    },
  },
})
