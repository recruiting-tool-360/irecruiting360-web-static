import { getCurrentInstance } from 'vue';
import { getResumeBlindList } from "src/api/jobList/JobListApi";
import { zhiLianFindJobDetail } from "src/pluginSrc/channels/ZhiLianJobInfoManager";
import { performanceMonitor } from 'src/utils/performanceMonitor';
import { getResumeFileConfig } from 'src/config/resumeFileConfig.js';
import { minifyHtml, lightMinify, deepMinify } from 'src/utils/htmlMinifier.js';

export function zhiLianDomGenerator() {
  const { proxy } = getCurrentInstance();
  const svgToBase64 = proxy.$svgBase64Manager;

  const cssContent = `
    body{margin:0;padding:20px;font-family:'PingFang SC',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:#f5f5f5;color:#333;line-height:1.6}
    .resume-container{max-width:790px;margin:0 auto;background:white;border-radius:8px;overflow:hidden;box-shadow:0 0 10px rgba(0,0,0,0.1);padding:30px;box-sizing:border-box}
    .header-section{display:flex;align-items:flex-start;gap:20px;margin-bottom:10px}
    .avatar{width:80px;height:80px;border-radius:50%;background:#f3f3f5;display:flex;align-items:center;justify-content:center;font-size:12px;color:#666;flex-shrink:0;border:1px solid #e4e4e4}
    .basic-info{flex:1}
    .name-line{display:flex;align-items:baseline;gap:10px;margin-bottom:8px}
    .name{font-size:24px;font-weight:bold;color:#1f262e}
    .status-tag{background:rgba(18,178,152,.05);border:1px solid rgba(18,178,152,.4);color:#12b298;border-radius:4px;flex-shrink:0;font-size:12px;font-weight:600;height:18px;line-height:17px;padding:0 3px;width:auto}
    .basic-details{display:flex;flex-wrap:wrap;margin-bottom:12px;font-size:14px;color:#222}
    .basic-details > span{position:relative;white-space:nowrap}
    .basic-details > span:not(:last-child)::after{content:'';display:inline-block;width:1px;height:12px;background-color:#e4e4e4;margin:0 8px}
    .job-intention{display:flex;align-items:center;font-size:14px;color:#666}
    .content-section{padding:0}
    .section{padding:24px 0;border-top:1px solid #eeeeee}
    .section-title{position:relative;font-size:20px;font-weight:600;color:#333;margin-bottom:15px;margin-top:0}
    .gap-line{display:flex}
    .gap-line > div{position:relative;font-size:14px;color:#222;white-space:nowrap}
    .gap-line > div:not(:last-child)::after{content:'';display:inline-block;width:1px;height:12px;background-color:#e4e4e4;margin:0 10px}
    .work-item{margin-bottom:20px}
    .work-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px}
    .work-title{display:flex;align-items:center;gap:10px;flex-wrap: wrap;}
    .company-name{font-size:16px;font-weight:600;color:#333}
    .position{color:#222;font-size:16px;font-weight:600}
    .work-time{color:#999;font-size:13px;white-space:nowrap}
    .work-desc{color:#4e5366;font-size:14px;font-weight:400;line-height:26px;margin-top:8px}
    .skill-tags{display:flex;flex-wrap:wrap;gap:6px}
    .skill-tag{align-items:center;background:#f2f3f7;border-radius:6px;color:#4e5366;display:flex;font-size:13px;font-weight:400;height:26px;justify-content:center;line-height:18px;margin-right:8px;padding:0 12px}
    .project-item{margin-bottom:20px}
    .project-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px}
    .project-name{font-size:16px;font-weight:600;color:#333}
    .education-item:not(:last-child){margin-bottom:20px}
    .education-header{display:flex;justify-content:space-between;align-items:center}
    .education-info{display:flex;align-items:center;gap:10px}
    .school-name{font-size:16px;font-weight:600;color:#222}
    .major{color:#4e5366;font-size:14px}
    .education-time{color:#999;font-size:13px}
    .self-evaluation{color:#666;font-size:14px;line-height:22px;white-space:pre-line}
    .skill-name{font-size:14px;color:#333;flex:1}
    .skill-level{font-size:12px;padding:2px 8px;border-radius:12px;background:#f3f3f5;color:#666}
    .skill-level.熟练,.skill-level.良好{background:linear-gradient(0deg,rgba(66,110,255,.05),rgba(66,110,255,.05)),#fff;border:.6px solid rgba(66,110,255,.3);color:#426eff;display:inline-block;border-radius:4px;flex-shrink:0;font-size:12px;font-weight:500;line-height:12px;margin-left:4px;padding:3px 4px}
    .language-item{display:flex;flex-direction:column}
    .language-name{color:#222;font-size:16px;font-weight:600;line-height:22px}
    .language-levels{color:#4e5366;display:flex;font-size:14px;line-height:20px;gap:16px}
    .job-intention-section{background:rgba(242,243,247,.75);border-radius:8px;display:flex;flex-direction:row;gap:30px;height:auto;margin-bottom:26px;padding:16px 20px;width:auto}
    .job-intention-list{flex:1;display:flex;flex-direction:column;gap:6px}
    @media print{body{background:white !important}
    .resume-container{box-shadow:none !important;max-width:none !important;margin:0 !important}
    }`

  // 生成智联招聘简历完整页面
  const generateZhiLianResume = async(resumeJsonStr) => {
    const config = getResumeFileConfig();
    
    try {
        const data = JSON.parse(resumeJsonStr);
        // 智联招聘的数据结构可能不同，这里需要根据实际情况调整
        const resumeDetail = data.resumeDetail || data;
        const baseInfo = resumeDetail.baseInfo || resumeDetail;

        const userData = data?.data?.user;
        const resumeData = data?.data?.resume;

        const genderSvgUrl = await svgToBase64?.getSvgBase64(userData.genderLabel === "男" ? '/index/header/icons/geekMan.svg' : '/index/header/icons/geekWoman.svg');

        // 头部信息
        const headerHtml = `
            <div class="header-section">
                <div style="width: 72px; height: 72px;border-radius: 50%;overflow: hidden;background: #ccc;">
                    <img src="${genderSvgUrl}" width="72" alt="logo" class="logo" style="object-fit: cover;object-position: center;">
                </div>
                <div class="basic-info">
                    <div class="name-line">
                        <span class="name">${userData?.name || ''}</span>
                        <span>${userData?.genderLabel || ''}</span>
                        ${userData?.userActiveTag?.describe ? `<span class="status-tag">${userData?.userActiveTag?.describe || ''}</span>` : ''}
                    </div>
                    <div class="basic-details">
                        <span>${userData?.ageLabel || ''} (${userData?.birthYearMonthLabel || ''})</span>
                        <span>${userData?.workYearsLabel || ''}经验</span>
                        <span>${userData?.maxEducationLabel || ''}</span>
                        <span>${userData?.careerStateLabel || ''}</span>
                    </div>
                    <div class="basic-details">
                        <span>${userData?.cityLabel || ''}</span>
                        <span>${userData?.huKouLabel || ''}</span>
                    </div>
                </div>
            </div>
            <div class="job-intention-section">
                <span style="font-size: 14px; font-weight: 600;">${resumeData?.purposeTitle || ''}</span>
                <div class="job-intention-list">
                    ${resumeData?.purposes?.map(purpose => `
                        <div class="job-intention gap-line">
                            <div style="font-size: 14px; font-weight: 600;">[${purpose?.location || ''}]</div>
                            ${purpose?.jobTypeLabel ? `<div>${purpose?.jobTypeLabel || ''}</div>` : ''}
                            ${purpose?.salaryLabel ? `<div>${purpose?.salaryLabel || ''}</div>` : ''}
                            ${purpose?.industryHighlights?.length > 0 ? `
                                <div>${purpose?.industryHighlights?.map(highlight => `${highlight?.name || ''}`).join('、') || ''}</div>
                            ` : ''}
                        </div>
                    `)?.join('') || ''}
                </div>
            </div>
        `;
        let contentHtml = `
            <div class="content-section">
                <!-- 工作经历 -->
                ${resumeData?.workExperiences?.length > 0 ? `
                    <div class="section">
                        <h3 class="section-title">工作经历</h3>
                        ${resumeData?.workExperiences?.map(work => `
                            <div class="work-item">
                                <div class="work-header">
                                    <div class="work-title">
                                        <span class="company-name">${work?.orgName || ''}</span>
                                        <span style="color: #ccc;">|</span>
                                        <span class="position">${work?.jobTitle || ''}</span>
                                        ${work?.salaryDescription ? `<span class="position">· ${work?.salaryDescription || ''}</span>` : ''}
                                    </div>
                                    <span class="work-time">${work?.timeLabel || ''}</span>
                                </div>
                                ${work?.workSkillTags?.length > 0 ? `
                                    <div class="skill-tags">
                                        ${work?.workSkillTags?.map(tag => `
                                            <span class="skill-tag">${tag?.name || ''}</span>
                                        `)?.join('') || ''}
                                    </div>
                                ` : ''}
                                
                                ${work?.description ? `<div class="work-desc">${work?.description || ''}</div>` : ''}
                                
                            </div>
                        `)?.join('') || ''}
                    </div>
                ` : ''}

                <!-- 项目经历 -->
                ${resumeData?.projectExperiences?.length > 0 ? `
                    <div class="section">
                        <h3 class="section-title">项目经历</h3>
                        ${resumeData?.projectExperiences?.map(project => `
                            <div class="project-item">
                                <div class="project-header">
                                    <span class="project-name">${project?.name || ''}</span>
                                    <span class="work-time">${project?.timeLabel || ''}</span>
                                </div>
                                ${project?.description ? `<div class="work-desc">${project?.description || ''}</div>` : ''}
                            </div>
                        `)?.join('') || ''}
                    </div>
                ` : ''}

                <!-- 教育经历 -->
                ${resumeData?.educationExperiences?.length > 0 ? `
                    <div class="section">
                        <h3 class="section-title">教育经历</h3>
                        ${resumeData?.educationExperiences?.map(education => `
                            <div class="education-item">
                                <div class="education-header">
                                    <div class="education-info">
                                        <span class="school-name">${education?.schoolName || ''}</span>
                                        
                                    </div>
                                    <span class="education-time">${education?.educationTimeLabel || ''}</span>
                                </div>
                                <div class="education-info">
                                    <span class="major">
                                        ${education?.major || ''} ·
                                        ${education?.educationLabel || ''}
                                        ${education?.educationFullTimeLabel ? `<span>· ${education?.educationFullTimeLabel || ''}</span>` : ''}
                                    </span>
                                </div>
                            </div>
                        `)?.join('') || ''}
                    </div>
                ` : ''}

                    <!-- 个人优势 -->
                ${resumeData?.selfEvaluation ? `
                    <div class="section">
                        <h3 class="section-title">个人优势</h3>
                        <div class="self-evaluation">${resumeData?.selfEvaluation || ''}</div>
                    </div>
                ` : ''}

                <!-- 语言能力 -->
                ${resumeData?.languageSkills?.length > 0 ? `
                    <div class="section">
                        <h3 class="section-title">语言能力</h3>
                        ${resumeData?.languageSkills?.map(language => `
                            <div class="language-item">
                                <span class="language-name">${language?.name || ''}</span>
                                <div class="language-levels">
                                    ${language?.readWriteSkill ? `<span>读写能力：${language?.readWriteSkill || ''}</span>` : ''}
                                    ${language?.hearSpeakSkill ? `<span>听说能力：${language?.hearSpeakSkill || ''}</span>` : ''}
                                </div>
                            </div>
                        `)?.join('') || ''}
                    </div>
                ` : ''}

                <!-- 所获证书 -->
                ${resumeData?.certificates?.length > 0 ? `
                    <div class="section">
                        <h3 class="section-title">所获证书</h3>
                        <div class="skill-tags">
                            ${resumeData?.certificates?.map(certificate => `
                                <div class="skill-tag">${certificate?.name || ''}</div>
                            `)?.join('') || ''}
                        </div>
                    </div>
                ` : ''}

                <!-- 专业技能 -->
                ${resumeData?.professionalSkills?.length > 0 ? `
                    <div class="section">
                        <h3 class="section-title">专业技能</h3>
                        <div class="skill-tags">
                            ${resumeData?.professionalSkills?.map(skill => `
                                <div class="skill-tag">
                                    <span class="skill-name">${skill?.name || ''}</span>
                                    <span class="skill-level ${skill?.mastery || ''}">${skill?.mastery || ''}</span>
                                </div>
                            `)?.join('') || ''}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
                    
        let htmlContent = headerHtml + contentHtml;

        // 根据配置应用压缩
        if (config.html.minify) {
            const originalSize = htmlContent.length;
            console.log('开始压缩智联招聘简历HTML内容...', { 
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

            console.log('智联招聘简历HTML内容压缩完成:', {
            originalSize: `${originalSize} 字符`,
            compressedSize: `${htmlContent.length} 字符`,
            savedBytes: originalSize - htmlContent.length,
            compressionLevel: config.html.minifyLevel || 'standard'
            });
        }

        return htmlContent;
    } catch (error) {
        console.error('解析智联招聘简历数据失败:', error);
        throw new Error('智联招聘简历数据解析失败，请稍后重试');
    }
  }

  // 智联招聘简历信息直接生成HTML文件
  const resumeGenerateHtmlFiles = async(resumes, isSingle) => {
    performanceMonitor.start('zhiLianResumeGenerateHtmlFiles');
    console.log('开始生成智联招聘HTML文件...', resumes);
    
    if(resumes.length <= 0) return {}

    // 存储简历信息
    const maps = resumes.reduce((obj, {id, ...args}) => {
      obj[id] = args
      return obj
    }, {})

    let result = {
      data: []
    };

    performanceMonitor.start('zhiLianDataFetching');
    if(isSingle) {
      console.log('智联招聘单个相似简历模式开始获取数据...', resumes);
      result.data = await Promise.all(resumes.map(async (item) => {
        return {
          resumeBlindId: item.id,
          content: JSON.stringify(await zhiLianFindJobDetail(item)),
        }
      }))
      console.log('智联招聘单个相似简历模式获取到简历数据:', result);
    } else {
      console.log('智联招聘批量简历开始获取简历数据...');
      result = await getResumeBlindList(Object.keys(maps))
      console.log('智联招聘批量简历获取到简历数据:', result);
    }
    performanceMonitor.end('zhiLianDataFetching', { resumeCount: result.data?.length || 0 });

    if (!result.data || result.data.length === 0) {
      performanceMonitor.end('zhiLianResumeGenerateHtmlFiles', { success: false, reason: 'no_data' });
      return {}
    }

    performanceMonitor.start('zhiLianHtmlGeneration');
    console.log('开始生成智联招聘HTML文件...');
    
    // 生成HTML内容
    const htmlContents = await Promise.all(result.data.map(async (item) => {
      const html = await generateZhiLianResume(item.content);
      return {
        html,
        id: item.resumeBlindId,
      };
    }));
    
    performanceMonitor.end('zhiLianHtmlGeneration', { htmlCount: htmlContents.length });
    console.log('所有智联招聘HTML生成完成，准备创建文件...', htmlContents);
    
    // 直接返回HTML内容，不进行图片转换
    const finalResult = htmlContents.reduce((obj, item) => {
      obj[item.id] = {
        ...maps[item.id],
        htmlContent: item.html, // 直接存储HTML内容
        fileType: 'html' // 标记文件类型
      }
      return obj;
    }, {});
    
    performanceMonitor.end('zhiLianResumeGenerateHtmlFiles', { 
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
