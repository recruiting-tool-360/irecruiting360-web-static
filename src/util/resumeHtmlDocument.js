/**
 * 把渠道简历生成器产出的 HTML 片段（htmlContent）包装成完整 HTML 文档。
 *
 * 结构与 useSendResume.createHtmlFile 保持一致：
 *   `<div class="resume-container">{htmlContent}</div>` + 渠道 cssContent
 * 区别只是不再生成 File / 不做压缩——弹窗要直接在 iframe.srcdoc 里渲染。
 *
 * @param {Object} params
 * @param {string} params.htmlContent 渠道生成器返回的简历正文片段
 * @param {string} [params.cssContent] 渠道生成器返回的渠道样式
 * @param {string} [params.title] 文档标题
 * @returns {string} 完整 HTML 文档字符串
 */
export function buildResumeHtmlDocument({ htmlContent = '', cssContent = '', title = '简历详情' } = {}) {
  const safeTitle = String(title).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${safeTitle}</title>
    <style>
        ${cssContent}
    </style>
</head>
<body>
    <div class="resume-container">
        ${htmlContent}
    </div>
</body>
</html>`;
}
