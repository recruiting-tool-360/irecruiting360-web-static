/**
 * 根据职位 headcountBasic + 枚举数据生成职位描述文本（JD）
 *
 * 1:1 移植自 ihr360-recruit-static/src/pages/recruit-assistant/common.ts
 * → generateJobPostingFromResume()
 *
 * 用途：
 *   客户端模式下 chatList 接口没返 jd 字段，需要在前端通过
 *   `ihrBridge.batchGetPositionDetailByIds(positionIds)` 拉职位详情，
 *   然后用本函数把 headcountBasic + 枚举数据拼成 JD 文本。
 *
 * @param {object} resumeInfo  i 人事 batchGetPositionDetailByIds 返回的 item.headcountBasic
 * @param {object} enumData    同一返回 item 的兄弟字段（salaryTypes / workYears / positionTypes / diplomaTypes）
 * @returns {string} 多行 JD 文本，可直接发到聊天框
 */
export function generateJobPostingFromResume(resumeInfo, enumData) {
  if (!resumeInfo || typeof resumeInfo !== 'object') return '';
  const enums = enumData || {};

  const getEnumValue = (key, enumArray) => {
    if (!key || !enumArray || !Array.isArray(enumArray)) return '';
    const foundItem = enumArray.find((enumItem) => enumItem?.key === key);
    return foundItem?.value ?? '';
  };

  const formatSalary = () => {
    const salaryTypeValue = getEnumValue(resumeInfo.salaryType, enums.salaryTypes);
    if (resumeInfo.salaryType === 'NEGOTIABLE') {
      return salaryTypeValue;
    }
    const minSalary = resumeInfo.minSalary || '';
    const maxSalary = resumeInfo.maxSalary || '';
    const salaryMonths = resumeInfo.salaryMonths ? `·${resumeInfo.salaryMonths}薪` : '';
    if (minSalary && maxSalary) {
      return `${salaryTypeValue} ${minSalary}-${maxSalary}K${salaryMonths}`;
    } else if (minSalary) {
      return `${salaryTypeValue} ${minSalary}K以上${salaryMonths}`;
    } else if (maxSalary) {
      return `${salaryTypeValue} ${maxSalary}K以下${salaryMonths}`;
    }
    return salaryTypeValue || '面议';
  };

  const formatWorkCity = () => {
    if (!resumeInfo.workCity || !Array.isArray(resumeInfo.workCity)) return '';
    return resumeInfo.workCity.join('、');
  };

  return `职位名称：${resumeInfo.positionName || ''}
职位性质：${resumeInfo.staffTypeName || ''}  工作年限：${getEnumValue(
    resumeInfo.workYear,
    enums.workYears
  )}  职能类型：${getEnumValue(
    resumeInfo.positionType,
    enums.positionTypes
  )}  薪酬范围：${formatSalary()}  工作城市：${formatWorkCity()}  学历要求：${getEnumValue(
    resumeInfo.requiredEducation,
    enums.diplomaTypes
  )}
职位描述：
${resumeInfo.jobDescription || ''}`;
}

export default { generateJobPostingFromResume };
