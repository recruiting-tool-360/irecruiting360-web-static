import PluginMessenger from "src/pluginSrc/util/PluginSendMsg"
import {getPluginDynamicRulesConfigFn} from "src/pluginSrc/config/PluginRequestManager";
import {isElectronClient} from "src/util/openChannelLoginUrl";

/**
 * 业务统一入口：
 *   - 浏览器模式：保持原状走 PluginMessenger postMessage 协议（依赖浏览器插件）
 *   - 客户端模式：路由到 ElectronAdapter，由 Electron 主进程的 recruitBridge 模拟插件能力
 *
 * 业务模块（pluginSrc/channels/*）调用方式不变，对运行环境无感知。
 */
export const i360Request = async (action, emptyRequestTemplate, timeout = 5000) => {
    if (isElectronClient()) {
        return await electronAdapter(emptyRequestTemplate, timeout);
    }
    try {
        return await PluginMessenger.sendMessage(action, emptyRequestTemplate, timeout);
    } catch (error) {
        console.error('Error:', error.message);
    }
}


export const setPluginRules = async (ruleConfig)=>{
    return await i360Request(ruleConfig.action, ruleConfig);
}

export const setDefaultPluginRules = async ()=>{
    const ruleConfig =getPluginDynamicRulesConfigFn()
    return await setPluginRules(ruleConfig);
}

// =============== ElectronAdapter（客户端模式下的 i360Request 实现） ===============

/**
 * 把插件协议的请求模板转换成 Electron recruitBridge 调用，并把响应包装成插件协议格式
 * 让上层调用方（pluginResultProcessor、pluginBossResultProcessor 等）零感知
 */
async function electronAdapter(req, _timeout) {
    const recruitBridge = window?.api?.recruitBridge;
    if (!recruitBridge) {
        console.warn('[i360Request] electron mode but recruitBridge not ready');
        return wrapError('recruitBridge not ready');
    }

    const group = req?.group;
    const action = req?.action;

    try {
        switch (group) {
            case 'GET_PLUGIN_VERSION': {
                const v = window?.__IKUAIZHAO_NATIVE__?.version || '0.0.0';
                return wrapSuccess(v);
            }

            case 'BASE_CONFIG': {
                if (action === 'getBaseConfig') {
                    // parameters 是 storageKey 字符串
                    const storageKey = req.parameters;
                    if (typeof storageKey === 'string' && storageKey.includes('Cookie')) {
                        const data = await recruitBridge.getCapturedCookies(storageKey);
                        return wrapSuccess(data);
                    }
                    const data = await recruitBridge.getCapturedHeaders(storageKey);
                    return wrapSuccess(data);
                }
                // setBaseConfig / setCookieConfig：客户端启动时已通过 webRequest 装配，no-op
                return wrapSuccess(true);
            }

            case 'UPDATE_ROLES_CONFIG': {
                // Origin 改写已通过 webRequest.onBeforeSendHeaders 在主进程启动时配置，no-op
                return wrapSuccess(true);
            }

            case 'UNIVERSAL_REQUEST':
            case 'UNIVERSAL_REQUEST_BACKGROUND_MAIN': {
                const result = await recruitBridge.universalRequest({
                    url: req.requestPath,
                    method: req.requestType || 'POST',
                    headers: req.requestHeader || {},
                    body: req.parameters,
                    credentials: req.requestCredentials || 'include',
                    tabUrl: group === 'UNIVERSAL_REQUEST_BACKGROUND_MAIN' ? req.tabUrl : undefined,
                });
                if (result?.success) {
                    return wrapSuccess(result.data);
                }
                return wrapError(result?.message || 'request failed');
            }

            case 'ENABLE_IMAGE_CAPTURE': {
                // 客户端模式截图能力暂未迁移，让上层认为失败优雅降级
                return wrapError('image capture not implemented in client mode');
            }

            default:
                console.warn('[electronAdapter] unknown group', group, action);
                return wrapError(`unknown group: ${group}`);
        }
    } catch (error) {
        const message = error?.message || String(error);
        console.error('[electronAdapter] error', message);
        return wrapError(message);
    }
}

/**
 * 把 data 包装成插件协议成功响应（pluginResultProcessor 能识别）
 */
function wrapSuccess(data) {
    return {
        success: true,
        responseData: {
            success: true,
            data,
        },
    };
}

function wrapError(message) {
    return {
        success: false,
        responseData: {
            success: false,
            data: null,
        },
        message,
    };
}
