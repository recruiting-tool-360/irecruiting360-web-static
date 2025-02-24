import PluginMessenger from "@/api/PluginSendMsg";
import {getPluginDynamicRulesConfigFn} from "@/components/PluginRequestManager";


export const i360Request= async (action, emptyRequestTemplate, timeout = 5000) => {
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