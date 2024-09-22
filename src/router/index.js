import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/home')
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
