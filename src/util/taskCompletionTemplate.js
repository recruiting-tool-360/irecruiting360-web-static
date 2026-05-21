/**
 * 任务完成卡片模板工具
 *
 * 模板源：src/server-html-templates/task-completion-card.html
 *   - 纯 HTML + mustache `{{ }}` 占位 + `data-action` 按钮属性
 *   - 这一份字符串也是发给后端的模板源
 *
 * 前端两类使用场景：
 *   1. 渲染后端推过来的卡片（SSE / chatHistory）：content 已经是后端填好的完整 HTML，
 *      **不需要替换占位符**，直接 v-html 渲染。
 *   2. 前端 mock / 测试卡片预览：用 renderTaskCompletionTemplate(cardData) 生成完整 HTML，
 *      模拟后端填充行为，方便单独调样式或测试组件交互。
 *
 * 工具函数：
 *   - rawTemplate                          原始模板字符串（含 {{ }} 占位）
 *   - renderTaskCompletionTemplate(data)   用 data 替换占位 → 完整 HTML（仅 mock/测试用）
 *   - isTaskCompletionCardHtml(content)    检测一个 HTML 字符串是不是任务完成卡片
 */

// vite ?raw：把 html 文件作为字符串导入（用作 source of truth 给后端、给前端 mock）
import rawTemplate from 'src/server-html-templates/task-completion-card.html?raw';

export { rawTemplate };

/** 默认占位值，cardData 没传时用，避免页面出现 {{xxx}} 字面量 */
const DEFAULTS = {
  taskId: '-',
  taskChannelId: '-',
  taskChannelIds: '-',
  searchConditionId: '-',
  searchConditionIds: '-',
  chatId: '-',
  totalCount: 0,
  bossCount: 0,
  actualStartTime: '-',
  actualEndTime: '-',
  actualDuration: '-'
};

/**
 * 用 cardData 替换模板里的 `{{ key }}` 占位 → 完整 HTML 字符串。
 *
 * 仅 mock / 测试用。生产中后端会自己替换并把完整 HTML 通过 SSE/chatHistory 推过来，
 * 前端不需要调这个函数。
 *
 * 简易 mustache：`{{ key }}` / `{{key}}` 都支持，不支持嵌套 / helper / 条件渲染。
 *
 * @param {object} cardData 数据键名跟模板里 `{{ key }}` 一一对应
 * @returns {string} 完整 HTML 字符串
 */
export function renderTaskCompletionTemplate(cardData) {
  const merged = { ...DEFAULTS, ...(cardData || {}) };
  return rawTemplate.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (matched, key) => {
    if (Object.prototype.hasOwnProperty.call(merged, key)) {
      const v = merged[key];
      return v == null ? '' : String(v);
    }
    // 未识别的占位符保留原样，便于排查后端字段对不上的情况
    return matched;
  });
}

/**
 * 检测一段 HTML 字符串是否是"任务完成卡片"消息（后端 SSE/chatHistory 推过来的）
 *
 * 简单字符串匹配 `data-message-type="TASK_COMPLETION_CARD"`，不做 DOM 解析。
 *
 * @param {string} content
 * @returns {boolean}
 */
export function isTaskCompletionCardHtml(content) {
  if (typeof content !== 'string' || content.length === 0) return false;
  return content.includes('data-message-type="TASK_COMPLETION_CARD"');
}

/**
 * 检测一段 content 是否是"任务进度卡片 JSON"消息（后端老版本会把任务运行中的进度
 * 状态序列化为 JSON 字符串发到 chatHistory）。
 *
 * 典型形态：
 *   "{\"type\":\"TASK_CHANNEL_PROGRESS_CARD\",\"taskId\":34,...}"
 *
 * 前端**不需要**渲染这种 JSON —— 任务进度由 `TaskStatusCard` 通过 Vuex reactive 实时绘制，
 * 不依赖历史回放。直接过滤掉，避免聊天里出现一坨 JSON 字符串。
 *
 * 用关键字串匹配（不解析整段 JSON）减少异常风险，性能也好。
 *
 * @param {string} content
 * @returns {boolean}
 */
export function isTaskChannelProgressCardJson(content) {
  if (typeof content !== 'string' || content.length === 0) return false;
  // content 是 JSON 字符串里以 "type":"TASK_CHANNEL_PROGRESS_CARD" 形式出现
  // 容错：可能有空格变种，正则更稳
  return /"type"\s*:\s*"TASK_CHANNEL_PROGRESS_CARD"/.test(content);
}
