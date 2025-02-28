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
    proxy: process.env.NODE_ENV === 'development' ? {
      '/api': {
        target: process.env.VUE_APP_API_BASE_URL,
        changeOrigin: true,
        ws: true,
        pathRewrite: {
          '^/api': ''
        }
      }
    } : {}
  },
})
