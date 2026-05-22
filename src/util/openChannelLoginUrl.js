/**
 * 在客户端模式下走 IPC 让主进程开独立 BrowserWindow，
 * 在浏览器模式下走 window.open 开新标签页。
 *
 * 适用场景（凡是要在新窗口/新标签打开"招聘站点"的页面，都走这里）：
 *   - 渠道登录页（前往登录 BOSS / 智联 / 猎聘 / 51Job）
 *   - 候选人详情页 (BOSS m.zhipin.com、智联 resume/detail、51Job 简历详情等)
 *   - BOSS 沟通页（/web/chat/interaction）
 *   - 任何业务流程跳转到招聘站的 URL
 *
 * 客户端模式下，每个 channel 走独立 partition，cookie / 登录态隔离持久化；
 * 浏览器模式下行为完全等价于 window.open(url, '_blank')。
 */

/**
 * 是否运行在 Electron 客户端里（preload 注入了 __IKUAIZHAO_NATIVE__）
 * @returns {boolean}
 */
export function isElectronClient() {
  if (typeof window === 'undefined') return false;
  const native = window.__IKUAIZHAO_NATIVE__;
  return !!native && native.mode === 'electron';
}

/**
 * 根据 URL 自动识别属于哪个招聘渠道
 * @param {string} url
 * @returns {'boss'|'zhilian'|'liepin'|'job51'|null}
 */
export function pickChannelByUrl(url) {
  if (typeof url !== 'string' || !url) return null;
  let host = '';
  try {
    host = new URL(url, window.location.href).host;
  } catch (_e) {
    // 非合法 URL，无法识别
    return null;
  }
  if (host.endsWith('zhipin.com')) return 'boss';
  if (host.endsWith('zhaopin.com')) return 'zhilian';
  if (host.endsWith('liepin.com')) return 'liepin';
  if (host.endsWith('51job.com')) return 'job51';
  return null;
}

/**
 * 显式指定 channel 打开招聘站 URL（前往登录、详情页、沟通页都用它）
 * @param {string} channel  渠道 key (boss/zhilian/liepin/job51)
 * @param {string} url      完整 URL
 * @param {Object} [opts]
 * @param {boolean} [opts.forceReload=false]
 *   tab 已存在（同 URL 复用）时强制 reload，让 SPA 重新拉数据。
 *   场景："立即沟通" 跳 BOSS 互动消息页 / 查看详情等——用户刚操作完
 *   （收藏 / 加入人才库 / 分配职位），跳过去期望看到刚加进去的人，
 *   但 BOSS SPA 不会自动刷新，必须 reload。
 * @returns {Promise<{success:boolean, message?:string, tabId?:string}|Window|null>}
 */
export async function openChannelUrl(channel, url, opts = {}) {
  if (!url) {
    console.warn('[openChannelUrl] empty url, skip');
    return { success: false, message: 'empty url' };
  }

  if (isElectronClient()) {
    const recruitBridge = window.api && window.api.recruitBridge;
    if (recruitBridge && typeof recruitBridge.openSiteWindow === 'function') {
      const result = await recruitBridge.openSiteWindow(channel, url);
      // forceReload 选项：拿到 tabId 之后调一次 tabs.loadUrl，触发完整 navigation，
      // SPA 重新启动 → 自动拉最新数据。
      if (opts && opts.forceReload && result && result.tabId) {
        try {
          const tabsApi = window.api && window.api.tabs;
          if (tabsApi && typeof tabsApi.loadUrl === 'function') {
            await tabsApi.loadUrl(result.tabId, url);
            console.log(`[openChannelUrl] forceReload tab=${result.tabId} url=${url}`);
          } else if (tabsApi && typeof tabsApi.reload === 'function') {
            await tabsApi.reload(result.tabId);
            console.log(`[openChannelUrl] forceReload fallback tab=${result.tabId} reload()`);
          }
        } catch (e) {
          console.warn('[openChannelUrl] forceReload 失败（忽略）:', e?.message || e);
        }
      }
      return result;
    }
    console.warn(
      '[openChannelUrl] Electron 客户端环境但 recruitBridge 未就绪，回退 window.open'
    );
  }

  return window.open(url, '_blank');
}

/**
 * 不指定 channel，根据 URL 自动识别。识别不到就走系统浏览器（兜底）
 * 业务代码里"打开外部 URL"统一走它，对网页 / 客户端透明
 * @param {string} url
 * @returns {Promise<*>}
 */
export function openExternalSiteUrl(url, opts) {
  const channel = pickChannelByUrl(url);
  if (channel) {
    return openChannelUrl(channel, url, opts);
  }
  // 不是招聘站 URL：浏览器模式 window.open；客户端模式下主进程的 setWindowOpenHandler
  // 会把它丢给 shell.openExternal（系统浏览器），这是合理的（用户协议、文档等外链）
  return Promise.resolve(window.open(url, '_blank'));
}

/**
 * 向后兼容：旧调用名（前面已经被几个 channel 文件 import 用了）
 */
export const openChannelLoginUrl = openChannelUrl;
