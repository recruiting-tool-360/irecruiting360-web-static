import { getCurrentInstance } from 'vue';
import html2canvas from 'html2canvas';
import { getResumeBlindList } from "src/api/jobList/JobListApi";
import { batchHtmlToImageBase64, htmlToImageBase64 } from 'src/pluginSrc/channels/ImageChannel';

/**
 * 处理姓名，将带**的姓名替换成对应的先生/女士
 * @param {Object} params - 参数对象
 * @param {string} params.name - 姓名
 * @param {number} params.gender - 性别（1为男性，非1为女性）
 * @returns {string} 处理后的姓名
 */
export function formatName({ name, gender }) {
  // 如果名字为空，直接返回
  if (!name) return '';
  
  // 如果名字中不包含**，直接返回原名字
  if (!name.includes('**')) return name;
  
  // 根据性别确定称呼
  const title = gender === 1 ? '先生' : '女士';
  
  // 替换**为对应的称呼
  return name.replace('**', title);
}

// 清除HTML标签函数
function stripHtmlTags(text) {
  if (!text) return '';
  return text.replace(/<[^>]*>/g, '');
}

export function bossDomGenerator() {
  const { proxy } = getCurrentInstance();
  const svgToBase64 = proxy.$svgBase64Manager;

  // 生成Boss简历完整页面
  const generateBossResume = async(resumeJsonStr) => {
    try {
      const data = JSON.parse(resumeJsonStr);
      const { geekDetail } = data;
      const baseInfo = geekDetail.geekBaseInfo;
      const workExpList = geekDetail.geekWorkExpList;
      const projExpList = geekDetail.geekProjExpList;
      const eduExpList = geekDetail.geekEduExpList;
      const honorList = geekDetail.geekHonorList;
      const trainingList = geekDetail.geekTrainingExpList;
      const professionalSkill = geekDetail.professionalSkill;
      const genderSvgUrl = await svgToBase64?.getSvgBase64(baseInfo.gender === 1 ? '/index/header/icons/geekMan.svg' : '/index/header/icons/geekWoman.svg');

      return `
        <div style="width: 790px; background: #fff; font-family: 'PingFang SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #333; line-height: 1.6; padding: 30px; box-sizing: border-box;font-size: 13px;">
          
          <!-- 基本信息部分 -->
          <div style="display: flex;align-items: start;gap: 10px;">
            <div style="width: 56px; height: 56px;border-radius: 50%;overflow: hidden;background: #ccc;">
              <img src="${genderSvgUrl}" width="56" alt="logo" class="logo" style="object-fit: cover;object-position: center;">
            </div>
            <div style="margin-left: 20px;flex:1;">
              <div>
                <span style="font-size: 20px;color: #1f262e;">${formatName(baseInfo)}</span>
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

          <!-- 资格证书 -->
          ${(honorList && honorList.length > 0) || (trainingList && trainingList.length > 0) ? `
            <div style="display: flex; align-items: start; margin-top: 30px;">

              <h4 style="font-size: 14px; color:#171d26;font-weight: bold;margin: 4px 0 0 0;">资格证书</h4>

              <div style="margin-left: 30px; flex: 1;">
                ${honorList && honorList.length > 0 ? honorList.map(honor => `
                  <div style="margin-bottom: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                      <div style="display: flex;align-items: center;">
                        <h3 style="font-size: 14px; font-weight: bold; margin: 0 0 4px 0; color: #171d26;margin: 0;">
                          ${honor.name || honor.title}
                        </h3>
                        ${honor.issuer ? `
                          <span style="margin: 0 10px;color: #ccc;">|</span>
                          <div style="color: #171d26; font-weight: bold; font-size: 14px;">
                            ${honor.issuer}
                          </div>
                        ` : ''}
                      </div>
                      ${honor.getTime || honor.date ? `
                        <span style="color: #363f4d; font-size: 13px; white-space: nowrap; margin-left: 20px;">
                          ${honor.getTime || honor.date}
                        </span>
                      ` : ''}
                    </div>
                    ${honor.description ? `
                      <div style="margin-bottom: 12px;">
                        <p style="margin: 0; line-height: 1.6; color: #555; font-size: 13px; white-space: pre-line;">${stripHtmlTags(honor.description)}</p>
                      </div>
                    ` : ''}
                  </div>
                `).join('') : ''}
                ${trainingList && trainingList.length > 0 ? trainingList.map(training => `
                  <div style="margin-bottom: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                      <div style="display: flex;align-items: center;">
                        <h3 style="font-size: 14px; font-weight: bold; margin: 0 0 4px 0; color: #171d26;margin: 0;">
                          ${training.name || training.title}
                        </h3>
                        ${training.organization ? `
                          <span style="margin: 0 10px;color: #ccc;">|</span>
                          <div style="color: #171d26; font-weight: bold; font-size: 14px;">
                            ${training.organization}
                          </div>
                        ` : ''}
                      </div>
                      ${training.startYearMonStr && training.endYearMonStr ? `
                        <span style="color: #363f4d; font-size: 13px; white-space: nowrap; margin-left: 20px;">
                          ${training.startYearMonStr} - ${training.endYearMonStr}
                        </span>
                      ` : ''}
                    </div>
                    ${training.description ? `
                      <div style="margin-bottom: 12px;">
                        <p style="margin: 0; line-height: 1.6; color: #555; font-size: 13px; white-space: pre-line;">${stripHtmlTags(training.description)}</p>
                      </div>
                    ` : ''}
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
    } catch (error) {
      console.error('解析简历数据失败:', error);
      return `
        <div style="width: 790px; background: #fff; padding: 30px; text-align: center; color: #666;">
          <p>简历数据解析失败</p>
        </div>
      `;
    }
  }

  // 简历信息生成图片base64
  const resumeGenerateBase64s = async(resumes) => {
    if(resumes.length <= 0) return {}

    // 存储简历信息
    const maps = resumes.reduce((obj, {id, ...args}) => {
      obj[id] = args
      return obj
    }, {})

    console.log('开始获取简历数据...');
    const result = await getResumeBlindList(Object.keys(maps))
    console.log('获取到简历数据:', result);

    if (!result.data || result.data.length === 0) {
      throw new Error('未获取到简历数据');
    }

    console.log('开始生成HTML...');
    const htmls = await Promise.all(result.data.map(async (item) => {
      const html = await generateBossResume(item.content);
      return {
        html,
        id: item.resumeBlindId,
      };
    }));
    
    console.log('所有HTML生成完成，开始批量转换为图片...');
    
    try {
      // 使用批量处理，一次性处理所有HTML
      const htmlArray = htmls.map(item => item.html);
      const base64Results = await batchHtmlToImageBase64(htmlArray, {
        width: 790,
        scale: 1
      });
      
      // 组装结果
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
      console.error('批量处理失败，回退到逐个处理:', error);
      
      // 回退到原来的逐个处理方式
      const base64s = [];
      for (let i = 0; i < htmls.length; i++) {
        const { html, ...args } = htmls[i]
        try {
          console.log(`回退处理第${i + 1}/${htmls.length}个HTML...`);
          const result = await htmlToImageBase64(html, {
            width: 790,
            scale: 1
          });
          
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
          
          if (i < htmls.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        } catch (imgError) {
          console.error(`第${i + 1}个图片转换失败:`, imgError);
          const htmlBase64 = btoa(unescape(encodeURIComponent(html)));
          base64s.push({
            ...args,
            base64: [`data:text/html;base64,${htmlBase64}`]
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

  return {
    resumeGenerateBase64s
  }
}
