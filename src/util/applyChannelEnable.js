/**
 * 应用「渠道启用/禁用」配置 —— 与左下角「设置功能」及未登录渠道面板
 * 共用同一份数据源（store.getUserChannelConfig）和同一套副作用：
 *   1) commit setUserChannelConfig（持久化 + 全局响应式，弹框/面板互相同步）
 *   2) 起/停各渠道登录态监视（BOSS 单例 tab / 51job / 智联 10s 轮询）
 *   3) 停掉被禁用渠道仍在进行中的 channel 任务
 *
 * 供「设置功能」和「未检测到登录状态」面板（LoginRequiredPanel）共同调用，
 * 保证两处切换启用状态行为一致。
 *
 * @param {import('vuex').Store} store
 * @param {Array<{ key: string, name?: string, enableConfig: boolean }>} configData 全量渠道配置
 */
import { setBossWatcherEnabled } from "src/util/automation/bossResidentWatcher";
import { setJob51WatcherEnabled } from "src/util/automation/job51LoginWatcher";
import { setZhilianWatcherEnabled } from "src/util/automation/zhilianLoginWatcher";

export function applyChannelEnableConfig(store, configData) {
  if (!store || !Array.isArray(configData)) return;

  // 1) 写入共享数据源（持久化路径 UserConfig.userChannelConfig）
  store.commit("setUserChannelConfig", configData);

  const find = (k) => configData.find((c) => c && c.key === k);

  // 2) 起/停登录态监视（与 AISearch.saveChannelEnable 同口径）
  const boss = find("BOSS");
  if (boss) setBossWatcherEnabled(store, boss.enableConfig !== false);
  const job51 = find("JOB51");
  if (job51) setJob51WatcherEnabled(store, job51.enableConfig !== false);
  const zhilian = find("ZHILIAN");
  if (zhilian) setZhilianWatcherEnabled(store, zhilian.enableConfig !== false);

  // 3) 停掉被禁用渠道进行中的任务（标注：用户禁用渠道导致停止任务）
  const disabledKeys = configData
    .filter((c) => c && c.enableConfig === false)
    .map((c) => c.key);
  if (disabledKeys.length > 0) {
    store.dispatch("SearchTasks/stopDisabledChannels", { disabledKeys }).catch(() => {});
  }
}

export default { applyChannelEnableConfig };
