// HEX转RGB辅助函数
export function hexToRgb(hex) {
  // 去除可能的#前缀和透明度部分
  hex = hex.replace(/^#/, '').substring(0, 6);

  // 处理缩写形式 (#RGB)
  if (hex.length === 3) {
    hex = hex.split('').map(char => char + char).join('');
  }

  // 普通形式 (#RRGGBB)
  const bigint = parseInt(hex, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255
  };
}


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