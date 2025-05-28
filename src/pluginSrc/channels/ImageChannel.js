import { pluginEnableImageCapture } from "src/pluginSrc/config/PluginRequestManager";
import {i360Request} from "src/pluginSrc/util/BasePluginManager";


export const enableImageCapture = async (urls) => {
  const channelsMap = urls.reduce((channels, item) => {
    channels[item.id] = item.channel
    return channels
  }, {})
  
  return new Promise(async (resolve, reject) => {
    try {
      let config = pluginEnableImageCapture();
      let response = await i360Request(config.action, { ...config, parameters: urls }, urls.length * 8000);

      let data = {}
      if(Object.entries(response?.responseData?.data).length > 0) {
        for (const [id, base64Str] of Object.entries(response?.responseData?.data)) {
          data[id] = {
            base64: base64Str,
            channel: channelsMap[id],
          }
        }
      }
      resolve(data);
    } catch (error) {
      reject(error);
    }
  })
}


/**
 * 拼接 base64 数组并转换为 File 对象
 * @param {Array<string>} base64Array - base64 字符串数组
 * @param {string} fileName - 输出文件名
 * @param {string} mimeType - 文件类型，默认 'image/png'
 * @returns {Promise<File>} 返回 File 对象
 */
export async function mergeBase64ToFile(base64Array, fileName, mimeType = 'image/png') {
  try {
      if (!base64Array || base64Array.length === 0) {
          throw new Error('base64Array 不能为空');
      }

      console.log(base64Array, 'base64Array');
      
      // 1. 将 base64 转换为 Blob
      const blobs = await Promise.all(
          base64Array.map(base64 => base64ToBlob(base64))
      );
      console.log('转换后的 blobs:', blobs);

      return await mergeImagesVertically(base64Array, fileName, mimeType)
   
  } catch (error) {
      console.error('合并 base64 失败:', error);
      throw error;
  }
}

// base64 转 Blob 的辅助函数
function base64ToBlob(base64) {
  try {
      // 分离 MIME 类型和 base64 数据
      const [header, data] = base64.split(',');
      const mimeString = header.split(':')[1].split(';')[0];
      const byteString = atob(data);

      // 创建 ArrayBuffer 和 Uint8Array
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);

      // 填充数据
      for (let i = 0; i < byteString.length; i++) {
          ia[i] = byteString.charCodeAt(i);
      }

      // 创建 Blob
      return new Blob([ab], { type: mimeString });
  } catch (error) {
      console.error('base64 转换失败:', error);
      throw error;
  }
}

async function mergeImagesVertically(base64Array, fileName, mimeType) {
  // 1. 加载所有图片
  const images = await Promise.all(base64Array.map(src => {
      return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = src;
      });
  }));

  // 2. 计算合成后画布的宽高
  const width = Math.max(...images.map(img => img.width));
  const height = images.reduce((sum, img) => sum + img.height, 0);

  // 3. 创建 canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // 4. 依次绘制图片
  let offsetY = 0;
  for (const img of images) {
      ctx.drawImage(img, 0, offsetY, img.width, img.height);
      offsetY += img.height;
  }

  // 5. 导出合成后的图片
  return new Promise((resolve) => {
      canvas.toBlob(blob => {
          const file = new File([blob], fileName, { type: mimeType });
          resolve(file);
      }, mimeType);
  });
}