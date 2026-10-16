<template>
  <nav class="app-nav">
    <div class="nav-brand">信息素养大赛综合平台</div>

    <div class="nav-links">
      <router-link
        v-for="item in visibleLinks"
        :key="item.path"
        :to="item.path"
        class="nav-link"
        :class="{ 'is-active': isActive(item.path) }"
      >
        {{ item.label }}
      </router-link>
    </div>

    <div class="nav-right">
      <template v-if="auth.isLoggedIn">
        <el-tag :type="auth.isAdmin ? 'primary' : 'info'" effect="plain" size="small">
          {{ auth.roleLabel }}
        </el-tag>
        <el-button link type="primary" @click="handleLogout">退出</el-button>
      </template>
      <el-button v-else link type="primary" @click="openLogin">密钥登录</el-button>
    </div>

    <!-- 密钥登录弹窗 -->
    <el-dialog v-model="showLogin" title="访问密钥登录" width="420px" append-to-body>
      <el-form @submit.prevent>
        <el-form-item label="访问密钥" label-width="80px">
          <!-- 回车由页面级监听统一处理，见 onGlobalEnter：
               el-input 内部包了一层 input，@keydown.enter 在部分浏览器下不冒泡 -->
          <el-input
            v-model="keyValue"
            placeholder="请输入访问密钥"
            clearable
            show-password
          />
        </el-form-item>
        <div class="login-hint">
          密钥由管理员分配。首页可自由浏览，资源收录、题库检索与团队协作需先使用密钥登录。
        </div>
      </el-form>
      <template #footer>
        <el-button @click="showLogin = false">取消</el-button>
        <el-button type="primary" :loading="loading" @click="handleLogin">登录</el-button>
      </template>
    </el-dialog>
  </nav>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import { useLoginPromptStore } from '@/stores/loginPrompt';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const loginPrompt = useLoginPromptStore();

const keyValue = ref('');
const loading = ref(false);

/** 弹窗可见性由全局状态驱动，避免依赖会残留的 URL query */
const showLogin = computed({
  get: () => loginPrompt.visible,
  set: (v) => { if (!v) loginPrompt.close(); else loginPrompt.visible = true; }
});

const links = [
  { path: '/', label: '首页' },
  { path: '/resources', label: '资源收录' },
  { path: '/questions', label: '题库检索' },
  { path: '/chat', label: '团队协作' },
  { path: '/admin', label: '管理后台', adminOnly: true }
];

const visibleLinks = computed(() => links.filter((l) => !l.adminOnly || auth.isAdmin));

function isActive(path) {
  if (path === '/') return route.path === '/';
  return route.path.startsWith(path);
}

/** 手动点击「密钥登录」 */
function openLogin() {
  loginPrompt.requireLogin(String(route.query.redirect || ''));
}

async function handleLogin() {
  if (loading.value) return; // 防止回车连按重复提交
  const key = keyValue.value.trim();
  if (!key) return ElMessage.warning('请输入访问密钥');

  loading.value = true;
  try {
    const user = await auth.login(key);
    ElMessage.success('登录成功');

    const redirect = loginPrompt.redirect || String(route.query.redirect || '');
    loginPrompt.close();
    keyValue.value = '';

    // 登录后回到被拦截的目标页面
    if (redirect) router.push(redirect);
    else if (user.role === 'admin' && route.query.needAdmin) router.push('/admin');
  } catch (e) {
    // 错误提示已由 http 拦截器统一弹出
  } finally {
    loading.value = false;
  }
}

/**
 * 回车登录。
 *
 * 只在登录弹窗打开时生效，且过滤中文输入法组合态，
 * 避免影响页面上其他输入框的正常回车行为。
 */
function onGlobalEnter(e) {
  if (!showLogin.value) return;
  if (e.key !== 'Enter' && e.keyCode !== 13) return;
  if (e.isComposing || e.keyCode === 229) return;
  e.preventDefault();
  handleLogin();
}

onMounted(() => window.addEventListener('keydown', onGlobalEnter));
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalEnter));

function handleLogout() {
  auth.logout();
  ElMessage.success('已退出登录');
  if (route.meta.requiresAuth) router.push('/');
}

// 弹窗由路由守卫通过 loginPrompt store 触发（见 router/index.js），
// 这里不再监听 URL query —— 旧实现依赖会残留的 query，导致「点一次后没反应」。
// 兼容旧链接：带 needAuth 参数进入时补一次触发。
if (route.query.needAuth && !auth.isLoggedIn) {
  loginPrompt.requireLogin(String(route.query.redirect || ''));
}
</script>

<style scoped>
.nav-right { display: flex; align-items: center; gap: 12px; }
.login-hint { font-size: var(--f-xs); color: var(--c-text-sub); line-height: 1.6; padding-left: 80px; }
</style>
