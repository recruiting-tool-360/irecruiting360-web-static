import { boot } from "quasar/wrappers";
import IframeMessenger from "src/util/iframeMessenger";

// 原始域名列表 - 用于测试域名规则
const originalDomains = [
  "http://localhost:5001",
  "http://192.168.7.121:5001",
  "https://ambulance1a.ihr360.com", // ihr环境
  "https://passport-qa2.ihr360.com", // qa2
  "https://uatstable.ihr360.com", // uatstable
  "https://qa2-vip.ihr360.com", // qa2-vip
  "https://account.ihr360.com", // 账号中心
  "https://v5.ihr360.com", // 线上
  "https://uatstable.ihr360.com",
  "https://qa2.ihr360.com",
  "https://war.ihr360.com",
  "https://ding-qa2.ihr360.com",
  "https://ding-uatstable.ihr360.com",
  "https://ding-isv.ihr360.com",
  "https://ding-hangzhou.ihr360.com",
  "https://ding-hangzhou1.ihr360.com",
  "https://ding-hangzhou2.ihr360.com",
  "https://ding-hangzhou3.ihr360.com",
  "https://ding-hangzhou4.ihr360.com",
  "https://ding-hangzhou5.ihr360.com",
  "https://ding-hangzhou6.ihr360.com",
  "https://ding-hangzhou7.ihr360.com",
  "https://ding-hangzhou8.ihr360.com",
  "https://ding-hangzhou9.ihr360.com",
  "https://ding-hangzhou10.ihr360.com",
  "https://ding-hangzhou11.ihr360.com",
  "https://ding-hangzhou12.ihr360.com",
  "https://ding-hangzhou13.ihr360.com",
  "https://try-handy.com",
  "https://ding-hangzhou1.try-handy.com",
  "https://ding-hangzhou2.try-handy.com",
  "https://ding-hangzhou3.try-handy.com",
  "https://ding-hangzhou4.try-handy.com",
  "https://ding-hangzhou5.try-handy.com",
  "https://ding-hangzhou6.try-handy.com",
  "https://ding-hangzhou7.try-handy.com",
  "https://ding-hangzhou8.try-handy.com",
  "https://ding-hangzhou9.try-handy.com",
  "https://ding-hangzhou10.try-handy.com",
  "https://ding-hangzhou11.try-handy.com",
  "https://ding-hangzhou12.try-handy.com",
  "https://ding-hangzhou13.try-handy.com",
  "https://ding-hangzhou2.lethic.cn",
  "https://ding-hangzhou.lethic.cn",
  "https://app45424.eapps.dingtalkcloud.com",
  "https://app117034.eapps.dingtalkcloud.com",
  "https://ding-fzsm.ihr360.com",
  "https://ding-fzsm.try-handy.com",
  "https://ding-hw.ihr360.com",
  "https://ding-hw.try-handy.com",
  "https://uatstable.ihr360.com",
  "https://www.ihr360.com",
  "https://vip.ihr360.com",
  "https://hw.ihr360.com"
];

// 正则规则
const targetOrigin = [
  "http://localhost:5001",
  "http://192.168.7.121:5001",

  // ihr360.com 及其所有子域名
  /^https:\/\/([\w-]+\.)?ihr360\.com$/,

  // try-handy.com 的所有子域名
  /^https:\/\/([\w-]+\.)?try-handy\.com$/,

  // lethic.cn 的所有子域名
  /^https:\/\/([\w-]+\.)?lethic\.cn$/,

  // 钉钉相关域名
  /^https:\/\/app\d+\.eapps\.dingtalkcloud\.com$/
];

/**
 * 测试域名是否匹配规则
 * @param {Array<string|RegExp>} rules - 域名匹配规则数组
 * @param {Array<string>} domains - 要测试的域名数组
 * @returns {Object} 测试结果
 */
function testDomainRules(rules, domains) {
  const result = {
    matched: [],
    unmatched: [],
    summary: {
      total: domains.length,
      matched: 0,
      unmatched: 0
    }
  };

  domains.forEach((domain) => {
    const isMatched = rules.some((rule) => {
      if (rule === "*") return true;
      if (typeof rule === "string") return rule === domain;
      if (rule instanceof RegExp) return rule.test(domain);
      return false;
    });

    if (isMatched) {
      result.matched.push(domain);
      result.summary.matched++;
    } else {
      result.unmatched.push(domain);
      result.summary.unmatched++;
    }
  });

  return result;
}

// 在开发环境下运行测试
if (process.env.DEV) {
  console.group("域名规则测试结果");
  const testResult = testDomainRules(targetOrigin, originalDomains);
  console.log("匹配成功数量:", testResult.summary.matched);
  console.log("未匹配数量:", testResult.summary.unmatched);

  if (testResult.unmatched.length > 0) {
    console.warn("未匹配的域名:", testResult.unmatched);
  }
  console.groupEnd();
}

export default boot(({ app }) => {
  // 初始化 IframeMessenger
  const iframeMessenger = new IframeMessenger({
    targetWindow: window.parent,
    targetOrigin,
    sourceName: "kuaizhao"
  });

  // 连接
  iframeMessenger.connect();
  // 挂载到全局
  app.config.globalProperties.$iframeMessenger = iframeMessenger;
  // 页面卸载前清理
  window.addEventListener("beforeunload", () => {
    iframeMessenger.destroy();
  });
});
