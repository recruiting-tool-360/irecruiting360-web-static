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