/**
 * 桌面端当前开放的招聘渠道。
 *
 * JOB51 / ZHILIAN 仅做产品层临时下架：保留底层代码与配置项，但在桌面端隐藏并强制禁用。
 * 后续恢复时只需把对应项的 visible/defaultEnabled 改回 true。
 */
export const CLIENT_CHANNELS = [
  { key: "BOSS", name: "boss直聘", visible: true, defaultEnabled: true },
  { key: "JOB51", name: "前程无忧", visible: false, defaultEnabled: false },
  { key: "ZHILIAN", name: "智联招聘", visible: false, defaultEnabled: false }
];

export function isClientChannelVisible(key) {
  return CLIENT_CHANNELS.some((channel) => channel.key === key && channel.visible);
}

/**
 * 将历史配置收敛为当前桌面端渠道策略：
 * - BOSS：无配置时默认启用；当前只有它可见，因此即使历史配置关闭也会兜底启用。
 * - 暂时下架渠道：无论历史状态如何都禁用，避免隐藏后仍参与任务或登录检测。
 * - 后续恢复多个渠道时，仍保证至少有一个可见渠道处于启用状态。
 */
export function normalizeClientChannelConfig(savedConfig) {
  const saved = Array.isArray(savedConfig) ? savedConfig : [];
  const normalized = CLIENT_CHANNELS.map((fallback) => {
    const current = saved.find((channel) => channel?.key === fallback.key);
    const historicalEnabled = current
      ? Object.prototype.hasOwnProperty.call(current, "enableConfig")
        ? current.enableConfig !== false
        : Object.prototype.hasOwnProperty.call(current, "disable")
          ? current.disable !== true
          : fallback.defaultEnabled
      : fallback.defaultEnabled;
    return {
      key: fallback.key,
      name: fallback.name,
      enableConfig: fallback.visible ? historicalEnabled : false
    };
  });
  // 当前开放渠道中必须至少启用一个；现在只有 BOSS，因此它始终会被兜底选中。
  const hasEnabledVisibleChannel = normalized.some(
    (channel) => isClientChannelVisible(channel.key) && channel.enableConfig
  );
  if (!hasEnabledVisibleChannel) {
    const firstVisible = normalized.find((channel) => isClientChannelVisible(channel.key));
    if (firstVisible) firstVisible.enableConfig = true;
  }
  return normalized;
}

export function isSameClientChannelConfig(currentConfig, normalizedConfig) {
  if (!Array.isArray(currentConfig) || currentConfig.length !== normalizedConfig.length) {
    return false;
  }
  return normalizedConfig.every((expected) => {
    const current = currentConfig.find((channel) => channel?.key === expected.key);
    return !!current && current.enableConfig === expected.enableConfig;
  });
}

export default {
  CLIENT_CHANNELS,
  isClientChannelVisible,
  normalizeClientChannelConfig,
  isSameClientChannelConfig
};
