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
      <el-button v-else link type="primary" @click="showLogin = true">密钥登录</el-button>
    </div>

    <!-- 密钥登录弹窗 -->
    <el-dialog v-model="showLogin" title="访问密钥登录" width="420px" append-to-body>
      <el-form @submit.prevent>
        <el-form-item label="访问密钥" label-width="80px">
          <el-input
            v-model="keyValue"
            placeholder="请输入访问密钥"
            clearable
            show-password
            @keyup.enter="handleLogin"
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
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const showLogin = ref(false);
const keyValue = ref('');
const loading = ref(false);

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

async function handleLogin() {
  const key = keyValue.value.trim();
  if (!key) return ElMessage.warning('请输入访问密钥');

  loading.value = true;
  try {
    const user = await auth.login(key);
    ElMessage.success('登录成功');
    showLogin.value = false;
    keyValue.value = '';

    // 登录后回到被拦截的目标页面
    const redirect = route.query.redirect;
    if (redirect) router.push(String(redirect));
    else if (user.role === 'admin' && route.query.needAdmin) router.push('/admin');
  } catch (e) {
    // 错误提示已由 http 拦截器统一弹出
  } finally {
    loading.value = false;
  }
}

function handleLogout() {
  auth.logout();
  ElMessage.success('已退出登录');
  if (route.meta.requiresAuth) router.push('/');
}

// 被守卫拦截跳回首页时，自动弹出密钥登录框
watch(
  () => route.query.needAuth,
  (v) => {
    if (v && !auth.isLoggedIn) showLogin.value = true;
  },
  { immediate: true }
);
</script>

<style scoped>
.nav-right { display: flex; align-items: center; gap: 12px; }
.login-hint { font-size: var(--f-xs); color: var(--c-text-sub); line-height: 1.6; padding-left: 80px; }
</style>
