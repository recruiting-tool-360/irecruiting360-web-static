import { pluginEnableImageCapture } from "src/pluginSrc/config/PluginRequestManager";
import {i360Request} from "src/pluginSrc/util/BasePluginManager";
import html2canvas from 'html2canvas';

export const enableImageCapture = async (urls) => {
  const channelsMap = urls.reduce((channels, item) => {
    channels[item.id] = {
      channel: item.channel,
      url: item.url,
      type: item.type,
      name: item.name,
      gender: item.gender
    }
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
            ...channelsMap[id],
          }
        }
      }

      console.log("获取data");
      
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

      // console.log(base64Array, 'base64Array');
      
      // 1. 将 base64 转换为 Blob
      const blobs = await Promise.all(
          base64Array.map(base64 => base64ToBlob(base64))
      );
      // console.log('转换后的 blobs:', blobs);

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


// 智能等待内容渲染完成
const waitForContentReady = async (container, maxWait = 2000) => {
  return new Promise((resolve) => {
    let lastHeight = 0;
    let stableCount = 0;
    const startTime = Date.now();
    
    const checkStability = () => {
      const currentHeight = container.scrollHeight;
      
      // 检查是否超时
      if (Date.now() - startTime > maxWait) {
        console.log('等待渲染超时，使用当前状态');
        resolve();
        return;
      }
      
      // 检查高度是否稳定
      if (currentHeight === lastHeight) {
        stableCount++;
        // 连续3次检查高度相同，认为渲染完成
        if (stableCount >= 3) {
          // console.log(`内容渲染完成，最终高度: ${currentHeight}px`);
          resolve();
          return;
        }
      } else {
        stableCount = 0;
        lastHeight = currentHeight;
      }
      
      // 继续检查
      setTimeout(checkStability, 50);
    };
    
    // 最小等待100ms，确保DOM更新
    setTimeout(checkStability, 100);
  });
};

// 全局容器缓存
let globalContainer = null;
let containerInUse = false;

// 获取或创建复用容器
const getReusableContainer = (width) => {
  if (!globalContainer) {
    globalContainer = document.createElement('div');
    Object.assign(globalContainer.style, {
      position: 'absolute',
      left: '-9999px',
      top: '-9999px',
      padding: '0px',
      boxSizing: 'border-box',
      backgroundColor: 'white',
      zIndex: '-1',
      height: "fit-content",
    });
    document.body.appendChild(globalContainer);
  }
  
  // 更新宽度
  globalContainer.style.width = `${width}px`;
  return globalContainer;
};

// 清理全局容器
const cleanupGlobalContainer = () => {
  if (globalContainer && globalContainer.parentNode) {
    document.body.removeChild(globalContainer);
    globalContainer = null;
  }
};

// 批量处理HTML转图片
export const batchHtmlToImageBase64 = async (htmlArray, options = {}) => {
  const {
    width = 790,
    scale = 1
  } = options;

  console.log(`开始批量转换${htmlArray.length}个HTML为图片...`);
  
  const results = [];
  const container = getReusableContainer(width);
  
  try {
    for (let i = 0; i < htmlArray.length; i++) {
      console.log(`批量处理第${i + 1}/${htmlArray.length}个HTML...`);
      
      // 清空容器内容
      container.innerHTML = htmlArray[i];
      
      // 等待内容渲染
      await waitForContentReady(container);
      
      const realHeight = container.scrollHeight;
      const realWidth = container.scrollWidth;
      const viewHeight = realHeight > 1200 ? 1200 : realHeight;
      
      const count = Math.ceil(realHeight / viewHeight);
      const base64List = [];
      
      for (let j = 0; j < count; j++) {
        const canvas = await html2canvas(container, {
          scale: scale,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#fff',
          width: realWidth,
          height: j === (count - 1) ? (realHeight - ((count - 1) * viewHeight)) : viewHeight,
          y: j * viewHeight
        });
        
        const base64 = canvas.toDataURL('image/png', 0.9);
        base64List.push(base64);
      }
      
      results.push(JSON.stringify(base64List));
      
      // 添加小延迟避免浏览器资源冲突
      if (i < htmlArray.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log('批量转换完成:', results.length);
    return results;
    
  } catch (error) {
    console.error('批量转换失败:', error);
    throw error;
  }
};

// 将HTML渲染为图片并转换为base64 (分片版本) - 优化版
export const htmlToImageBase64 = async (htmlString, options = {}) => {
  const {
    width = 790,
    scale = 1
  } = options;

  // 如果容器正在使用，等待一下
  while (containerInUse) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  
  containerInUse = true;
  
  try {
    const container = getReusableContainer(width);
    
    // 添加HTML内容
    container.innerHTML = htmlString;

    // 等待内容渲染
    await waitForContentReady(container);

    const realHeight = container.scrollHeight;
    const realWidth = container.scrollWidth;
    const viewHeight = realHeight > 1200 ? 1200 : realHeight;
    
    const count = Math.ceil(realHeight / viewHeight);
    const base64List = [];

    for (let i = 0; i < count; i++) {
      const canvas = await html2canvas(container, {
        scale: scale,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#fff',
        width: realWidth,
        height: i === (count - 1) ? (realHeight - ((count - 1) * viewHeight)) : viewHeight,
        y: i * viewHeight
      });
      
      const base64 = canvas.toDataURL('image/png', 0.9);
      base64List.push(base64);
    }

    console.log('转换完成，分片数量:', base64List.length);
    
    // 返回base64数组的JSON字符串
    return JSON.stringify(base64List);
    
  } catch (error) {
    console.error('html2canvas分片处理失败:', error);
    
    // fallback到HTML base64
    const htmlBase64 = btoa(unescape(encodeURIComponent(htmlString)));
    return `data:text/html;base64,${htmlBase64}`;
  } finally {
    containerInUse = false;
  }
};