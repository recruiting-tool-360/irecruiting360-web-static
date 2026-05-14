#!/usr/bin/env node
/**
 * 把 electron-builder 打包产物上传到腾讯云 COS（对象存储）
 *
 * 用法：
 *   node ./scripts/publish-cos.js --secret-id <SecretId> --secret-key <SecretKey>
 *
 * 常用参数：
 *   --secret-id <id>       腾讯云 SecretId（也可缩写 --ak，env: TENCENT_SECRET_ID）  【必填】
 *   --secret-key <key>     腾讯云 SecretKey（也可缩写 --sk，env: TENCENT_SECRET_KEY）【必填】
 *   --bucket <name>        桶名（默认 ihr360-download-1311733818，腾讯云带 APPID 后缀）
 *   --region <id>          地域（默认 ap-shanghai）
 *                          常用：ap-shanghai / ap-beijing / ap-guangzhou /
 *                                ap-chengdu / ap-hongkong
 *   --prefix <path>        桶内路径前缀（默认 ikuaizhao/）
 *   --domain <url>         CDN 域名，仅用于打印结果链接
 *                          （默认 http://download.ihr360.com）
 *   --dist <dir>           本地产物目录（默认 ./dist）
 *   --platform <a,b,...>   只发指定平台，多个用逗号分隔
 *                          可选 win / mac / linux / yml / all（默认 all）
 *   --include <glob>       追加白名单 glob（默认匹配 exe/dmg/zip/yml/blockmap/AppImage/deb/snap）
 *   --dry-run              只列出要上传的文件，不真传
 *   --skip-existing        相同 etag 跳过（默认 true，传 false 强制覆盖）
 *   --concurrency <n>      并发数（默认 3）
 *   --check                只查桶里 prefix 下的文件清单，不上传（用于诊断 404）
 *   --help                 显示帮助
 *
 * 示例：
 *   # 全平台发布
 *   node ./scripts/publish-cos.js --secret-id AKID... --secret-key xxx
 *
 *   # 用环境变量（更安全，不会进 shell history）
 *   TENCENT_SECRET_ID=... TENCENT_SECRET_KEY=... node ./scripts/publish-cos.js
 *
 *   # 只发 win
 *   node ./scripts/publish-cos.js --secret-id ... --secret-key ... --platform win
 *
 *   # 诊断：列桶里所有文件
 *   node ./scripts/publish-cos.js --secret-id ... --secret-key ... --check
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { parseArgs } = require('node:util')
const COS = require('cos-nodejs-sdk-v5')

// =================== 参数解析 ===================

const { values: argv } = parseArgs({
  options: {
    'secret-id': { type: 'string' },
    'secret-key': { type: 'string' },
    ak: { type: 'string' }, // 兼容别名
    sk: { type: 'string' }, // 兼容别名
    bucket: { type: 'string', default: 'ihr360-download-1311733818' },
    region: { type: 'string', default: 'ap-shanghai' },
    prefix: { type: 'string', default: 'ikuaizhao/' },
    domain: { type: 'string', default: 'http://download.ihr360.com' },
    dist: { type: 'string', default: 'dist' },
    platform: { type: 'string', default: 'all' },
    include: { type: 'string', multiple: true, default: [] },
    'dry-run': { type: 'boolean', default: false },
    'skip-existing': { type: 'string', default: 'true' },
    concurrency: { type: 'string', default: '3' },
    check: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false }
  }
})

if (argv.help) {
  printHelp()
  process.exit(0)
}

const SECRET_ID =
  argv['secret-id'] || argv.ak || process.env.TENCENT_SECRET_ID || process.env.COS_SECRET_ID || ''
const SECRET_KEY =
  argv['secret-key'] || argv.sk || process.env.TENCENT_SECRET_KEY || process.env.COS_SECRET_KEY || ''

if (!argv['dry-run'] && (!SECRET_ID || !SECRET_KEY)) {
  console.error(
    '[publish-cos] 缺少必填参数：\n' +
      '  通过命令行：--secret-id <id> --secret-key <key>（或别名 --ak / --sk）\n' +
      '  通过环境变量：TENCENT_SECRET_ID / TENCENT_SECRET_KEY\n'
  )
  printHelp()
  process.exit(1)
}

function printHelp() {
  const help = fs.readFileSync(__filename, 'utf8').split('\n')
  const start = help.findIndex((l) => l.includes('用法：'))
  const end = help.findIndex((l, i) => i > start && l.startsWith(' */'))
  console.log(
    help
      .slice(start, end)
      .map((l) => l.replace(/^ \* ?/, ''))
      .join('\n')
  )
}

// =================== 文件挑选 ===================

const PLATFORM_PATTERNS = {
  win: [/\.exe$/i, /\.exe\.blockmap$/i, /^latest\.yml$/i],
  mac: [/\.dmg$/i, /\.dmg\.blockmap$/i, /\.zip$/i, /^latest-mac\.yml$/i],
  linux: [/\.AppImage$/i, /\.deb$/i, /\.snap$/i, /^latest-linux\.yml$/i],
  yml: [/^latest.*\.yml$/i]
}

