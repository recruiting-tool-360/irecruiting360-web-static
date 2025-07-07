import { getCurrentInstance } from 'vue';
import { getResumeBlindList } from "src/api/jobList/JobListApi";
import { job51FindJobDetailFN } from "src/pluginSrc/channels/Job51InfoManager";
import { performanceMonitor } from 'src/utils/performanceMonitor';
import { getResumeFileConfig } from 'src/config/resumeFileConfig.js';
import { minifyHtml, lightMinify, deepMinify } from 'src/utils/htmlMinifier.js';

export function job51DomGenerator() {
  const { proxy } = getCurrentInstance();
  const svgToBase64 = proxy.$svgBase64Manager;

  const cssContent = `
    body{margin:0;padding:20px;font-family:'PingFang SC',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:#f5f5f5;color:#333;line-height:1.6}
    .resume-container{max-width:800px;margin:0 auto;background:white;box-shadow:0 0 10px rgba(0,0,0,0.1);border-radius:8px;overflow:hidden;padding:30px;box-sizing:border-box}
    .header-section{display:flex;align-items:flex-start;gap:20px;margin-bottom:30px}
    .basic-info{flex:1}
    .name-line{display:flex;align-items:baseline;gap:10px;margin-bottom:8px}
    .name{font-size:24px;font-weight:bold;color:#1f262e}
    .sex{color:#222;font-size:16px}
    .time-line{font-size:14px;font-weight:normal;line-height:22px;color:#555555}
    .basic-line{color:#222;font-size:14px;margin-bottom:6px}
    .pl-15px{padding-left:15px}
    .intro{color:#222;font-size:14px;white-space:pre-line;margin-top:10px}
    .section{margin-bottom:30px}
    .section-title{font-size:20px;font-weight:600;color:#333;margin-bottom:15px;padding-left:10px}
    .section-title::before{content:'';display:inline-block;position:relative;top:1px;left:-8px;width:4px;height:18px;background-color:#ff6c0e}
    .gap-line{display:flex}
    .gap-line>div{position:relative;font-size:14px;color:#222;white-space:nowrap}
    .gap-line>div:not(:last-child)::after{content:'';display:inline-block;width:1px;height:12px;background-color:#e4e4e4;margin:0 10px}
    .intention-item{display:flex;padding:0 15px 15px 15px}
    .intention-item>div{position:relative;font-size:14px;font-weight:600;color:#333333;white-space:nowrap}
    .intention-item>div:not(:first-child){font-size:14px;font-weight:400;color:#1a1a1a}
    .work-item,.project-item,.education-item{margin-bottom:20px;padding-bottom:15px}
    .work-header,.project-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px}
    .work-title{display:flex;align-items:center;gap:10px}
    .company-name{font-size:16px;font-weight:600;color:#333}
    .position{color:#222;font-size:14px}
    .work-time{color:#999;font-size:13px;white-space:nowrap}
    .work-desc{color:#666;font-size:14px;white-space:pre-line;margin-top:8px}
    .skills{margin-top:10px}
    .skill-tag{display:inline-flex;width:auto;height:20px;background:#f3f3f5;border-radius:4px;padding:1px 8px;margin:0 4px 4px 0;font-size:12px;font-family:PingFangSC,PingFang SC;font-weight:400;color:#666666;line-height:18px}
    .education-header{display:flex;justify-content:space-between;align-items:center}
    .school-info{display:flex;align-items:center;gap:10px}
    .school-name{font-size:16px;font-weight:bold;color:#1f262e}
    .major{color:#222;font-size:14px}
    .education-time{color:#999;font-size:13px}`

  // 生成前程无忧简历完整页面
  const generateJob51Resume = async(resumeJsonStr) => {
    const config = getResumeFileConfig();
    
    try {
      const data = JSON.parse(resumeJsonStr);
      console.log(data, 'generateJob51Resume');
      
      const genderSvgUrl = await svgToBase64?.getSvgBase64(data?.sex_status !== "1" ? '/index/header/icons/geekMan.svg' : '/index/header/icons/geekWoman.svg');

      // 基本信息部分
      const headerHtml = `
          <div class="header-section">
              <div style="width: 64px; height: 64px;border-radius: 50%;overflow: hidden;background: #ccc;">
                <img src="${genderSvgUrl}" width="64" alt="logo" class="logo" style="object-fit: cover;object-position: center;">
              </div>
              <div class="basic-info">
                  <div class="name-line">
                      <span class="name">${data?.username}</span>
                      <span class="sex">${data?.sex}</span>
                      <div class="time-line">${data?.currentsituation}(${data?.entrytime})</div>
                  </div>
                  <div class="basic-line gap-line">
                      <div>${data?.displayage}</div>
                      <div>${data?.workyear}年经验</div>
                      <div>${data?.highestdegree?.degree}</div>
                      <div>${data?.area}</div>
                      <div>${data?.politics_status}</div>
                  </div>
              </div>
          </div>
      `;

      // 求职意向
      const intentionHtml = data?.jobintention && data?.jobintention?.length > 0 ? `
          <div class="section">
              <h3 class="section-title">求职意向</h3>
              ${data?.jobintention?.map(intention => `
                  <div class="intention-item gap-line">
                      <div>${intention?.expectfuncname}</div>
                      <div>${intention?.seektype}</div>
                      <div>${intention?.newdisplayexpectsalary}</div>
                      <div>${intention?.expectarea?.map(area => area?.provincecity)?.join('、')}</div>
                  </div>
              `)?.join('')}
          </div>
      ` : '';

      // 个人优势
      const skillsHtml = data?.selfintro || (data?.pskillslabel && data?.pskillslabel?.length > 0) ? `
          <div class="section">
              <h3 class="section-title">个人优势</h3>
              
              <div class="skills pl-15px">
                  ${data?.selfintro ? `<div class="intro">${data?.selfintro}</div>` : ''}
                  ${data?.pskillslabel?.map(skill => `<span class="skill-tag">${skill}</span>`)?.join('')}
              </div>
          </div>
      ` : '';

      // 工作经历
      const workHtml = data?.work && data?.work?.length > 0 ? `
          <div class="section">
              <h3 class="section-title">工作经历</h3>
              ${data?.work?.map(work => `
                  <div class="work-item pl-15px">
                      <div class="work-header">
                          <div class="work-title">
                              <span class="company-name">${work?.compname}</span>
                              <span style="color: #ccc;">|</span>
                              <span class="position">${work?.position}</span>
                          </div>
                          <div>
                              <span class="work-time">${work?.timefrom} - ${work?.timeto}</span>
                              <span class="work-time">(${work?.worktime})</span>    
                          </div>
                      </div>
                      ${work?.workindustry || work?.companysize || work?.companytype ? `
                          <div class="basic-line gap-line">
                              <div>${work?.workindustry}</div>
                              <div>${work?.companysize}</div>
                              <div>${work?.companytype}</div>
                          </div>
                      ` : ''}
                      ${work?.workdescribe ? `<div class="work-desc">${work?.workdescribe}</div>` : ''}
                      ${work?.skilllabels && work?.skilllabels?.length > 0 ? `
                          <div class="skills">
                              ${work?.skilllabels?.map(skill => `<span class="skill-tag">${skill}</span>`)?.join('')}
                          </div>
                      ` : ''}
                  </div>
              `)?.join('')}
          </div>
      ` : '';

      // 项目经验
      const projectHtml = data?.project && data?.project?.length > 0 ? `
          <div class="section">
              <h3 class="section-title">项目经验</h3>
              ${data?.project?.map(project => `
                  <div class="project-item pl-15px">
                      <div class="project-header">
                          <div class="work-title">
                              <span class="company-name">${project?.projectname}</span>
                          </div>
                          <span class="work-time">${project?.timefrom} - ${project?.timeto}</span>
                      </div>
                      <div class="basic-line">${project?.compname}</div>
                      ${project?.describe ? `<div class="work-desc">${project?.describe}</div>` : ''}
                  </div>
              `)?.join('')}
          </div>
      ` : '';

      // 教育经历
      const educationHtml = data?.education && data?.education?.length > 0 ? `
          <div class="section">
              <h3 class="section-title">教育经历</h3>
              ${data?.education?.map(edu => `
                  <div class="education-item pl-15px">
                      <div class="education-header">
                          <div class="school-info">
                              <span class="school-name">${edu?.schoolname}</span>
                              <span style="color: #ccc;">|</span>
                              <span class="major">${edu?.major}</span>
                              <span style="color: #ccc;">|</span>
                              <span class="major">${edu?.degree}</span>
                          </div>
                          <span class="education-time">${edu?.timefrom} - ${edu?.timeto}</span>
                      </div>
                      ${edu?.describe ? `<div class="work-desc">${edu?.describe}</div>` : ''}
                  </div>
              `)?.join('')}
          </div>
      ` : '';

      // 在校情况
      const schoolSituationHtml = (data?.schoolaward?.length > 0 || data?.schooljob?.length > 0) ? `
          <div class="section">
              <h3 class="section-title">在校情况</h3>
              <div class="pl-15px">
                  ${data?.schoolaward?.length > 0 ? `
                      <div style="margin-bottom: 15px;">
                          <div style="font-weight: 600; margin-bottom: 8px;">校内荣誉</div>
                          ${data?.schoolaward?.map(award => `
                              <div class="gap-line" style="margin-bottom: 5px;">
                                  <div>${award?.bonusname}</div>
                                  <div>${award?.bonustime}</div>
                              </div>
                          `)?.join('')}
                      </div>
                  ` : ''}
                  ${data?.schooljob?.length > 0 ? `
                      <div>
                          <div style="font-weight: 600; margin-bottom: 8px;">校内职务</div>
                          ${data?.schooljob?.map(job => `
                              <div class="gap-line" style="margin-bottom: 5px;">
                                  <div>${job?.schooljobname}</div>
                                  <div>${job?.timefrom} - ${job?.timeto}</div>
                              </div>
                          `)?.join('')}
                      </div>
                  ` : ''}
              </div>
          </div>
      ` : '';

      // 技能/语言
      const itSkillHtml = data?.itskill && data?.itskill?.length > 0 ? `
          <div class="section">
              <h3 class="section-title">技能/语言</h3>
              <div class="pl-15px" style="display: flex; flex-direction: row; gap: 20px;flex-wrap: wrap;">
                  ${data?.itskill?.map(skill => {
                      // 根据能力等级设置样式
                      let skillStyle = '';
                      if (skill?.ability === '熟练') {
                          skillStyle = 'background: #ffede5; color: #ff6c0e;';
                      } else if (skill?.ability === '良好') {
                          skillStyle = 'background: #e5effc; color: #2478e9;';
                      } else {
                          skillStyle = 'background: #f3f3f5; color: #666666;';
                      }
                      
                      return `
                          <div style="margin-bottom: 8px; display: flex;align-items: center;">
                              <div style="font-weight: 600;margin-right: 4px;">${skill?.ittype}</div>
                              <div class="skill-tag" style="${skillStyle} margin: 0;">${skill?.ability}</div>
                          </div>
                      `;
                  })?.join('')}
              </div>
          </div>
      ` : '';

      // 证书
      const certificationHtml = data?.certification && data?.certification?.length > 0 ? `
          <div class="section">
              <h3 class="section-title">证书</h3>
              <div class="pl-15px" style="display: flex; flex-wrap: wrap; gap: 20px;">
                  ${data?.certification?.map(cert => `
                      <div style="margin-bottom: 8px;">
                          <div style="font-weight: 600; margin-bottom: 4px;">${cert?.cert}</div>
                          <div class="gap-line">
                              ${cert?.getdate ? `<div>${cert?.getdate}</div>` : ''}
                              ${cert?.score ? `<div>${cert?.score}</div>` : ''}
                          </div>
                      </div>
                  `)?.join('')}
              </div>
          </div>
      ` : '';

      // 组合所有HTML
      let htmlContent = headerHtml + intentionHtml + skillsHtml + workHtml + projectHtml + educationHtml + schoolSituationHtml + itSkillHtml + certificationHtml;
        console.log(htmlContent, 'htmlContent');
                  
      // 根据配置应用压缩
      if (config.html.minify) {
        const originalSize = htmlContent.length;
        console.log('开始压缩前程无忧简历HTML内容...', { 
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

        console.log('前程无忧简历HTML内容压缩完成:', {
          originalSize: `${originalSize} 字符`,
          compressedSize: `${htmlContent.length} 字符`,
          savedBytes: originalSize - htmlContent.length,
          compressionLevel: config.html.minifyLevel || 'standard'
        });
      }

      return htmlContent;
    } catch (error) {
      console.error('解析前程无忧简历数据失败:', error);
      return `
        <div style="width: 790px; background: #fff; padding: 30px; text-align: center; color: #666;">
          <p>前程无忧简历数据解析失败</p>
        </div>
      `;
    }
  }

  // 前程无忧简历信息直接生成HTML文件
  const resumeGenerateHtmlFiles = async(resumes, isSingle) => {
    performanceMonitor.start('job51ResumeGenerateHtmlFiles');
    console.log('开始生成前程无忧HTML文件...', resumes);
    
    if(resumes.length <= 0) return {}

    // 存储简历信息
    const maps = resumes.reduce((obj, {id, ...args}) => {
      obj[id] = args
      return obj
    }, {})

    let result = {
      data: []
    };

    performanceMonitor.start('job51DataFetching');
    if(isSingle) {
      console.log('前程无忧单个相似简历模式开始获取数据...', resumes);
      result.data = await Promise.all(resumes.map(async (item) => {
        return {
          resumeBlindId: item.id,
          content: JSON.stringify(await job51FindJobDetailFN(item)),
        }
      }))
      console.log('前程无忧单个相似简历模式获取到简历数据:', result);
    } else {
      console.log('前程无忧批量简历开始获取简历数据...');
      result = await getResumeBlindList(Object.keys(maps))
      console.log('前程无忧批量简历获取到简历数据:', result);
    }
    performanceMonitor.end('job51DataFetching', { resumeCount: result.data?.length || 0 });

    if (!result.data || result.data.length === 0) {
      performanceMonitor.end('job51ResumeGenerateHtmlFiles', { success: false, reason: 'no_data' });
      return {}
    }

    performanceMonitor.start('job51HtmlGeneration');
    console.log('开始生成前程无忧HTML文件...');
    
    // 生成HTML内容
    const htmlContents = await Promise.all(result.data.map(async (item) => {
      const html = await generateJob51Resume(item.content);
      return {
        html,
        id: item.resumeBlindId,
      };
    }));
    
    performanceMonitor.end('job51HtmlGeneration', { htmlCount: htmlContents.length, htmlContents });
    console.log('所有前程无忧HTML生成完成，准备创建文件...', htmlContents);
    
    // 直接返回HTML内容，不进行图片转换
    const finalResult = htmlContents.reduce((obj, item) => {
      obj[item.id] = {
        ...maps[item.id],
        htmlContent: item.html, // 直接存储HTML内容
        fileType: 'html' // 标记文件类型
      }
      return obj;
    }, {});
    
    performanceMonitor.end('job51ResumeGenerateHtmlFiles', { 
      success: true, 
      resumeCount: resumes.length,
      resultCount: Object.keys(finalResult).length 
    });
    
    return finalResult;
  }

  return [
    resumeGenerateHtmlFiles,
    cssContent
  ]
} 