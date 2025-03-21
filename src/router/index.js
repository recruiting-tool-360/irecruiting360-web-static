import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'home',
    // component: () => import('@/views/home/Home.vue')
    component: () => import('@/layout/MainLayout.vue')
  },
  {
    path: '/guide',
    name: 'guide',
    component: () => import('@/views/guide/Fingerpost.vue')
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/Login.vue'),
    meta: { 
      requiresAuth: false,
      title: '登录'
    }
  },
  {
    path: '/login/sso',
    name: 'LoginSSO',
    component: () => import('@/views/login/LoginSSO.vue'),
    meta: {
      requiresAuth: false,
      title: '单点登录'
    }
  },
  {
    path: '/web/wechatCallback',
    name: 'WechatCallback',
    component: () => import('@/views/login/LoginWechat.vue'),
    meta: {
      requiresAuth: false,
      title: '微信登录处理'
    }
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('@/views/login/Register.vue'),
    meta: { 
      requiresAuth: false,
      title: '注册'
    }
  },
  {
    path: '/user-agreement',
    name: 'UserAgreement',
    component: () => import('@/views/login/userAgreement.vue'),
    meta: {
      title: 'i快招用户服务及隐私保护协议',
      noAuth: true // 不需要登录验证
    }
  },
  {
    path:'/:catchAll(.*)',
    component:()=>import('@/views/error-page/404')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// Add a navigation guard to redirect unauthenticated users to login
router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('token')
  
  if (to.meta.requiresAuth && !token) {
    next('/login')
  } else if ((to.path === '/login' || to.path === '/register') && token) {
    next('/')
  } else {
    next()
  }
})

export default router
