/**
 * BOSS 推荐 - "点击筛选按钮 + 弹出筛选弹层" 冒烟测试（**仅开发期 + Electron 客户端**）
 *
 * 跟之前那条已下线的 Playwright 路径不同：
 *   - **完全不 import** Playwright / playwright-core / runScript / runOnTab
 *   - **完全不需要** `ENABLE_REMOTE_DEBUG=1` 启动（不开 `--remote-debugging-port`）
 *   - 用同进程 CDP（`webContents.debugger`）发 `Input.dispatchMouseEvent`，
 *     生成 `isTrusted=true` 的合法鼠标事件，BOSS 视角下跟用户真实点击无差别
 *
 * ⚠️ 安全提示：
 *   - **用没被风控过的 BOSS 账号**测试（之前那个账号 24h 内被禁登录）
 *   - 这是冒烟测试，**只点一次**，看筛选弹框是否弹出
 *   - 跑完别立刻连续跑——保持节奏，避免 BOSS 行为风控
 *   - 如果出现任何"账号异常"/"安全提示"立即停止
 *
 * 用法（仅 Electron 客户端 DevTools Console）：
 *   await window.__DEV_bossClickFilter('<encryptJobId>')
 *
 * 隔离：本文件 **没有任何静态 import 入口**，仅 IndexPage.vue onMounted 动态 import。
 * 生产 bundle 完全不含本文件（详见 IndexPage.vue 三重守卫）。
 */

import { openBossRecommend } from "src/util/automation/bossRecommend";

const FILTER_TRIGGER_SELECTOR = ".filter-wrap";
const FILTER_PANEL_SELECTOR = ".filter-panel";

/**
 * 一次性冒烟测试：打开 BOSS 推荐 tab → 等页面加载 → CDP 点 .filter-wrap → 等 .filter-panel 出现
 *
 * @param {string} encryptJobId
 * @returns {Promise<{
 *   ok: boolean,
 *   tabId?: string,
 *   url?: string,
 *   data?: { clickPoint: {x,y}, foundIn: string, panelOpened: boolean, elapsedMs: number },
 *   errorCode?: string,
 *   message?: string,
 *   logs?: string[]
 * }>}
 */
export async function testClickFilterOnce(encryptJobId) {
  if (!encryptJobId) {
    return { ok: false, errorCode: "BAD_REQUEST", message: "encryptJobId required" };
  }
  if (!window?.api?.automation?.clickOnTab) {
    return {
      ok: false,
      errorCode: "NOT_IN_CLIENT",
      message: "window.api.automation.clickOnTab 不可用（preload 旧版本？请重启客户端）"
    };
  }

  console.log("[bossClickFilter] === 冒烟测试开始（CDP 路径，无 --remote-debugging-port） ===");
  console.log("[bossClickFilter] 1) 打开 BOSS 推荐 tab", encryptJobId);
  const opened = await openBossRecommend(encryptJobId);
  if (!opened.ok) {
    console.warn("[bossClickFilter] openBossRecommend 失败:", opened.errorCode, opened.message);
    return opened;
  }

  // 给 BOSS 自己 SPA 路由 + 网络请求 + iframe 加载稳定时间
  const navWaitMs = 3000;
  console.log(`[bossClickFilter] 2) 等 ${navWaitMs}ms 让页面 DOM 稳定`);
  await new Promise((r) => setTimeout(r, navWaitMs));

  // 3) CDP 发送鼠标 click
  console.log("[bossClickFilter] 3) CDP Input.dispatchMouseEvent → .filter-wrap");
  const clickRes = await window.api.automation.clickOnTab({
    tabId: opened.tabId,
    selector: FILTER_TRIGGER_SELECTOR,
    pressHoldMs: 50, // ~50ms 接近真实人类按下到释放
    requireVisible: true
  });
  if (!clickRes.ok) {
    console.warn(
      "[bossClickFilter] click 失败:",
      clickRes.error?.code,
      clickRes.error?.message,
      "logs:",
      clickRes.logs
    );
    return {
      ok: false,
      tabId: opened.tabId,
      url: opened.url,
      errorCode: clickRes.error?.code,
      message: clickRes.error?.message,
      logs: clickRes.logs
    };
  }
  console.log(
    `[bossClickFilter] click ok: (${clickRes.data.x}, ${clickRes.data.y}) in ${clickRes.data.foundIn}, size=${clickRes.data.width}x${clickRes.data.height}, elapsed=${clickRes.data.elapsedMs}ms`
  );

  // 4) 验证筛选弹框是否真打开了（再等一下让 BOSS 自己的 SPA 把弹框 mount 出来）
  await new Promise((r) => setTimeout(r, 800));
  console.log("[bossClickFilter] 4) 检查 .filter-panel 是否可见");
  // 直接复用同一个 CDP 通道做"找元素 + 可见性判断"，但不点；
  // 取巧：clickOnTab 内部 findElement 会 require visible，借这个间接判断
  // 用 requireVisible:true 但传一个不会真点击的 selector → 这条不行
  // 改用：让 clickOnTab 不点 panel，仅做存在性检查 → 不存在 API，那就直接用 executeJavaScript 路径
  // 但 preload 没暴露 executeJavaScript 给 renderer。先记录 click 后状态，由用户肉眼确认弹框
  console.log(
    "[bossClickFilter] === 完成 === 现在切到 BOSS tab 看筛选弹框是否打开。" +
      "**如果出现任何 BOSS 安全弹窗，立即停止后续测试 + 切回 dev:el:local**"
  );

  return {
    ok: true,
    tabId: opened.tabId,
    url: opened.url,
    data: {
      clickPoint: { x: clickRes.data.x, y: clickRes.data.y },
      foundIn: clickRes.data.foundIn,
      panelOpened: null, // 由用户肉眼确认
      elapsedMs: clickRes.data.elapsedMs
    },
    logs: clickRes.logs
  };
}
