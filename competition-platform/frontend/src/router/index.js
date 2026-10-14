import { createRouter, createWebHistory } from 'vue-router';
import { getToken, getUser, setAuth, clearAuth } from '@/api/http';

const routes = [
  // ---------------- 前台 ----------------
  { path: '/login', name: 'login', component: () => import('@/views/Login.vue'), meta: { public: true, title: '登录' } },
  {
    path: '/',
    component: () => import('@/layouts/StudentLayout.vue'),
    children: [
      { path: '', name: 'home', component: () => import('@/views/student/Home.vue'), meta: { title: '首页' } },
      { path: 'stage/:id/ready', name: 'stage-ready', component: () => import('@/views/student/StageReady.vue'), meta: { title: '答题准备' } },
      { path: 'stage/:id/answer', name: 'stage-answer', component: () => import('@/views/student/StageAnswer.vue'), meta: { title: '答题' } },
      { path: 'stage/:id/result', name: 'stage-result', component: () => import('@/views/student/StageResult.vue'), meta: { title: '成绩' } },
      { path: 'stage/:id/wrong', name: 'stage-wrong', component: () => import('@/views/student/StageWrong.vue'), meta: { title: '错题本' } },
      { path: 'stage/:id/rank', name: 'stage-rank', component: () => import('@/views/student/StageRank.vue'), meta: { title: '排行榜' } }
    ]
  },

  // ---------------- 后台 ----------------
  { path: '/admin/login', name: 'admin-login', component: () => import('@/views/AdminLogin.vue'), meta: { public: true, title: '管理员登录' } },
  {
    path: '/admin',
    component: () => import('@/layouts/AdminLayout.vue'),
    meta: { admin: true },
    children: [
      { path: '', name: 'admin-dashboard', component: () => import('@/views/admin/Dashboard.vue'), meta: { title: '仪表盘' } },
      { path: 'events', name: 'admin-events', component: () => import('@/views/admin/Events.vue'), meta: { title: '赛事管理' } },
      { path: 'events/:id/stages', name: 'admin-stages', component: () => import('@/views/admin/Stages.vue'), meta: { title: '环节管理' } },
      { path: 'stages/:id/edit', name: 'admin-stage-edit', component: () => import('@/views/admin/StageEdit.vue'), meta: { title: '环节编辑' } },
      { path: 'questions', name: 'admin-questions', component: () => import('@/views/admin/Questions.vue'), meta: { title: '题库管理' } },
      { path: 'questions/import', name: 'admin-question-import', component: () => import('@/views/admin/QuestionImport.vue'), meta: { title: '批量导入题目' } },
      { path: 'questions/:id/edit', name: 'admin-question-edit', component: () => import('@/views/admin/QuestionEdit.vue'), meta: { title: '编辑题目' } },
      { path: 'teams', name: 'admin-teams', component: () => import('@/views/admin/Teams.vue'), meta: { title: '队伍管理' } },
      { path: 'teams/import', name: 'admin-team-import', component: () => import('@/views/admin/TeamImport.vue'), meta: { title: '批量导入队伍' } },
      { path: 'teams/:id/edit', name: 'admin-team-edit', component: () => import('@/views/admin/TeamEdit.vue'), meta: { title: '编辑队伍' } },
      { path: 'stats', name: 'admin-stats', component: () => import('@/views/admin/Stats.vue'), meta: { title: '数据统计' } },
      { path: 'cheat-logs', name: 'admin-cheat-logs', component: () => import('@/views/admin/CheatLogs.vue'), meta: { title: '预警管理' } },
      { path: 'settings', name: 'admin-settings', component: () => import('@/views/admin/Settings.vue'), meta: { title: '系统设置' } }
    ]
  },

  { path: '/:pathMatch(.*)*', redirect: '/login' }
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 })
});

/**
 * 会话有效性校验（仅执行一次）。
 *
 * 之前只检查 localStorage 里有没有 token，从不验证它是否还有效。
 * 令牌过期（默认 12 小时）或服务端重启换密钥后，页面仍显示缓存的
 * 身份信息（例如"系统管理员"），直到某个接口返回 401 才退出——
 * 表现为"过一会儿重新访问首页默认变成系统管理员"。
 */
let sessionChecked = false;
let sessionPromise = null;

async function ensureSessionValid() {
  if (sessionChecked) return;
  if (sessionPromise) return sessionPromise;

  const token = getToken();
  if (!token) { sessionChecked = true; return; }

  sessionPromise = (async () => {
    try {
      const { authApi } = await import('@/api');
      const me = await authApi.me();
      // 以服务端返回的身份为准，覆盖可能过期的本地缓存
      if (me) setAuth(token, me);
    } catch (e) {
      // 401/403 表示会话已失效：清掉本地缓存，回到登录页
      const status = e && e.response && e.response.status;
      if (status === 401 || status === 403) clearAuth();
    } finally {
      sessionChecked = true;
      sessionPromise = null;
    }
  })();

  return sessionPromise;
}

router.beforeEach(async (to, from, next) => {
  document.title = (to.meta.title ? to.meta.title + ' - ' : '') + '信息素养大赛模拟竞赛平台';

  // 非公开页面先校验会话，避免展示过期身份
  if (!to.meta.public) await ensureSessionValid();

  const token = getToken();
  const user = getUser();

  if (to.meta.public) {
    // 已登录时访问登录页，直接跳转到对应首页
    if (token && to.name === 'login' && user && user.role !== 'admin') return next('/');
    if (token && to.name === 'admin-login' && user && user.role === 'admin') return next('/admin');
    return next();
  }

  if (!token) {
    return next(to.path.startsWith('/admin') ? '/admin/login' : '/login');
  }

  if (to.path.startsWith('/admin') && (!user || user.role !== 'admin')) {
    return next('/admin/login');
  }

  return next();
});

export default router;
