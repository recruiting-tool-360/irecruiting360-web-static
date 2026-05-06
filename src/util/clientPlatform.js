/**
 * 客户端平台检测 + 下载链接拼装
 *
 * 下载站约定（运维需在现有插件下载站点同域下新建 /client 路径托管）：
 *   - 静态 manifest:  ${VITE_CLIENT_DOWNLOAD_BASE}/manifest.json
 *   - 安装包格式:     ${VITE_CLIENT_DOWNLOAD_BASE}/ikuaizhao-{version}-{platform-arch}.{ext}
 *
 * 环境变量：
 *   - VITE_CLIENT_DOWNLOAD_BASE  默认 'https://download.ihire365.com/client'
 *   - VITE_CLIENT_LAUNCH_ENABLED 默认 'true'，灰度开关
 */

const DEFAULT_DOWNLOAD_BASE = 'https://download.ihire365.com/client';

export const CLIENT_DOWNLOAD_BASE =
  (import.meta.env && import.meta.env.VITE_CLIENT_DOWNLOAD_BASE) || DEFAULT_DOWNLOAD_BASE;

export const CLIENT_LAUNCH_ENABLED =
  String((import.meta.env && import.meta.env.VITE_CLIENT_LAUNCH_ENABLED) ?? 'true') !== 'false';

/**
 * 检测当前 OS
 * @returns {'mac'|'windows'|'linux'|'other'}
 */
export function detectOS() {
  if (typeof navigator === 'undefined') return 'other';
  const ua = (navigator.userAgent || '').toLowerCase();
  const platform = (navigator.platform || '').toLowerCase();
  if (platform.includes('mac') || ua.includes('mac os')) return 'mac';
  if (platform.includes('win') || ua.includes('windows')) return 'windows';
  if (platform.includes('linux') || ua.includes('linux')) return 'linux';
  return 'other';
}

/**
 * 检测处理器架构（仅在支持 userAgentData 的浏览器上有意义）
 * @returns {'arm64'|'x64'|'unknown'}
 */
export function detectArch() {
  if (typeof navigator === 'undefined') return 'unknown';
  const uaData = navigator.userAgentData;
  if (uaData && Array.isArray(uaData.brands)) {
    if (uaData.architecture === 'arm') return 'arm64';
    if (uaData.architecture === 'x86') return 'x64';
  }
  // 简单从 UA 推断
  const ua = (navigator.userAgent || '').toLowerCase();
  if (ua.includes('arm64') || ua.includes('aarch64')) return 'arm64';
  if (ua.includes('x86_64') || ua.includes('win64') || ua.includes('wow64')) return 'x64';
  return 'unknown';
}

/**
 * 是否可能是钉钉 / 飞书 / 企微等内置 webview（这些环境拦截自定义协议）
 * @returns {boolean}
 */
export function isInsideEmbeddedWebview() {
  if (typeof navigator === 'undefined') return false;
  const ua = (navigator.userAgent || '').toLowerCase();
  return /dingtalk|lark|feishu|wxwork|micromessenger/.test(ua);
}

/**
 * 友好的 OS 名称（用于按钮文案）
 */
export function osLabel(os = detectOS()) {
  return (
    {
      mac: 'macOS',
      windows: 'Windows',
      linux: 'Linux',
      other: '其它'
    }[os] || '其它'
  );
}

/**
 * 安装包文件名约定
 */
export function pickInstallerFileName(version, os = detectOS(), arch = detectArch()) {
  if (os === 'mac') {
    const a = arch === 'arm64' ? 'arm64' : 'x64';
    return `ikuaizhao-${version}-mac-${a}.dmg`;
  }
  if (os === 'windows') return `ikuaizhao-${version}-win-x64.exe`;
  if (os === 'linux') return `ikuaizhao-${version}-linux-x64.AppImage`;
  return null;
}

/**
 * 拉静态 manifest.json 拿最新版本元信息
 * @returns {Promise<{ latest: string, minVersion?: string, downloads?: Record<string,string> } | null>}
 */
export async function fetchClientManifest() {
  try {
    const resp = await fetch(`${CLIENT_DOWNLOAD_BASE}/manifest.json`, {
      cache: 'no-cache'
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch (e) {
    console.warn('[clientPlatform] fetch manifest failed:', e);
    return null;
  }
}

/**
 * 推断当前 OS 应该下载的安装包 URL
 *   优先用 manifest 里的 downloads[platformKey]
 *   manifest 不可用则按文件名约定拼
 * @param {object} manifest
 * @returns {{ url: string, fileName: string, os: string } | null}
 */
export function pickDownloadUrl(manifest) {
  const os = detectOS();
  const arch = detectArch();
  const platformKey =
    os === 'mac' ? (arch === 'arm64' ? 'mac-arm64' : 'mac-x64') :
    os === 'windows' ? 'win-x64' :
    os === 'linux' ? 'linux-x64' :
    null;
  if (!platformKey) return null;

  if (manifest?.downloads?.[platformKey]) {
    const file = manifest.downloads[platformKey];
    return {
      url: file.startsWith('http') ? file : `${CLIENT_DOWNLOAD_BASE}/${file}`,
      fileName: file.split('/').pop(),
      os
    };
  }

  if (manifest?.latest) {
    const fileName = pickInstallerFileName(manifest.latest, os, arch);
    if (fileName) {
      return {
        url: `${CLIENT_DOWNLOAD_BASE}/${fileName}`,
        fileName,
        os
      };
    }
  }

  return null;
}
