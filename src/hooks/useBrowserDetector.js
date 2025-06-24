import { ref, onMounted, computed } from 'vue'

/**
 * 浏览器环境检测Hook
 * 主要用于判断是否是PC端的Chrome浏览器
 */
export function useBrowserDetector(options = {}) {
  const { debug = false } = options
  
  // 浏览器环境信息
  const browserInfo = ref({
    userAgent: '',
    isChrome: false,
    isSafari: false,
    isFirefox: false,
    isEdge: false,
    isWindows: false,
    isMac: false,
    isIOS: false,
    isAndroid: false,
    isMobile: false,
    isWXWork: false,
    isDingTalk: false,
    isFeiShu: false,
    isWPS: false,
    isInIframe: false, // 是否在iframe中
    isPCChrome: false, // 核心需求：是否是PC端Chrome
    debugInfo: null, // 调试信息
    isDetected: false, // 是否已完成检测
  })

  // 检测浏览器环境
  const detectBrowser = () => {
    if (typeof window === 'undefined') {
      return // 服务端渲染时直接返回
    }

    // 获取完整的 User Agent 字符串
    const userAgent = window.navigator.userAgent
    
    // 检测是否在iframe中
    const isInIframe = window.self !== window.top
    
    // 浏览器检测 - 优化Chrome检测逻辑
    const isChrome = userAgent.includes('Chrome') && !userAgent.includes('Edge') && !userAgent.includes('Edg/')
    const isSafari = userAgent.includes('Safari') && !userAgent.includes('Chrome')
    const isFirefox = userAgent.includes('Firefox')
    const isEdge = userAgent.includes('Edge') || userAgent.includes('Edg/')

    // 操作系统检测
    const isWindows = userAgent.includes('Windows')
    const isMac = userAgent.includes('Macintosh') || userAgent.includes('MacIntel')
    const isIOS = userAgent.includes('iPhone') || userAgent.includes('iPad') || userAgent.includes('iPod')
    const isAndroid = userAgent.includes('Android')

    // 移动设备检测 - 优化检测逻辑
    const isMobile = /Mobile|Android|iPhone|iPad|iPod|BlackBerry|Windows Phone|webOS|Opera Mini/i.test(userAgent)

    // 企业应用环境检测 - 优化检测逻辑，使用大小写不敏感匹配
    const isWXWork = /wxwork/i.test(userAgent)
    const isDingTalk = /dingtalk/i.test(userAgent)
    const isFeiShu = /lark|feishu/i.test(userAgent)
    const isWPS = /wps/i.test(userAgent)

    // 创建调试信息
    const debugInfo = debug ? {
      userAgent,
      isInIframe,
      detectionResults: {
        isChrome,
        isMobile,
        isWXWork,
        isDingTalk,
        isFeiShu,
        isWPS,
      },
      chromeTest: userAgent.includes('Chrome'),
      edgeTest: userAgent.includes('Edge') || userAgent.includes('Edg/'),
      mobileTest: /Mobile|Android|iPhone|iPad|iPod|BlackBerry|Windows Phone|webOS|Opera Mini/i.test(userAgent),
      finalResult: isChrome && !isMobile && !isWXWork && !isDingTalk && !isFeiShu && !isWPS
    } : null

    // 核心需求：是否是PC端的Chrome浏览器
    const isPCChrome = isChrome && !isMobile && !isWXWork && !isDingTalk && !isFeiShu && !isWPS

    // 调试输出
    if (debug) {
      console.group('🔍 Browser Detection Debug')
      console.log('User Agent:', userAgent)
      console.log('In iframe:', isInIframe)
      console.log('Detection Results:', {
        isChrome,
        isMobile,
        isWXWork,
        isDingTalk,
        isFeiShu,
        isWPS,
        isPCChrome
      })
      console.log('Chrome test (includes Chrome):', userAgent.includes('Chrome'))
      console.log('Edge test (includes Edge/Edg):', userAgent.includes('Edge') || userAgent.includes('Edg/'))
      console.log('Mobile test:', /Mobile|Android|iPhone|iPad|iPod|BlackBerry|Windows Phone|webOS|Opera Mini/i.test(userAgent))
      console.log('Final isPCChrome:', isPCChrome)
      console.groupEnd()
    }

    // 更新浏览器信息
    browserInfo.value = {
      userAgent,
      isChrome,
      isSafari,
      isFirefox,
      isEdge,
      isWindows,
      isMac,
      isIOS,
      isAndroid,
      isMobile,
      isWXWork,
      isDingTalk,
      isFeiShu,
      isWPS,
      isInIframe,
      isPCChrome,
      debugInfo,
      isDetected: true,
    }
  }

  // 立即执行检测（不等待onMounted）
  if (typeof window !== 'undefined') {
    detectBrowser()
  }

  // 组件挂载时再次检测浏览器环境（确保准确性）
  onMounted(() => {
    detectBrowser()
  })

  // 创建响应式的computed属性
  const isPCChrome = computed(() => browserInfo.value.isPCChrome)
  const isMobile = computed(() => browserInfo.value.isMobile)
  const isChrome = computed(() => browserInfo.value.isChrome)
  const userAgent = computed(() => browserInfo.value.userAgent)
  const isInIframe = computed(() => browserInfo.value.isInIframe)
  const debugInfo = computed(() => browserInfo.value.debugInfo)
  const isDetected = computed(() => browserInfo.value.isDetected)

  // 返回浏览器信息和检测函数
  return {
    browserInfo,
    detectBrowser,
    // 响应式computed属性
    isPCChrome,
    isMobile,
    isChrome,
    userAgent,
    isInIframe,
    debugInfo,
    isDetected,
  }
}

// 导出单例版本，用于全局使用
let globalBrowserInfo = null

export function useGlobalBrowserDetector(options = {}) {
  if (!globalBrowserInfo) {
    globalBrowserInfo = useBrowserDetector(options)
  }
  return globalBrowserInfo
} 