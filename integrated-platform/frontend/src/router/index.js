import { createRouter, createWebHistory } from 'vue-router';
import { getToken, getUser } from '@/api/http';

const routes = [
  { path: '/', name: 'home', component: () => import('@/views/Home.vue'), meta: { title: '首页' } },
  {
    path: '/resources',
    name: 'resources',
    component: () => import('@/views/Resources.vue'),
    meta: { title: '资源收录', requiresAuth: true }
  },
  {
    path: '/questions',
    name: 'questions',
    component: () => import('@/views/Questions.vue'),
    meta: { title: '题库检索', requiresAuth: true }
  },
  {
    path: '/chat',
    name: 'chat',
    component: () => import('@/views/Chat.vue'),
    meta: { title: '团队协作', requiresAuth: true }
  },
  {
    path: '/admin',
    name: 'admin',
    component: () => import('@/views/Admin.vue'),
    meta: { title: '管理后台', requiresAuth: true, requiresAdmin: true }
  },
  { path: '/:pathMatch(.*)*', redirect: '/' }
];

const router = createRouter({
  history: createWebHistory('/platform/'),
  routes,
  scrollBehavior: () => ({ top: 0 })
});

/**
 * 权限守卫：
 * - 首页对所有访客开放
 * - 资源收录 / 题库检索 / 团队协作 / 管理后台 需要先通过访问密钥登录
 * - 管理后台额外要求管理员密钥
 */
router.beforeEach((to, from, next) => {
  document.title = (to.meta.title ? to.meta.title + ' - ' : '') + '信息素养大赛综合平台';

  const token = getToken();
  const user = getUser();
  const loggedIn = !!(token && user);

  if (to.meta.requiresAuth && !loggedIn) {
    // 未登录访问受保护模块时，停留在首页并自动弹出密钥登录框
    return next({ path: '/', query: { needAuth: '1', redirect: to.fullPath } });
  }

  if (to.meta.requiresAdmin && (!loggedIn || user.role !== 'admin')) {
    return next({ path: '/', query: { needAdmin: '1' } });
  }

  return next();
});

export default router;
