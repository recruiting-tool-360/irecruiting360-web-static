/**
 * 渠道展示名统一格式化。
 *
 * 注意：项目内部及后端协议仍使用 `boss直聘` 作为渠道 desc/序列化值，
 * 这里只处理用户可见文案，不能用格式化后的值参与渠道匹配或接口传参。
 */
export const BOSS_DISPLAY_NAME = "BOSS直聘";

export function formatChannelDisplayName(value) {
  if (value == null) return "";
  const text = String(value).trim();
  if (/^boss(?:\s*直聘)?$/i.test(text)) return BOSS_DISPLAY_NAME;
  return text;
}

export default formatChannelDisplayName;
