import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'home',
    // component: () => import('@/views/home/Home.vue')
    component: () => import('@/views/search/AISearch.vue')
  },
  {
    path: '/search',
    name: 'search',
    component: () => import('@/views/search/AISearch.vue')
  },
  {
    path: '/setting',
    name: 'setting',
    component: () => import('@/views/setting/Setting.vue')
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
