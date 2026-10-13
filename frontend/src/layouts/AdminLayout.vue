<template>
  <el-container class="admin-layout">
    <el-aside width="220px" class="admin-aside">
      <div class="aside-brand">
        <el-icon :size="20"><Setting /></el-icon>
        <span>管理后台</span>
      </div>

      <el-menu :default-active="activeMenu" router class="admin-menu">
        <el-menu-item index="/admin">
          <el-icon><Odometer /></el-icon>
          <span>仪表盘</span>
        </el-menu-item>
        <el-menu-item index="/admin/events">
          <el-icon><Trophy /></el-icon>
          <span>赛事管理</span>
        </el-menu-item>
        <el-menu-item index="/admin/questions">
          <el-icon><Document /></el-icon>
          <span>题库管理</span>
        </el-menu-item>
        <el-menu-item index="/admin/teams">
          <el-icon><User /></el-icon>
          <span>队伍管理</span>
        </el-menu-item>
        <el-menu-item index="/admin/stats">
          <el-icon><DataAnalysis /></el-icon>
          <span>数据统计</span>
        </el-menu-item>
        <el-menu-item index="/admin/cheat-logs">
          <el-icon><Warning /></el-icon>
          <span>预警管理</span>
        </el-menu-item>
        <el-menu-item index="/admin/settings">
          <el-icon><Tools /></el-icon>
          <span>系统设置</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="admin-header">
        <div class="header-title">{{ pageTitle }}</div>
        <div class="header-right">
          <span class="text-sub">{{ userStore.displayName }}</span>
          <el-button link type="primary" @click="handleLogout">退出登录</el-button>
        </div>
      </el-header>

      <el-main class="admin-main">
        <router-view />
      </el-main>

      <AppFooter />
    </el-container>
  </el-container>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessageBox } from 'element-plus';
import { useUserStore } from '@/stores/user';
import AppFooter from '@/components/AppFooter.vue';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const activeMenu = computed(() => {
  const p = route.path;
  if (p.startsWith('/admin/events')) return '/admin/events';
  if (p.startsWith('/admin/questions')) return '/admin/questions';
  if (p.startsWith('/admin/teams')) return '/admin/teams';
  if (p.startsWith('/admin/stats')) return '/admin/stats';
  if (p.startsWith('/admin/cheat-logs')) return '/admin/cheat-logs';
  if (p.startsWith('/admin/settings')) return '/admin/settings';
  return '/admin';
});

const pageTitle = computed(() => route.meta.title || '管理后台');

async function handleLogout() {
  try {
    await ElMessageBox.confirm('确认退出登录？', '提示', { type: 'warning' });
    userStore.logout();
    router.push('/admin/login');
  } catch (e) {
    /* 用户取消 */
  }
}
</script>

<style scoped>
.admin-layout {
  min-height: 100vh;
}

.admin-aside {
  background: var(--c-bg);
  border-right: 1px solid var(--c-border);
  display: flex;
  flex-direction: column;
}

.aside-brand {
  height: 60px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 20px;
  font-size: 16px;
  font-weight: 600;
  color: var(--c-primary);
  border-bottom: 1px solid var(--c-border);
}

.admin-menu {
  border-right: none;
  flex: 1;
}

.admin-header {
  background: var(--c-bg);
  border-bottom: 1px solid var(--c-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--c-text);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.admin-main {
  background: var(--c-bg-sub);
  padding: var(--sp-page);
  min-height: calc(100vh - 60px - 53px);
}
</style>
