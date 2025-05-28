import { getCurrentInstance } from 'vue';


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
            <span style="font-size: 20px;color: #1f262e;">${resume.name || ''}</span>
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
