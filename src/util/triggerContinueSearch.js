/**
 * 搜索结果页「加载更多」统一入口：改为走任务流程的「保留增量搜索」（CONTINUE），
 * 而不是各渠道直接翻下一页。
 *
 * 实现：拿到 store 里的 ChatCard 实例（getChatCardRefValue，IndexPage onMounted 时 commit），
 * 调它的 startContinueSearch()——内部 push 占位卡 + emit aggregate-search(CONTINUE) →
 * IndexPage.handleAggregateSearch 创建任务 + 切回聊天视图。
 *
 * @param {import('vuex').Store} store
 * @returns {boolean} 是否成功发起
 */
export function triggerContinueSearchFromResults(store) {
  try {
    const chatCard = store?.getters?.getChatCardRefValue;
    if (chatCard && typeof chatCard.startContinueSearch === "function") {
      return chatCard.startContinueSearch();
    }
    console.warn("[triggerContinueSearch] chatCardRef 不可用，无法走保留增量搜索流程");
  } catch (e) {
    console.warn("[triggerContinueSearch] 异常:", e?.message || e);
  }
  return false;
}

export default { triggerContinueSearchFromResults };
