import { createRouter, createWebHistory } from 'vue-router';
import { getToken, getUser } from '@/api/http';

const routes = [
  { path: '/', name: 'home', component: () => import('@/views/Home.vue'), meta: { title: '首页' } },
  { path: '/resources', name: 'resources', component: () => import('@/views/Resources.vue'), meta: { title: '资源收录' } },
  { path: '/questions', name: 'questions', component: () => import('@/views/Questions.vue'), meta: { title: '题库检索' } },
  { path: '/chat', name: 'chat', component: () => import('@/views/Chat.vue'), meta: { title: '团队协作' } },
  {
    path: '/admin',
    name: 'admin',
    component: () => import('@/views/Admin.vue'),
    meta: { title: '管理后台', requiresAdmin: true }
  },
  { path: '/:pathMatch(.*)*', redirect: '/' }
];

const router = createRouter({
  history: createWebHistory('/platform/'),
  routes,
  scrollBehavior: () => ({ top: 0 })
});

router.beforeEach((to, from, next) => {
  document.title = (to.meta.title ? to.meta.title + ' - ' : '') + '信息素养大赛综合平台';

  if (to.meta.requiresAdmin) {
    const token = getToken();
    const user = getUser();
    if (!token || !user || user.role !== 'admin') {
      return next({ path: '/', query: { needAdmin: '1' } });
    }
  }
  return next();
});

export default router;
