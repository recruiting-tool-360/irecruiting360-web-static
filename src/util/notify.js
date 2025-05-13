import { Notify } from 'quasar'

/**
 * 成功通知
 * @param {string} message - 通知消息
 * @param {Object} options - 额外选项
 */
export function notifySuccess(message, options = {}) {
  Notify.create({
    color: 'positive',
    message,
    position: 'top',
    icon: 'check_circle',
    timeout: 3000,
    ...options
  })
}

/**
 * 错误通知
 * @param {string} message - 通知消息
 * @param {Object} options - 额外选项
 */
export function notifyError(message, options = {}) {
  Notify.create({
    color: 'negative',
    message,
    position: 'top',
    icon: 'error',
    timeout: 3000,
    ...options
  })
}

/**
 * 警告通知
 * @param {string} message - 通知消息
 * @param {Object} options - 额外选项
 */
export function notifyWarning(message, options = {}) {
  Notify.create({
    color: 'orange-6',
    message,
    position: 'top',
    icon: 'announcement',
    timeout: 3000,
    ...options
  })
}

export function notifyWarning2(message, options = {}) {
  Notify.create({
    message,
    position: 'top',
    icon: 'announcement',
    timeout: 3000,
    ...options
  })
}

/**
 * 信息通知
 * @param {string} message - 通知消息
 * @param {Object} options - 额外选项
 */
export function notifyInfo(message, options = {}) {
  console.log(message)
  Notify.create({
    message,
    position: 'top',
    icon: 'info',
    timeout: 3000,
    ...options
  })
}

/**
 * 自定义通知
 * @param {Object} options - 通知选项
 */
export function notifyCustom(options) {
  Notify.create(options)
}

export default {
  success: notifySuccess,
  error: notifyError,
  warning: notifyWarning,
  info: notifyInfo,
  custom: notifyCustom
}
