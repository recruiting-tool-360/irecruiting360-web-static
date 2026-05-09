/* eslint-disable no-console */
/**
 * release 打包前置 env 校验
 *
 * 跑 npm run build:mac:release / build:win:release 前调用，
 * 缺少必要 env 直接 fail-fast，避免跑了 5-15 分钟才发现签名 / 公证失败
 *
 * 用法：
 *   node ./scripts/check-release-env.js mac
 *   node ./scripts/check-release-env.js win
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const path = require('node:path')
const fs = require('node:fs')

const TARGET = (process.argv[2] || '').toLowerCase()

const SCHEMAS = {
  mac: {
    label: 'macOS Developer ID + 公证',
    required: [
      ['CSC_LINK', '指向 .p12 文件路径，例: /Users/xxx/secure/DeveloperID.p12'],
      ['CSC_KEY_PASSWORD', '.p12 导出时设的密码'],
      ['APPLE_ID', '公证用的 Apple ID（建议公司账号）'],
      [
        'APPLE_APP_SPECIFIC_PASSWORD',
        'App-specific password，在 appleid.apple.com 生成（16 位 xxxx-xxxx-xxxx-xxxx）'
      ],
      ['APPLE_TEAM_ID', 'Apple Developer 后台 Membership 页面的 Team ID（10 位）']
    ],
    docPath: 'docs/macos-release.md'
  },
  win: {
    label: 'Windows OV/EV 代码签名',
    required: [
      ['WIN_CSC_LINK', '指向 .pfx 文件路径'],
      ['WIN_CSC_KEY_PASSWORD', '.pfx 导出时设的密码']
    ],
    docPath: 'docs/build-and-package.md'
  }
}

const schema = SCHEMAS[TARGET]
if (!schema) {
  console.error(
    `[check-release-env] usage: node check-release-env.js <mac|win>; got "${TARGET}"`
  )
  process.exit(2)
}

const missing = []
const present = []
for (const [key, hint] of schema.required) {
  if (!process.env[key]) {
    missing.push([key, hint])
  } else {
    present.push(key)
  }
}

if (missing.length > 0) {
  console.error('')
  console.error(`❌ ${schema.label} 发版需要的 env 缺失：\n`)
  for (const [key, hint] of missing) {
    console.error(`   ${key}`)
    console.error(`     ↳ ${hint}\n`)
  }
  console.error(
    `请按 ${schema.docPath} 准备好后再跑：\n` +
      `  source ~/.ikuaizhao.env  # 或者直接 export ...\n` +
      `  npm run build:${TARGET}:release\n`
  )
  process.exit(1)
}

// 额外检查：mac 的 .p12 文件存在且可读
if (TARGET === 'mac') {
  const cscLink = process.env.CSC_LINK
  if (cscLink && !cscLink.startsWith('http')) {
    const resolved = path.resolve(cscLink)
    if (!fs.existsSync(resolved)) {
      console.error(`❌ CSC_LINK 指向的文件不存在: ${resolved}`)
      process.exit(1)
    }
  }
}

console.log(`✅ ${schema.label} 所有 env 已配置: ${present.join(', ')}`)
console.log('   开始打包...\n')
