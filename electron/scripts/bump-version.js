#!/usr/bin/env node
/**
 * bump-version.js
 *
 * 把 electron/package.json 的 version 按 semver 升一档（默认 patch），写回磁盘。
 *
 * 用法：
 *   node ./scripts/bump-version.js              # 默认 patch  1.0.0 → 1.0.1
 *   node ./scripts/bump-version.js --minor      #              1.0.0 → 1.1.0
 *   node ./scripts/bump-version.js --major      #              1.0.0 → 2.0.0
 *   node ./scripts/bump-version.js --set 1.2.3  # 直接设成指定版本
 *   node ./scripts/bump-version.js --dry-run    # 只打印不写
 *
 * 适用场景：
 *   - npm run build:mac:qa2 / build:win:qa2 前自动 +1，让每次打包出的 dmg/exe 文件名不同，
 *     CDN 上不会跟旧版混淆，autoUpdater 也能识别为新版本触发更新。
 *   - 如果 build 失败需要 retry，版本号会多 +1 一次，没坏处（最终发出去的还是最新那个）。
 *
 * ⚠️ 谨慎用在 release：release 的版本号通常由人工/CI 控制 git tag 走 semantic versioning，
 *   不要每次 build 都自动 bump。这个脚本只用于 qa2 这类频繁迭代的内部测试包。
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { parseArgs } = require('node:util')

const { values: argv } = parseArgs({
  options: {
    major: { type: 'boolean', default: false },
    minor: { type: 'boolean', default: false },
    patch: { type: 'boolean', default: false },
    set: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false }
  }
})

if (argv.help) {
  console.log(`
用法：node ./scripts/bump-version.js [options]

  --patch         小版本 +1（默认）  1.0.0 → 1.0.1
  --minor         中版本 +1           1.0.0 → 1.1.0
  --major         大版本 +1           1.0.0 → 2.0.0
  --set <ver>     直接设成指定版本
  --dry-run       只打印新版本，不写入 package.json
  -h, --help      显示帮助
`)
  process.exit(0)
}

const pkgPath = path.resolve(__dirname, '..', 'package.json')
if (!fs.existsSync(pkgPath)) {
  console.error('[bump-version] 找不到 electron/package.json:', pkgPath)
  process.exit(1)
}

const raw = fs.readFileSync(pkgPath, 'utf8')
const pkg = JSON.parse(raw)
const currentVersion = String(pkg.version || '0.0.0')

function parseSemver(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(v)
  if (!m) throw new Error(`无法解析 semver: ${v}`)
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) }
}

let nextVersion
if (argv.set) {
  // 校验格式合法
  parseSemver(argv.set)
  nextVersion = argv.set
} else {
  const cur = parseSemver(currentVersion)
  if (argv.major) {
    nextVersion = `${cur.major + 1}.0.0`
  } else if (argv.minor) {
    nextVersion = `${cur.major}.${cur.minor + 1}.0`
  } else {
    // 默认 patch
    nextVersion = `${cur.major}.${cur.minor}.${cur.patch + 1}`
  }
}

console.log(`[bump-version] ${currentVersion} → ${nextVersion}${argv['dry-run'] ? ' (dry-run)' : ''}`)

if (argv['dry-run']) {
  process.exit(0)
}

pkg.version = nextVersion
// 保留原文件的缩进风格（默认 2 空格 + 末尾换行）
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
console.log(`[bump-version] electron/package.json version 已更新为 ${nextVersion}`)
