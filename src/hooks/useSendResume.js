import { unref, computed, getCurrentInstance } from 'vue';
import { useStore } from 'vuex';
import { mergeBase64ToFile } from 'src/pluginSrc/channels/ImageChannel';
import { bossDomGenerator } from 'src/hooks/bossDomGenerator';
import { zhiLianDomGenerator } from 'src/hooks/zhiLianDomGenerator';
import { job51DomGenerator } from 'src/hooks/job51DomGenerator';
import {getChannelUrl} from "src/pluginSrc/util/ChannelUrlUtil";
import { zhiLianFindJobDetail } from 'src/pluginSrc/channels/ZhiLianJobInfoManager.js';
import { getResumeFileConfig, shouldGenerateHtml } from 'src/config/resumeFileConfig.js';
import { minifyHtml, getCompressionInfo, lightMinify, deepMinify } from 'src/utils/htmlMinifier.js';
import { formatName } from 'src/util/index.js';

/**
 * 将HTML字符串转换为HTML文件
 * @param {string} htmlContent - HTML内容
 * @param {string} fileName - 文件名
 * @returns {File} HTML文件对象
 */
function createHtmlFile(htmlContent, fileName, cssContent) {
  const config = getResumeFileConfig();
  
  // 创建完整的HTML文档结构
  let fullHtmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${fileName.replace('.html', '')}</title>
    <style>
        ${cssContent}
        ${config.html.includePrintStyles ? `
        @media print {
            body { 
                background: white !important; 
                -webkit-print-color-adjust: exact;
            }
            .resume-container { 
                box-shadow: none !important;
                max-width: none !important;
                margin: 0 !important;
                border-radius: 0 !important;
            }
        }` : ''}
    </style>
</head>
<body>
    <div class="resume-container">
        ${htmlContent}
    </div>
</body>
</html>`;

  // 根据配置应用HTML压缩
  if (config.html.minify) {
    const originalSize = fullHtmlContent.length;
    console.log('开始压缩HTML...', { 
      fileName, 
      originalSize: `${originalSize} 字符`,
      minifyLevel: config.html.minifyLevel || 'standard'
    });

    // 根据压缩级别选择压缩方式
    switch (config.html.minifyLevel) {
      case 'light':
        fullHtmlContent = lightMinify(fullHtmlContent);
        break;
      case 'deep':
        fullHtmlContent = deepMinify(fullHtmlContent);
        break;
      default:
        // 标准压缩
        fullHtmlContent = minifyHtml(fullHtmlContent, {
          removeComments: true,
          removeRedundantWhitespace: true,
          preserveLineBreaks: false,
          collapseWhitespace: true,
          removeEmptyLines: true,
          trimLines: true,
          preservePreTags: true
        });
    }

    // 输出压缩信息
    const compressionInfo = getCompressionInfo(
      `<!DOCTYPE html><html><head></head><body>${htmlContent}</body></html>`, 
      fullHtmlContent
    );
    
    console.log('HTML压缩完成:', {
      fileName,
      ...compressionInfo,
      compressionLevel: config.html.minifyLevel || 'standard'
    });
  }

  console.log('生成HTML文件:', { 
    fileName, 
    fullHtmlContent,
    cssContent,
    finalSize: `${fullHtmlContent.length} 字符`,
    compressed: config.html.minify 
  });
  
  const blob = new Blob([fullHtmlContent], { type: 'text/html;charset=utf-8' });
  return new File([blob], fileName, { type: 'text/html' });
}

/**
 * 用于发送简历信息到父页面的 hook
 * @param {string} messageType - 要发送的消息类型
 * @param {Object} options - 配置选项（可选，将使用全局配置）
 * @returns {Function} sendResume
 */
export function useSendResume(messageType = 'resumeList', options = {}) {
  if (typeof messageType !== 'string') {
    throw new Error('messageType 必须为字符串类型');
  }
  
  // 使用全局配置，但允许通过options覆盖
  const config = getResumeFileConfig();
  const useHtmlFile = options.useHtmlFile !== undefined ? options.useHtmlFile : shouldGenerateHtml();
  
  const { proxy } = getCurrentInstance();

  // 解构修复后的函数
  const [bossResumeGenerateHtmlFiles, bossCssContent] = bossDomGenerator();
  const [zhiLianResumeGenerateHtmlFiles, zhiLianCssContent] = zhiLianDomGenerator();
  const [job51ResumeGenerateHtmlFiles, job51CssContent] = job51DomGenerator();

  const store = useStore();

  const getLatestPositionId = computed(() => store.getters.getLatestPositionId ?? '');

  const channelsEnum = {
    "boss直聘": "BOSS直聘",
    "猎聘": "猎聘",
    "前程无忧": "前程无忧",
    "智联招聘": "智联招聘",
  }
  
  /**
   * 发送简历信息到父页面
   * @param {Array|string} ids - 简历ID数组或单个ID
   * @param {Object} extraParams - 额外参数对象
   * @returns {Promise}
   */
  const sendResume = async (res, extraParams = {}) => {
    const iframeMessenger = proxy?.$iframeMessenger;
    if (!iframeMessenger) {
      throw new Error('iframeMessenger 未初始化');
    }
    console.log(res, "result-1");
    console.log('当前文件生成配置:', { useHtmlFile, fileType: config.fileType });
    
    let results = [];
    if(Object.entries(res).length > 0) {
      // 遍历 res 对象
      for (const [id, obj] of Object.entries(res)) {
        const { base64, htmlContent, fileType, channel, name, gender, ...args } = obj
        
        let file;
        const baseFileName = `${channel}-${formatName({ name, gender })}`;
        
        if (fileType === 'html' && htmlContent) {
          // 处理HTML文件
          const fileName = `${baseFileName}.html`;
          console.log('创建HTML文件:', fileName);
          file = createHtmlFile(
            htmlContent, 
            fileName, 
            channel === 'boss直聘' ? bossCssContent : 
              channel === '智联招聘' ? zhiLianCssContent : 
              channel === '前程无忧' ? job51CssContent : ''
          );
        } else if (base64) {
          // 处理图片文件（原有逻辑）
          const base64Array = Array.isArray(base64) ? base64 : JSON.parse(base64);
          console.log(base64Array, 'base64Array');
          
          const fileName = `${baseFileName}.${config.image.format}`;
          console.log('创建图片文件:', fileName);
          
          // 调用合并函数
          file = await mergeBase64ToFile(base64Array, fileName);
        } else {
          console.warn('无效的文件数据:', obj);
          continue;
        }

        results.push({
          id,
          file,
          channel: channelsEnum[channel],
          fileType: fileType || 'image',
          ...args,
        });
      }
    }

    const payload = {
      positionId: unref(getLatestPositionId),
      resumeFile: results,
      fileConfig: {
        type: useHtmlFile ? 'html' : 'image',
        count: results.length
      },
      ...extraParams
    };

    console.log('发送简历数据:', payload);
    return iframeMessenger.post(messageType, payload);
  };


  /**
   * 处理简历，主要功能是过滤出boss渠道和其他渠道。
   * boss渠道本地生成简历，其他渠道插件获取简历（智联做特殊处理。查看当前是否有查看简历次数）
   * @param {*} allResume 
   * @param {*} isSingle 是否是单个导入查询相似简历
   */
  const handleResume = async (allResume, isSingle) => {
    const params = await Promise.all(allResume.map(async (resume) => {
      const url = getChannelUrl(resume);
      const { id, name, channel, type, gender, originalResumeUrlInfo, isMaster } = resume;
      return { url, id, channel, type, name, gender, originalResumeUrlInfo, isMaster };
    }));

    console.log(params, 'params');
    console.log('处理简历配置:', { useHtmlFile, fileType: config.fileType });

    let zlCount = 0;
    let zlMasterDel = false;
    
    // 分别收集不同渠道的参数
    const bossParams = [];
    const zhiLianParams = [];
    const job51Params = [];

    // 正确处理异步操作
    for (const param of params) {
      if(param.channel === 'boss直聘') {
        bossParams.push(param);
      } else if(param.channel === '智联招聘') {
        // 检查智联招聘简历是否可以查看
        const result = await zhiLianFindJobDetail(param);
        if(!result) {
          zlCount++;
          if(param?.isMaster) {
            zlMasterDel = true;
          }
        } else {
          zhiLianParams.push(param);
        }
      } else if(param.channel === '前程无忧') {
        job51Params.push(param);
      }
    }

    console.log('渠道分组结果:', { 
      boss: bossParams.length, 
      zhiLian: zhiLianParams.length, 
      job51: job51Params.length,
      zlCount 
    });
      
    // 单个操作处理智联逻辑，智联简历无次数后会过滤掉，防止过滤的是isMaster=true，添加保底
    if(isSingle && zlMasterDel) {
      if(zhiLianParams?.length > 0) {
        zhiLianParams[0].isMaster = true
      } else if(bossParams?.length > 0) {
        bossParams[0].isMaster = true
      } else if(job51Params?.length > 0) {
        job51Params[0].isMaster = true
      }
    }

    try {
      // 并行执行异步操作，避免阻塞
      const [bossRes, zhiLianRes, job51Res] = await Promise.all([
        bossParams?.length > 0 ? 
          bossResumeGenerateHtmlFiles(bossParams, isSingle).catch(error => {
            console.error('Boss简历生成失败:', error);
            return {}; // 返回默认值
          }) : Promise.resolve({}),
        zhiLianParams?.length > 0 ? 
          zhiLianResumeGenerateHtmlFiles(zhiLianParams, isSingle).catch(error => {
            console.error('智联简历生成失败:', error);
            return {}; // 返回默认值
          }) : Promise.resolve({}),
        job51Params?.length > 0 ? 
          job51ResumeGenerateHtmlFiles(job51Params, isSingle).catch(error => {
            console.error('前程无忧简历生成失败:', error);
            return {}; // 返回默认值
          }) : Promise.resolve({})
      ]);
      
      console.log('各渠道处理结果:', { 
        bossRes: Object.keys(bossRes).length, 
        zhiLianRes: Object.keys(zhiLianRes).length,
        job51Res: Object.keys(job51Res).length
      });
      
      return {
        data: Object.assign(bossRes, zhiLianRes, job51Res),
        filterZhiLianCount: zlCount
      }
    } catch (error) {
      throw error;
    }
  }

  return { sendResume, handleResume };
}