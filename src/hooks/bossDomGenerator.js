import { getCurrentInstance } from 'vue';

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

export function bossDomGenerator() {
  const { proxy } = getCurrentInstance();
  const svgToBase64 = proxy.$svgBase64Manager;

  // 生成Boss简历头部信息
  const generate = async (resume) => {
    const genderSvgUrl = await svgToBase64?.getSvgBase64(resume.gender === 1 ? '/index/header/icons/geekMan.svg' : '/index/header/icons/geekWoman.svg');
    return `
      <div style="display: flex;align-items: center;gap: 10px;margin-bottom: -40px;">
        <div style="width: 56px; height: 56px;border-radius: 50%;overflow: hidden;">
          <img src="${genderSvgUrl}" width="56" alt="logo" class="logo" style="object-fit: cover;object-position: center;">
        </div>
        <div style="margin-left: 20px;">
          <div>
            <span style="font-size: 20px;color: #1f262e;">${formatName(resume)}</span>
            <span style="color: #606773;margin: 0 4px;">${resume.gender === 1 ? '男' : '女'}</span>
          </div>
          <div>
            <span style="color: #606773;">${resume.ageDesc ? resume.ageDesc + '｜' : ''}</span>
            <span style="color: #606773;">${resume.experienceYear}年｜</span>
            <span style="color: #606773;">${resume.degree}｜</span>
            <span style="color: #606773;">${resume.status}</span>
          </div>
        </div>
      </div>
    `
  }

  return {
    generate
  }
}