const HARD_EXCLUDES = [
  /^win-unpacked\//,
  /^win-arm64-unpacked\//,
  /^mac\//,
  /^mac-arm64\//,
  /^linux-unpacked\//,
  /^builder-debug\.yml$/,
  /^builder-effective-config\.yaml$/,
  /^__/,
  /\.DS_Store$/
]

function resolvePlatforms() {
  const list = argv.platform.split(',').map((s) => s.trim().toLowerCase())
  if (list.includes('all')) return ['win', 'mac', 'linux', 'yml']
  for (const p of list) {
    if (!PLATFORM_PATTERNS[p]) {
      console.error(`[publish-cos] 不认识的 platform: ${p}（合法值: win/mac/linux/yml/all）`)
      process.exit(1)
    }
  }
  return list
}

function collectFiles(distDir, platforms) {
  if (!fs.existsSync(distDir)) {
    console.error(`[publish-cos] 找不到产物目录: ${distDir}`)
    console.error(`  请先跑 npm run build:win:release / build:mac:release`)
    process.exit(1)
  }
  const entries = fs.readdirSync(distDir, { withFileTypes: true })
  const patterns = platforms.flatMap((p) => PLATFORM_PATTERNS[p])
  const extraIncludes = argv.include
    .filter((s) => s)
    .map((s) => new RegExp(globToRegex(s), 'i'))
  const all = patterns.concat(extraIncludes)

  const picked = []
  for (const e of entries) {
    if (!e.isFile()) continue
    if (HARD_EXCLUDES.some((re) => re.test(e.name))) continue
    if (!all.some((re) => re.test(e.name))) continue
    const full = path.join(distDir, e.name)
    const stat = fs.statSync(full)
    picked.push({
      localPath: full,
      key: argv.prefix.replace(/^\/|\/$/g, '') + '/' + e.name,
      name: e.name,
      size: stat.size
    })
  }
  return picked
}

function globToRegex(glob) {
  return (
    '^' +
    glob
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.') +
    '$'
  )
}

// =================== COS 客户端 ===================

const cos = new COS({
  SecretId: SECRET_ID,
  SecretKey: SECRET_KEY,
  // 大文件分片上传配置
  ChunkSize: 8 * 1024 * 1024, // 8MB 一个分片
  ChunkParallelLimit: 3,      // 单文件内 3 个分片并发
  ProgressInterval: 1000,     // 进度回调间隔 1s
  Timeout: 0                  // 不超时（大文件上传可能很久）
})

/** 查询远端文件是否存在以及它的 etag（含双引号的 md5） */
function headObject(key) {
  return new Promise((resolve) => {
    cos.headObject(
      { Bucket: argv.bucket, Region: argv.region, Key: key },
      (err, data) => {
        if (err) {
          if (err.statusCode === 404) return resolve({ exists: false })
          return resolve({ exists: false, error: err.message })
        }
        // ETag 含双引号 "..."，统一去掉
        const etag = (data.ETag || '').replace(/^"|"$/g, '')
        const size = parseInt(data.headers['content-length'] || '0', 10)
        resolve({ exists: true, etag, size })
      }
    )
  })
}

/** 列出桶里 prefix 下所有文件 */
function listObjects(prefix) {
  return new Promise((resolve, reject) => {
    const items = []
    function fetch(marker) {
      cos.getBucket(
        {
          Bucket: argv.bucket,
          Region: argv.region,
          Prefix: prefix,
          MaxKeys: 1000,
          Marker: marker
        },
        (err, data) => {
          if (err) return reject(err)
          items.push(...(data.Contents || []))
          if (data.IsTruncated === 'true' && data.NextMarker) {
            fetch(data.NextMarker)
          } else {
            resolve(items)
          }
        }
      )
    }
    fetch()
  })
}

/** 高级上传：自动分片 + 断点续传 */
function uploadFile(file) {
  return new Promise((resolve, reject) => {
    let lastPercent = -1
    cos.uploadFile(
      {
        Bucket: argv.bucket,
        Region: argv.region,
        Key: file.key,
        FilePath: file.localPath,
        SliceSize: 32 * 1024 * 1024, // > 32MB 自动走分片
        onProgress: (info) => {
          const pct = Math.floor(info.percent * 100)
          // 减少刷屏：每变 5% 才打一次
          if (pct >= lastPercent + 5 || pct === 100) {
            lastPercent = pct
            process.stdout.write(
              `[${file.name}] 上传中 ${pct}% (${fmtSize(info.loaded)}/${fmtSize(info.total)})\r`
            )
          }
        }
      },
      (err, data) => {
        process.stdout.write('\n')
        if (err) return reject(err)
        resolve(data)
      }
    )
  })
}

