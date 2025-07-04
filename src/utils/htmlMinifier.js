/**
 * HTML压缩工具
 * 删除多余的空格、换行符、制表符和注释来减小HTML文件大小
 */

/**
 * 压缩HTML字符串
 * @param {string} html - 原始HTML内容
 * @param {Object} options - 压缩选项
 * @returns {string} 压缩后的HTML内容
 */
export function minifyHtml(html, options = {}) {
  if (!html || typeof html !== 'string') {
    return html;
  }

  const defaultOptions = {
    removeComments: true,           // 删除HTML注释
    removeRedundantWhitespace: true, // 删除多余的空白字符
    preserveLineBreaks: false,      // 是否保留换行符
    collapseWhitespace: true,       // 折叠空白字符
    removeEmptyLines: true,         // 删除空行
    trimLines: true,               // 删除行首行尾空格
    preservePreTags: true          // 保留pre标签内的格式
  };

  const config = { ...defaultOptions, ...options };
  let result = html;

  // 保存需要保留格式的标签内容
  const preservedTags = [];
  const preserveTagPattern = /<(pre|code|script|style)[^>]*>[\s\S]*?<\/\1>/gi;
  
  if (config.preservePreTags) {
    result = result.replace(preserveTagPattern, (match, tagName) => {
      const index = preservedTags.length;
      preservedTags.push(match);
      return `__PRESERVED_TAG_${index}__`;
    });
  }

  // 删除HTML注释（除了条件注释）
  if (config.removeComments) {
    result = result.replace(/<!--(?!\[if)[\s\S]*?(?<!\[endif])-->/g, '');
  }

  // 删除行首行尾空格
  if (config.trimLines) {
    result = result.replace(/^[ \t]+|[ \t]+$/gm, '');
  }

  // 删除空行
  if (config.removeEmptyLines) {
    result = result.replace(/\n\s*\n/g, '\n');
  }

  // 压缩标签间的空白字符
  if (config.collapseWhitespace) {
    // 压缩多个空格为一个空格
    result = result.replace(/[ \t]+/g, ' ');
    
    // 删除标签前后的空格
    result = result.replace(/>\s+</g, '><');
    
    // 删除标签内部多余的空格
    result = result.replace(/\s+>/g, '>');
    result = result.replace(/<\s+/g, '<');
  }

  // 删除换行符（可选）
  if (!config.preserveLineBreaks) {
    result = result.replace(/\n/g, '');
    result = result.replace(/\r/g, '');
  }

  // 删除多余的空白字符
  if (config.removeRedundantWhitespace) {
    // 删除连续的空白字符
    result = result.replace(/\s{2,}/g, ' ');
    
    // 删除DOCTYPE声明后的空格
    result = result.replace(/<!DOCTYPE[^>]*>\s+/i, (match) => match.trim() + ' ');
    
    // 删除html标签后的空格
    result = result.replace(/<html[^>]*>\s+/i, (match) => match.trim());
    result = result.replace(/<\/html>\s*$/i, '</html>');
    
    // 删除head和body标签前后的空格
    result = result.replace(/\s*<head[^>]*>\s*/i, '<head>');
    result = result.replace(/\s*<\/head>\s*/i, '</head>');
    result = result.replace(/\s*<body[^>]*>\s*/i, '<body>');
    result = result.replace(/\s*<\/body>\s*/i, '</body>');
  }

  // 恢复需要保留格式的标签内容
  if (config.preservePreTags) {
    preservedTags.forEach((content, index) => {
      result = result.replace(`__PRESERVED_TAG_${index}__`, content);
    });
  }

  // 最终清理
  result = result.trim();

  return result;
}

/**
 * 获取HTML压缩后的大小信息
 * @param {string} originalHtml - 原始HTML
 * @param {string} minifiedHtml - 压缩后的HTML
 * @returns {Object} 大小信息
 */
export function getCompressionInfo(originalHtml, minifiedHtml) {
  const originalSize = new Blob([originalHtml]).size;
  const minifiedSize = new Blob([minifiedHtml]).size;
  const savedBytes = originalSize - minifiedSize;
  const compressionRatio = ((savedBytes / originalSize) * 100).toFixed(2);

  return {
    originalSize,
    minifiedSize,
    savedBytes,
    compressionRatio: `${compressionRatio}%`,
    sizeReduction: savedBytes > 0 ? `减少了 ${savedBytes} 字节` : '未减少大小'
  };
}

/**
 * 轻量级压缩 - 仅删除基本的空白字符
 * @param {string} html - HTML内容
 * @returns {string} 压缩后的HTML
 */
export function lightMinify(html) {
  return minifyHtml(html, {
    removeComments: true,
    removeRedundantWhitespace: true,
    preserveLineBreaks: true,
    collapseWhitespace: false,
    removeEmptyLines: false,
    trimLines: true,
    preservePreTags: true
  });
}

/**
 * 深度压缩 - 最大程度减少文件大小
 * @param {string} html - HTML内容
 * @returns {string} 压缩后的HTML
 */
export function deepMinify(html) {
  return minifyHtml(html, {
    removeComments: true,
    removeRedundantWhitespace: true,
    preserveLineBreaks: false,
    collapseWhitespace: true,
    removeEmptyLines: true,
    trimLines: true,
    preservePreTags: true
  });
} 