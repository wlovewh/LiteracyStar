<template>
  <div class="student-layout">
    <header class="student-header">
      <div class="header-inner">
        <div class="brand" @click="router.push('/')">
          <el-icon :size="22"><Reading /></el-icon>
          <span class="brand-title">信息素养大赛模拟竞赛平台</span>
        </div>

        <div class="header-right">
          <el-tag v-if="userStore.user" :type="userStore.isLeader ? 'primary' : 'info'" effect="plain" size="small">
            {{ userStore.isLeader ? '队长' : '队员' }}
          </el-tag>
          <span class="user-name">{{ userStore.displayName }}</span>
          <span v-if="userStore.user?.teamName" class="text-sub">{{ userStore.user.teamName }}</span>
          <el-button link type="primary" @click="handleLogout">退出登录</el-button>
        </div>
      </div>
    </header>

    <main class="student-main">
      <router-view />
    </main>

    <AppFooter />
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router';
import { ElMessageBox } from 'element-plus';
import { useUserStore } from '@/stores/user';
import AppFooter from '@/components/AppFooter.vue';

const router = useRouter();
const userStore = useUserStore();

async function handleLogout() {
  try {
    await ElMessageBox.confirm('确认退出登录？', '提示', { type: 'warning' });
    userStore.logout();
    router.push('/login');
  } catch (e) {
    /* 用户取消 */
  }
}
</script>

<style scoped>
.student-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--c-bg-sub);
}

.student-header {
  background: var(--c-bg);
  border-bottom: 1px solid var(--c-border);
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 var(--sp-page);
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  color: var(--c-primary);
}

.brand-title {
  font-size: 16px;
  font-weight: 600;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-name {
  font-weight: 600;
  color: var(--c-text);
}

.student-main {
  flex: 1;
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
}
</style>
