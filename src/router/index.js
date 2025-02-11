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
