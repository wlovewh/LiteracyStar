<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-brand">
        <el-icon :size="30"><Setting /></el-icon>
        <h1 class="login-title">管理后台</h1>
        <p class="login-sub">信息素养大赛模拟竞赛平台</p>
      </div>

      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
        <el-form-item label="账号" prop="username">
          <el-input v-model="form.username" placeholder="请输入管理员账号" size="large" clearable @keyup.enter="handleLogin" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input v-model="form.password" type="password" placeholder="请输入密码" size="large" show-password @keyup.enter="handleLogin" />
        </el-form-item>
        <el-button type="primary" size="large" class="login-btn" :loading="loading" @click="handleLogin">登录</el-button>
      </el-form>

      <el-divider />
      <div class="back-link">
        <el-button link type="primary" @click="router.push('/login')">返回学生登录</el-button>
      </div>
    </div>

    <AppFooter />
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useUserStore } from '@/stores/user';
import AppFooter from '@/components/AppFooter.vue';

const router = useRouter();
const userStore = useUserStore();

const formRef = ref();
const loading = ref(false);
const form = reactive({ username: '', password: '' });

const rules = {
  username: [{ required: true, message: '请输入管理员账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
};

async function handleLogin() {
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;

  loading.value = true;
  try {
    await userStore.adminLogin(form.username, form.password);
    ElMessage.success('登录成功');
    router.push('/admin');
  } catch (e) {
    /* 拦截器已提示 */
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--c-bg-sub);
  padding: var(--sp-page);
}

.login-card {
  width: 100%;
  max-width: 400px;
  background: var(--c-bg);
  border: 1px solid var(--c-border);
  border-radius: var(--r-card);
  padding: 32px;
  box-shadow: 0 2px 12px rgba(26, 58, 92, 0.06);
  margin: auto;
}

.login-brand {
  text-align: center;
  margin-bottom: 20px;
  color: var(--c-primary);
}

.login-title {
  font-size: 20px;
  font-weight: 600;
  margin: 12px 0 6px;
  color: var(--c-primary);
}

.login-sub {
  font-size: 12px;
  color: var(--c-text-sub);
  margin: 0;
}

.login-btn {
  width: 100%;
}

.back-link {
  text-align: center;
}
</style>
