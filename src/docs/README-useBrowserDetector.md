# useBrowserDetector Hook

这是一个用于检测浏览器环境的Vue 3 Composition API hook，特别适用于判断是否是PC端的Chrome浏览器环境。

## 功能特性

- ✅ 检测各种浏览器类型（Chrome、Safari、Firefox、Edge）
- ✅ 检测操作系统（Windows、macOS、iOS、Android）
- ✅ 检测设备类型（移动设备 vs 桌面设备）
- ✅ 检测企业应用环境（企业微信、钉钉、飞书）
- ✅ **核心功能**：判断是否是PC端Chrome浏览器
- ✅ 响应式数据，自动更新
- ✅ 支持服务端渲染（SSR）

## 基本用法

### 1. 基本使用

```vue
<template>
  <div>
    <div v-if="isPCChrome">
      ✅ 当前是PC端Chrome浏览器
    </div>
    <div v-else>
      ❌ 当前不是PC端Chrome浏览器
    </div>
  </div>
</template>

<script setup>
import { useBrowserDetector } from '@/hooks/useBrowserDetector'

const { isPCChrome } = useBrowserDetector()
</script>
```

### 2. 获取详细信息

```vue
<script setup>
import { useBrowserDetector } from '@/hooks/useBrowserDetector'

const { 
  browserInfo, 
  isPCChrome, 
  isMobile, 
  isChrome, 
  userAgent 
} = useBrowserDetector()

// 检查具体信息
console.log('是否是PC端Chrome:', isPCChrome)
console.log('是否是移动设备:', isMobile)
console.log('是否是Chrome浏览器:', isChrome)
console.log('完整浏览器信息:', browserInfo.value)
</script>
```

### 3. 全局使用（单例模式）

如果需要在多个组件中共享同一个检测结果，可以使用全局版本：

```vue
<script setup>
import { useGlobalBrowserDetector } from '@/hooks/useBrowserDetector'

const { isPCChrome, browserInfo } = useGlobalBrowserDetector()
</script>
```

## API 文档

### 返回值

| 属性 | 类型 | 描述 |
|------|------|------|
| `browserInfo` | `Ref<Object>` | 包含所有浏览器检测信息的响应式对象 |
| `detectBrowser` | `Function` | 手动重新检测浏览器环境的函数 |
| `isPCChrome` | `ComputedRef<boolean>` | 是否是PC端Chrome浏览器（核心功能） |
| `isMobile` | `ComputedRef<boolean>` | 是否是移动设备 |
| `isChrome` | `ComputedRef<boolean>` | 是否是Chrome浏览器 |
| `userAgent` | `ComputedRef<string>` | 用户代理字符串 |

### browserInfo 对象结构

```javascript
{
  userAgent: string,      // 完整的User Agent字符串
  isChrome: boolean,      // 是否是Chrome浏览器
  isSafari: boolean,      // 是否是Safari浏览器
  isFirefox: boolean,     // 是否是Firefox浏览器
  isEdge: boolean,        // 是否是Edge浏览器
  isWindows: boolean,     // 是否是Windows系统
  isMac: boolean,         // 是否是Mac系统
  isIOS: boolean,         // 是否是iOS系统
  isAndroid: boolean,     // 是否是Android系统
  isMobile: boolean,      // 是否是移动设备
  isWXWork: boolean,      // 是否是企业微信环境
  isDingTalk: boolean,    // 是否是钉钉环境
  isFeiShu: boolean,      // 是否是飞书环境
  isPCChrome: boolean,    // 是否是PC端Chrome浏览器（核心）
}
```

## 使用场景

### 1. 条件渲染
```vue
<template>
  <div>
    <!-- 只在PC端Chrome显示某些功能 -->
    <AdvancedFeature v-if="isPCChrome" />
    
    <!-- 移动设备显示不同的UI -->
    <MobileLayout v-if="isMobile" />
    <DesktopLayout v-else />
  </div>
</template>
```

### 2. 功能兼容性检查
```vue
<script setup>
import { useBrowserDetector } from '@/hooks/useBrowserDetector'

const { browserInfo, isPCChrome } = useBrowserDetector()

// 根据浏览器环境启用不同功能
const enableWebRTC = computed(() => {
  return isPCChrome.value || browserInfo.value.isFirefox
})

const enableFileAPI = computed(() => {
  return !browserInfo.value.isMobile && 
         (browserInfo.value.isChrome || browserInfo.value.isEdge)
})
</script>
```

### 3. 企业应用适配
```vue
<script setup>
import { useBrowserDetector } from '@/hooks/useBrowserDetector'

const { browserInfo } = useBrowserDetector()

// 根据企业应用环境调整样式
const containerClass = computed(() => {
  if (browserInfo.value.isWXWork) return 'wxwork-style'
  if (browserInfo.value.isDingTalk) return 'dingtalk-style'
  if (browserInfo.value.isFeiShu) return 'feishu-style'
  return 'default-style'
})
</script>
```

## 注意事项

1. **SSR 兼容性**：在服务端渲染环境中，`window` 对象不存在，hook 会优雅地处理这种情况
2. **性能优化**：检测结果会被缓存，避免重复计算
3. **企业应用检测**：准确识别企业微信、钉钉、飞书等内嵌浏览器环境
4. **Chrome 检测**：会排除 Edge 浏览器的 Chrome 标识，确保准确性

## 测试建议

在不同环境下测试 hook 的准确性：

- PC端Chrome浏览器
- PC端其他浏览器（Firefox、Safari、Edge）
- 移动端浏览器
- 企业应用内嵌浏览器（企业微信、钉钉、飞书）

可以使用提供的示例组件 `example-usage.vue` 进行测试。 