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
    name: 'login',
    component: () => import('@/views/login/Login.vue')
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

export default router