/** 计算本地文件的 md5（用于和远端 ETag 比对） */
function calcMd5(filePath) {
  const crypto = require('node:crypto')
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5')
    const stream = fs.createReadStream(filePath, { highWaterMark: 4 * 1024 * 1024 })
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

// =================== 主流程 ===================

function fmtSize(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

async function pMapLimit(items, limit, mapper) {
  const results = new Array(items.length)
  let idx = 0
  async function worker() {
    while (idx < items.length) {
      const i = idx++
      results[i] = await mapper(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

async function doCheck() {
  console.log('==================== publish-cos --check ====================')
  console.log(`bucket : ${argv.bucket}`)
  console.log(`region : ${argv.region}`)
  console.log(`prefix : ${argv.prefix}`)
  console.log(`domain : ${argv.domain}`)
  console.log('=============================================================')
  const prefix = argv.prefix.replace(/^\//, '')
  const items = await listObjects(prefix)
  console.log(`腾讯云 COS 桶里 prefix=${prefix} 下共 ${items.length} 个文件：\n`)
  for (const it of items) {
    const sizeMb = (parseInt(it.Size, 10) / 1024 / 1024).toFixed(2)
    const etag = (it.ETag || '').replace(/^"|"$/g, '')
    console.log(`  ${it.Key}  (${sizeMb} MB)  etag=${etag}`)
  }
  if (items.length > 0) {
    console.log('\n💡 用浏览器/curl 验证访问：')
    const base = argv.domain.replace(/\/$/, '')
    console.log(`   ${base}/${items[0].Key}`)
    console.log('如果上面 key 显示存在但访问 404，说明 CDN 域名没绑对桶或回源路径错。')
  }

  const distDir = path.resolve(argv.dist)
  if (fs.existsSync(distDir)) {
    const platforms = resolvePlatforms()
    const local = collectFiles(distDir, platforms)
    console.log('\n本地待发布文件 vs 远端：')
    const remoteKeys = new Set(items.map((i) => i.Key))
    for (const f of local) {
      const onRemote = remoteKeys.has(f.key)
      console.log(`  ${onRemote ? '✓' : '✗'} ${f.key}  (本地 ${fmtSize(f.size)})`)
    }
  }
}

async function main() {
  if (argv.check) {
    return doCheck()
  }
  const distDir = path.resolve(argv.dist)
  const platforms = resolvePlatforms()
  const files = collectFiles(distDir, platforms)

  console.log('==================== publish-cos ====================')
  console.log(`bucket    : ${argv.bucket}`)
  console.log(`region    : ${argv.region}`)
  console.log(`prefix    : ${argv.prefix}`)
  console.log(`domain    : ${argv.domain}`)
  console.log(`dist      : ${distDir}`)
  console.log(`platforms : ${platforms.join(', ')}`)
  console.log(`dry-run   : ${argv['dry-run']}`)
  console.log(`匹配到 ${files.length} 个文件：`)
  for (const f of files) console.log(`  - ${f.name}  (${fmtSize(f.size)})`)
  console.log('=====================================================')
  if (files.length === 0) {
    console.warn('[publish-cos] 没有匹配到任何文件，退出')
    process.exit(0)
  }
  if (argv['dry-run']) {
    console.log('[publish-cos] dry-run 模式，不真实上传，退出')
    return
  }

  const skipExisting = argv['skip-existing'] !== 'false'
  const concurrency = Math.max(1, parseInt(argv.concurrency, 10) || 3)

  let okCount = 0
  let skipCount = 0
  let failCount = 0
  const failures = []
  const t0 = Date.now()

  await pMapLimit(files, concurrency, async (file) => {
    const tag = `[${file.name}]`
    try {
      if (skipExisting) {
        const remote = await headObject(file.key)
        if (remote.exists && remote.size === file.size) {
          // 大文件分片上传的 ETag 不是单文件 md5（是 md5-of-md5）
          // 这里先用 size 粗略比对，size 一致大概率没变；要 100% 准确得算 md5 再比
          // 对于 < 32MB 不分片的小文件（latest.yml / blockmap），可以再走精确 md5 比对
          if (file.size < 32 * 1024 * 1024) {
            const localMd5 = await calcMd5(file.localPath)
            if (remote.etag === localMd5) {
              console.log(`${tag} 已存在且 md5 一致，跳过`)
              skipCount++
              return
            }
          } else {
            console.log(`${tag} 已存在且 size 一致 (${fmtSize(remote.size)})，跳过`)
            skipCount++
            return
          }
        }
      }
      const t = Date.now()
      await uploadFile(file)
      console.log(`${tag} ✓ 上传完成 (${((Date.now() - t) / 1000).toFixed(1)}s)`)
      okCount++
    } catch (err) {
      console.error(`${tag} ✗ 上传失败: ${err.message}`)
      failures.push({ file: file.name, error: err.message })
      failCount++
    }
  })

  console.log('=====================================================')
  console.log(
    `完成: ${okCount} 上传 / ${skipCount} 跳过 / ${failCount} 失败 (${((Date.now() - t0) / 1000).toFixed(1)}s)`
  )

  if (okCount + skipCount > 0) {
    console.log('\n下载链接：')
    const base = argv.domain.replace(/\/$/, '')
    for (const f of files) {
      console.log(`  ${base}/${f.key}`)
    }
  }
  if (failures.length > 0) {
    console.error('\n失败列表：')
    for (const f of failures) console.error(`  - ${f.file}: ${f.error}`)
    process.exit(2)
  }
}

main().catch((err) => {
  console.error('[publish-cos] 致命错误:', err)
  process.exit(1)
})
