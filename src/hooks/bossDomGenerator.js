import { getCurrentInstance } from 'vue';
import { getResumeBlindList } from "src/api/jobList/JobListApi";
import { bossFindJobDetail } from "src/pluginSrc/channels/BossJobInfoManager";
import { batchHtmlToImageBase64, htmlToImageBase64 } from 'src/pluginSrc/channels/ImageChannel';
import { getOptimizedConfig } from 'src/config/performanceConfig';
import { performanceMonitor } from 'src/utils/performanceMonitor';
import { getResumeFileConfig } from 'src/config/resumeFileConfig.js';
import { minifyHtml, lightMinify, deepMinify } from 'src/utils/htmlMinifier.js';
import { formatName } from 'src/util/index.js';


// 清除HTML标签函数
function stripHtmlTags(text) {
  if (!text) return '';
  return text.replace(/<[^>]*>/g, '');
}

export function bossDomGenerator() {
  const { proxy } = getCurrentInstance();
  const svgToBase64 = proxy.$svgBase64Manager;

  const cssContent = `
    body {
      margin: 0;
      padding: 20px;
      font-family: 'PingFang SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: #f5f5f5;
    }
    .resume-container {
      max-width: 790px;
      margin: 0 auto;
      background: white;
      box-shadow: 0 0 10px rgba(0,0,0,0.1);
      border-radius: 8px;
      overflow: hidden;
    }`

  // 生成Boss简历完整页面
  // overrideName：来自推荐/搜索列表的**真实姓名**（如「陈俊胜」）。BOSS 详情接口里 baseInfo.name 是
  //   打码的「陈**」→ formatName 后变「陈先生」，后端解析简历正文拿到的就是「陈先生」。
  //   这里用列表里的真实姓名覆盖正文姓名，保证加入人才库后显示真实姓名。
  const generateBossResume = async(resumeJsonStr, overrideName) => {
    const config = getResumeFileConfig();
    
    try {
      const data = JSON.parse(resumeJsonStr);
      const { geekDetail } = data;
      const baseInfo = geekDetail.geekBaseInfo;
      // 真实姓名优先（非空、且不是打码的「**」）；否则回退详情里的（可能打码的）姓名
      const realName =
        overrideName && !String(overrideName).includes('**') ? String(overrideName).trim() : '';
      const displayName = realName || formatName(baseInfo);
      const workExpList = geekDetail.geekWorkExpList;
      const projExpList = geekDetail.geekProjExpList;
      const eduExpList = geekDetail.geekEduExpList;
      const honorList = geekDetail.geekHonorList;
      const professionalSkill = geekDetail.professionalSkill;
      const genderSvgUrl = await svgToBase64?.getSvgBase64(baseInfo.gender === 1 ? '/index/header/icons/geekMan.svg' : '/index/header/icons/geekWoman.svg');

      let htmlContent = `
        <div style="width: auto; background: #fff; font-family: 'PingFang SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #333; line-height: 1.6; padding: 30px; box-sizing: border-box;font-size: 13px;">
          
          <!-- 基本信息部分 -->
          <div style="display: flex;align-items: start;gap: 10px;">
            <div style="width: 56px; height: 56px;border-radius: 50%;overflow: hidden;background: #ccc;">
              <img src="${genderSvgUrl}" width="56" alt="logo" class="logo" style="object-fit: cover;object-position: center;">
            </div>
            <div style="margin-left: 20px;flex:1;">
              <div>
                <span style="font-size: 20px;color: #1f262e;">${displayName}</span>
                <span style="color: #363f4d;margin: 0 4px;">${baseInfo.gender === 1 ? '男' : '女'}</span>
              </div>
              <div style="margin-top: 6px;">
                <span style="color: #363f4d;">${baseInfo.ageDesc ? baseInfo.ageDesc + '｜' : ''}</span>
                <span style="color: #363f4d;">${baseInfo.workYearDesc}｜</span>
                <span style="color: #363f4d;">${baseInfo.degreeCategory}｜</span>
                <span style="color: #363f4d;">${baseInfo.applyStatusContent}</span>
              </div>
              <!-- 自我描述 -->
              <div style="margin-top: 6px;">
                <p style="color: #363f4d; white-space: pre-line;line-height: 1.6;">${stripHtmlTags(baseInfo.userDesc)}</p>
              </div>
            </div>
          </div>  

          <!-- 工作经历 -->
          ${workExpList && workExpList.length > 0 ? `
            <div style="display: flex; align-items: start; margin-top: 30px;">

              <h4 style="font-size: 14px; color:#171d26;font-weight: bold;margin: 4px 0 0 0;">工作经历</h4>

              <div style="margin-left: 30px; flex: 1;">
                ${workExpList.map(work => `
                  <div style="margin-bottom: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                      <div style="display: flex;justify-content: center;align-items: center;">
                        <h3 style="font-size: 14px; font-weight: bold; margin: 0 0 4px 0; color: #171d26;margin: 0;">
                          ${work.company}
                        </h3>
                        <span style="margin: 0 10px;color: #ccc;">|</span>
                        <h3 style="font-size: 14px; font-weight: bold; margin: 0 0 4px 0; color: #171d26;margin: 0;">
                          ${work.positionName}${work.department ? ' · ' + work.department : ''}
                        </h3>
                      </div>
                      <span style="color: #363f4d; font-size: 13px; white-space: nowrap; margin-left: 20px;">
                        ${work.startYearMonStr} - ${work.endYearMonStr}
                      </span>
                    </div>
                    ${work.responsibility ? `
                      <div style="margin-bottom: 12px;">
                        <p style="margin: 0; line-height: 1.6; color: #555; font-size: 13px; white-space: pre-line;">${stripHtmlTags(work.responsibility)}</p>
                      </div>
                    ` : ''}
                    ${work.workEmphasisList && work.workEmphasisList.length > 0 ? `
                      <div style="margin-top: 12px;">
                        ${work.workEmphasisList.map(skill => `
                          <span style="display: inline-block; background: #f5f5f5; color: #363f4d; padding: 2px 8px; border-radius: 4px; font-size: 12px; margin-right: 8px; margin-bottom: 4px;">
                            ${stripHtmlTags(skill)}
                          </span>
                        `).join('')}
                      </div>
                    ` : ''}
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <!-- 项目经验 -->
          ${projExpList && projExpList.length > 0 ? `
            <div style="display: flex; align-items: start; margin-top: 30px;">

              <h4 style="font-size: 14px; color:#171d26;font-weight: bold;margin: 4px 0 0 0;">项目经验</h4>

              <div style="margin-left: 30px; flex: 1;">
                ${projExpList.map(project => `
                  <div style="margin-bottom: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                      <div style="display: flex;justify-content: center;align-items: center;">
                        <h3 style="font-size: 14px; font-weight: bold; margin: 0 0 4px 0; color: #171d26;margin: 0;">
                          ${project.name}
                        </h3>
                        <span style="margin: 0 10px;color: #ccc;">|</span>
                        <h3 style="font-size: 14px; font-weight: bold; margin: 0 0 4px 0; color: #171d26;margin: 0;">
                          ${project.roleName}
                        </h3>
                      </div>
                      <span style="color: #363f4d; font-size: 13px; white-space: nowrap; margin-left: 20px;">
                        ${project.startYearMonStr} - ${project.endYearMonStr}
                      </span>
                    </div>
                    ${project.description ? `
                      <div style="margin-bottom: 12px;">
                        <p style="margin: 0; line-height: 1.6; color: #555; font-size: 13px; white-space: pre-line;">${stripHtmlTags(project.description)}</p>
                      </div>
                    ` : ''}
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <!-- 教育经历 -->
          ${eduExpList && eduExpList.length > 0 ? `
            <div style="display: flex; align-items: start; margin-top: 30px;">

              <h4 style="font-size: 14px; color:#171d26;font-weight: bold;margin: 4px 0 0 0;">教育经历</h4>

              <div style="margin-left: 30px; flex: 1;">
                ${eduExpList.map(edu => `
                  <div style="margin-bottom: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                      <div style="display: flex;align-items: center;align-items: center;">
                        <h3 style="font-size: 14px; font-weight: bold; margin: 0 0 4px 0; color: #171d26;margin: 0;">
                          ${edu.school}
                        </h3>
                        <span style="margin: 0 10px;color: #ccc;">|</span>
                        <div style="color: #171d26; font-weight: bold; font-size: 14px;">
                          ${edu.major}
                          <span style="margin: 0 10px;color: #ccc;">|</span>
                          ${edu.degreeName} ${edu.eduType === 2 ? ' · 非全日制' : ''}
                        </div>
                      </div>
                      <span style="color: #363f4d; font-size: 13px; white-space: nowrap; margin-left: 20px;line-height: 50px;">
                        ${edu.startYearStr} - ${edu.endYearStr}
                      </span>
                    </div>
                    ${edu.eduDescription ? `
                      <div>
                      <div>在校经历：</div>
                      <p style="margin: 0; line-height: 1.6; color: #555; font-size: 13px; white-space: pre-line;">${stripHtmlTags(edu.eduDescription)}</p>
                      </div>
                    ` : ''}
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <!-- 所获荣誉 -->
          ${(honorList && honorList.length > 0) ? `
            <div style="display: flex; align-items: start; margin-top: 30px;">

              <h4 style="font-size: 14px; color:#171d26;font-weight: bold;margin: 4px 0 0 0;">所获荣誉</h4>

              <div style="margin-left: 30px; flex: 1;">
                ${honorList && honorList.length > 0 ? honorList.map(honor => `
                  <div style="margin-bottom: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                      <div style="display: flex;align-items: center;">
                        <h3 style="font-size: 14px; font-weight: bold; margin: 0 0 4px 0; color: #171d26;margin: 0;">
                          ${honor?.honorName || ''}
                        </h3>
                      </div>
                    </div>
                  </div>
                `).join('') : ''}
              </div>
            </div>
          ` : ''}

          <!-- 专业技能 -->
          ${professionalSkill ? `
            <div style="display: flex; align-items: start; margin-top: 30px;">
 
              <h4 style="font-size: 14px; color:#171d26;font-weight: bold;margin: 0;">专业技能</h4>
 
              <div style="margin-left: 30px; flex: 1;">
                <div style="margin-bottom: 20px;">
                  <p style="margin: 0; line-height: 1.6; color: #555; font-size: 13px; white-space: pre-line;">${stripHtmlTags(professionalSkill)}</p>
                </div>
              </div>
            </div>
          ` : ''}

          <!-- boss声明 -->
          <div style="margin: 4px 0 0 86px;">
            <p style="margin: 0; line-height: 1.6; color: #aaaaaa; font-size: 12px; white-space: pre-line;">
              为妥善保护牛人在BOSS直聘平台提交、发布、展示的简历（包括但不限于在线简历、附件简历）中的个人信息（包括但不限于联系方式、期望职位、教育经历、工作经历等），任何用户原则上仅可出于自身招聘的目的，通过BOSS直聘平台在线浏览牛人简历。未经BOSS直聘及牛人本人书面授权，任何用户不得将牛人在BOSS直聘平台提交、发布、展示的简历中的个人信息，在任何第三方平台进行复制、使用、传播、存储。
            </p>
          </div>

        </div>
      `;

      // 根据配置应用压缩
      if (config.html.minify) {
        const originalSize = htmlContent.length;
        console.log('开始压缩简历HTML内容...', { 
          originalSize: `${originalSize} 字符`,
          minifyLevel: config.html.minifyLevel || 'standard'
        });

        // 根据压缩级别选择压缩方式
        switch (config.html.minifyLevel) {
          case 'light':
            htmlContent = lightMinify(htmlContent);
            break;
          case 'deep':
            htmlContent = deepMinify(htmlContent);
            break;
          default:
            // 标准压缩
            htmlContent = minifyHtml(htmlContent, {
              removeComments: true,
              removeRedundantWhitespace: true,
              preserveLineBreaks: false,
              collapseWhitespace: true,
              removeEmptyLines: true,
              trimLines: true,
              preservePreTags: true
            });
        }

        console.log('简历HTML内容压缩完成:', {
          originalSize: `${originalSize} 字符`,
          compressedSize: `${htmlContent.length} 字符`,
          savedBytes: originalSize - htmlContent.length,
          compressionLevel: config.html.minifyLevel || 'standard'
        });
      }

      return htmlContent;
    } catch (error) {
      console.error('解析简历数据失败:', error);
      return `
        <div style="width: 790px; background: #fff; padding: 30px; text-align: center; color: #666;">
          <p>简历数据解析失败</p>
        </div>
      `;
    }
  }

  // 简历信息直接生成HTML文件
  const resumeGenerateHtmlFiles = async(resumes, isSingle) => {
    performanceMonitor.start('resumeGenerateHtmlFiles');
    console.log('开始生成HTML文件...', resumes);
    
    if(resumes.length <= 0) return {}

    // 存储简历信息
    const maps = resumes.reduce((obj, {id, ...args}) => {
      obj[id] = args
      return obj
    }, {})

    let result = {
      data: []
    };

    performanceMonitor.start('dataFetching');
    if(isSingle) {
      console.log('单个相似简历模式开始获取数据...', resumes);
      result.data = await Promise.all(resumes.map(async (item) => {
        return {
          resumeBlindId: item.id,
          content: JSON.stringify(await bossFindJobDetail(item)),
        }
      }))
      console.log('单个相似简历模式获取到简历数据:', result);
    }else {
      console.log('批量简历开始获取简历数据...');
      result = await getResumeBlindList(Object.keys(maps))
      console.log('批量简历获取到简历数据:', result);
    }
    performanceMonitor.end('dataFetching', { resumeCount: result.data?.length || 0 });

    if (!result.data || result.data.length === 0) {
      performanceMonitor.end('resumeGenerateHtmlFiles', { success: false, reason: 'no_data' });
      return {}
    }

    performanceMonitor.start('htmlGeneration');
    console.log('开始生成HTML文件...');
    
    // 生成HTML内容（把列表里的真实姓名透传进去覆盖正文打码姓名）
    const htmlContents = await Promise.all(result.data.map(async (item) => {
      const html = await generateBossResume(item.content, maps[item.resumeBlindId]?.name);
      return {
        html,
        id: item.resumeBlindId,
      };
    }));
    
    performanceMonitor.end('htmlGeneration', { htmlCount: htmlContents.length });
    console.log('所有HTML生成完成，准备创建文件...', htmlContents);
    
    // 直接返回HTML内容，不进行图片转换
    const finalResult = htmlContents.reduce((obj, item) => {
      obj[item.id] = {
        ...maps[item.id],
        htmlContent: item.html, // 直接存储HTML内容
        fileType: 'html' // 标记文件类型
      }
      return obj;
    }, {});
    
    performanceMonitor.end('resumeGenerateHtmlFiles', { 
      success: true, 
      resumeCount: resumes.length,
      resultCount: Object.keys(finalResult).length 
    });
    
    // 输出简要总结
    performanceMonitor.printSummary();
    
    return finalResult;
  }

  // 简历信息生成图片base64
  const resumeGenerateBase64s = async(resumes, isSingle) => {
    performanceMonitor.start('resumeGenerateBase64s');
    console.log(resumes, 'resumes');
    
    if(resumes.length <= 0) return {}

    // 获取优化配置
    const config = getOptimizedConfig();
    console.log('使用性能配置:', config);

    // 存储简历信息
    const maps = resumes.reduce((obj, {id, ...args}) => {
      obj[id] = args
      return obj
    }, {})

    let result = {
      data: []
    };

    performanceMonitor.start('dataFetching');
    if(isSingle) {
      console.log('单个相似简历模式开始获取数据...', resumes);
      result.data = await Promise.all(resumes.map(async (item) => {
        return {
          resumeBlindId: item.id,
          content: JSON.stringify(await bossFindJobDetail(item)),
        }
      }))
      console.log('单个相似简历模式获取到简历数据:', result);
    }else {
      console.log('批量简历开始获取简历数据...');
      result = await getResumeBlindList(Object.keys(maps))
      console.log('批量简历获取到简历数据:', result);
    }
    performanceMonitor.end('dataFetching', { resumeCount: result.data?.length || 0 });

    if (!result.data || result.data.length === 0) {
      performanceMonitor.end('resumeGenerateBase64s', { success: false, reason: 'no_data' });
      return {}
    }

    performanceMonitor.start('htmlGeneration');
    console.log('开始生成HTML...');
    
    // 分批处理HTML生成，避免一次性处理太多
    const batchSize = config.HTML_BATCH_SIZE; // 使用配置中的批次大小
    const htmls = [];
    
    for (let i = 0; i < result.data.length; i += batchSize) {
      const batch = result.data.slice(i, i + batchSize);
      console.log(`处理第${Math.floor(i/batchSize) + 1}批HTML，共${Math.ceil(result.data.length/batchSize)}批`);
      
      const batchHtmls = await Promise.all(batch.map(async (item) => {
        const html = await generateBossResume(item.content, maps[item.resumeBlindId]?.name);
        return {
          html,
          id: item.resumeBlindId,
        };
      }));
      
      htmls.push(...batchHtmls);
      
      // 使用配置中的延迟参数
      if (i + batchSize < result.data.length) {
        await new Promise(resolve => {
          if (config.ENABLE_IDLE_CALLBACK && window.requestIdleCallback) {
            window.requestIdleCallback(resolve, { timeout: config.IDLE_TIMEOUT });
          } else {
            setTimeout(resolve, config.BATCH_DELAY);
          }
        });
      }
    }
    
    performanceMonitor.end('htmlGeneration', { htmls, htmlCount: htmls.length });
    console.log('所有HTML生成完成，开始转换为图片...', htmls);
    
    performanceMonitor.start('imageConversion');
    
    // 使用主线程处理（已优化的分批处理方案）
    const finalResult = await convertInMainThread(htmls, maps, config);
    performanceMonitor.end('imageConversion', { method: 'mainthread', success: true });
    
    performanceMonitor.end('resumeGenerateBase64s', { 
      success: true, 
      resumeCount: resumes.length,
      resultCount: Object.keys(finalResult).length 
    });
    
    // 输出简要总结
    performanceMonitor.printSummary();
    
    // 输出详细性能报告
    performanceMonitor.report();
    
    return finalResult;
  }

  // 主线程转换函数 - 优化版本
  const convertInMainThread = async (htmls, maps, config) => {
    try {
      // 先尝试批量处理
      const htmlArray = htmls.map(item => item.html);
      const base64Results = await batchHtmlToImageBase64(htmlArray, config.IMAGE_CONFIG);
      
      const base64s = htmls.map((item, index) => ({
        id: item.id,
        base64: JSON.parse(base64Results[index])
      }));
      
      console.log('批量转换完成:', base64s.length);
      
      return base64s.reduce((obj, item) => {
        obj[item.id] = {
          ...maps[item.id],
          base64: item.base64,
        }
        return obj;
      }, {});
      
    } catch (error) {
      console.error('批量处理失败，使用分批逐个处理:', error);
      
      // 分批逐个处理，减少每次处理的数量
      const base64s = [];
      const smallBatchSize = config.IMAGE_BATCH_SIZE; // 使用配置的批次大小
      
      for (let i = 0; i < htmls.length; i += smallBatchSize) {
        const batch = htmls.slice(i, i + smallBatchSize);
        console.log(`处理图片第${Math.floor(i/smallBatchSize) + 1}批，共${Math.ceil(htmls.length/smallBatchSize)}批`);
        
        for (const { html, ...args } of batch) {
          try {
            const result = await htmlToImageBase64(html, config.IMAGE_CONFIG);
            
            if (result.startsWith('data:text/html;base64,')) {
              base64s.push({
                base64: result,
                ...args
              });
            } else {
              try {
                const imageList = JSON.parse(result);
                base64s.push({
                  ...args,
                  base64: imageList
                });
              } catch (parseError) {
                console.error('解析分片结果失败:', parseError);
                const htmlBase64 = btoa(unescape(encodeURIComponent(html)));
                base64s.push({
                  ...args,
                  base64: [`data:text/html;base64,${htmlBase64}`]
                });
              }
            }
          } catch (imgError) {
            console.error(`图片转换失败:`, imgError);
            const htmlBase64 = btoa(unescape(encodeURIComponent(html)));
            base64s.push({
              ...args,
              base64: [`data:text/html;base64,${htmlBase64}`]
            });
          }
        }
        
        // 批次间使用配置的延迟参数
        if (i + smallBatchSize < htmls.length) {
          await new Promise(resolve => {
            if (config.ENABLE_IDLE_CALLBACK && window.requestIdleCallback) {
              window.requestIdleCallback(resolve, { timeout: config.IDLE_TIMEOUT / 2 });
            } else {
              setTimeout(resolve, config.BATCH_DELAY * 2);
            }
          });
        }
      }
      
      return base64s.reduce((obj, item) => {
        obj[item.id] = {
          ...maps[item.id],
          base64: item.base64,
        }
        return obj;
      }, {});
    }
  }

  return [
    resumeGenerateHtmlFiles,
    cssContent
  ]
}
