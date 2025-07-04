/**
 * 简历文件生成配置
 */
export const RESUME_FILE_CONFIG = {
  // 文件生成类型：'html' | 'image' | 'both'
  fileType: 'html', // 默认生成HTML文件
  
  // HTML文件配置
  html: {
    // 是否包含打印样式
    includePrintStyles: true,
    // 是否添加页面样式美化
    addPageStyles: true,
    // 文件编码
    encoding: 'utf-8',
    // 是否压缩HTML
    minify: true,
    // 压缩级别：'light' | 'standard' | 'deep'
    minifyLevel: 'light',
    // 详细压缩配置
    minifyOptions: {
      // 轻量级压缩选项
      light: {
        removeComments: true,
        removeRedundantWhitespace: true,
        preserveLineBreaks: true,
        collapseWhitespace: false,
        removeEmptyLines: false,
        trimLines: true,
        preservePreTags: true
      },
      // 标准压缩选项
      standard: {
        removeComments: true,
        removeRedundantWhitespace: true,
        preserveLineBreaks: false,
        collapseWhitespace: true,
        removeEmptyLines: true,
        trimLines: true,
        preservePreTags: true
      },
      // 深度压缩选项
      deep: {
        removeComments: true,
        removeRedundantWhitespace: true,
        preserveLineBreaks: false,
        collapseWhitespace: true,
        removeEmptyLines: true,
        trimLines: true,
        preservePreTags: true,
        // 深度压缩附加选项
        removeAttributeQuotes: false, // 保留属性引号以确保兼容性
        sortAttributes: false,        // 不排序属性以保持原样
        sortClassName: false          // 不排序class名称
      }
    }
  },
  
  // 图片文件配置
  image: {
    // 图片格式：'png' | 'jpeg'
    format: 'png',
    // 图片质量 (0.1 - 1.0)
    quality: 0.9,
    // 图片宽度
    width: 790,
    // 缩放比例
    scale: 1
  },
  
  // 性能配置
  performance: {
    // 是否启用批量处理
    enableBatch: true,
    // 批处理大小
    batchSize: 5,
    // 处理间隔(ms)
    processingDelay: 100,
    // 是否显示压缩详情
    showCompressionDetails: true
  }
};

/**
 * 获取当前配置
 * @returns {Object} 当前配置对象
 */
export function getResumeFileConfig() {
  return RESUME_FILE_CONFIG;
}

/**
 * 更新配置
 * @param {Object} newConfig - 新的配置项
 */
export function updateResumeFileConfig(newConfig) {
  Object.assign(RESUME_FILE_CONFIG, newConfig);
}

/**
 * 检查是否应该生成HTML文件
 * @returns {boolean}
 */
export function shouldGenerateHtml() {
  return RESUME_FILE_CONFIG.fileType === 'html' || RESUME_FILE_CONFIG.fileType === 'both';
}

/**
 * 检查是否应该生成图片文件
 * @returns {boolean}
 */
export function shouldGenerateImage() {
  return RESUME_FILE_CONFIG.fileType === 'image' || RESUME_FILE_CONFIG.fileType === 'both';
}

/**
 * 获取HTML压缩选项
 * @param {string} level - 压缩级别
 * @returns {Object} 压缩选项
 */
export function getMinifyOptions(level = 'standard') {
  return RESUME_FILE_CONFIG.html.minifyOptions[level] || RESUME_FILE_CONFIG.html.minifyOptions.standard;
}

/**
 * 设置压缩级别
 * @param {string} level - 压缩级别 'light' | 'standard' | 'deep'
 */
export function setMinifyLevel(level) {
  if (['light', 'standard', 'deep'].includes(level)) {
    RESUME_FILE_CONFIG.html.minifyLevel = level;
    console.log(`HTML压缩级别已设置为: ${level}`);
  } else {
    console.warn(`无效的压缩级别: ${level}，保持当前设置: ${RESUME_FILE_CONFIG.html.minifyLevel}`);
  }
}

/**
 * 启用/禁用HTML压缩
 * @param {boolean} enabled - 是否启用压缩
 */
export function setMinifyEnabled(enabled) {
  RESUME_FILE_CONFIG.html.minify = Boolean(enabled);
  console.log(`HTML压缩已${enabled ? '启用' : '禁用'}`);
} 