const routes = [
  {
    path: '/',
    component: () => import('layouts/MainLayout.vue'),
    children: [
      { path: '', component: () => import('pages/IndexPage.vue') }
    ]
  },

  {
    path: '/login',
    component: () => import('layouts/LoginLayout.vue'),
    children: [
      { path: '', component: () => import('pages/login/Login.vue') }
    ]
  },

  {
    path: '/sso-login',
    component: () => import('pages/login/SSOLogin.vue')
  },
  {
    path: '/sso-login2',
    component: () => import('pages/login/SSOLogin2.vue')
  },

  {
    path: '/register',
    component: () => import('layouts/LoginLayout.vue'),
    children: [
      { path: '', component: () => import('pages/login/Register.vue') }
    ]
  },

  {
    path: '/user-agreement',
    component: () => import('pages/login/userAgreement.vue')
  },

  {
    path: '/web/wechatCallback',
    name: 'WechatCallback',
    component: () => import('pages/login/LoginWechat.vue'),
    meta: {
      requiresAuth: false,
      title: '微信登录处理'
    }
  },

  // Always leave this as last one,
  // but you can also remove it
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue')
  }
]

export default routes
