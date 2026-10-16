<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-brand">
        <!-- 图标为综合平台隐藏入口，不提供任何文字提示 -->
        <el-icon :size="30" class="brand-icon" @click="goIntegrated"><Reading /></el-icon>
        <h1 class="login-title">信息素养大赛模拟竞赛平台</h1>
        <p class="login-sub">2026年福建省大学生信息素养大赛 · 校内模拟</p>
      </div>

      <el-tabs v-model="activeTab" class="login-tabs">
        <el-tab-pane label="学生登录" name="student">
          <el-form ref="studentFormRef" :model="studentForm" :rules="studentRules" label-position="top" @submit.prevent="handleStudentLogin">
            <el-form-item label="学号" prop="studentId">
              <el-input v-model="studentForm.studentId" placeholder="请输入学号" size="large" clearable />
            </el-form-item>
            <el-form-item label="密码" prop="password">
              <el-input v-model="studentForm.password" type="password" placeholder="默认密码与学号相同" size="large" show-password />
            </el-form-item>
            <el-button type="primary" size="large" class="login-btn" :loading="loading" @click="handleStudentLogin">登录</el-button>
            <p class="login-hint">初始密码与学号相同，如忘记请联系管理员</p>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="管理员登录" name="admin">
          <el-form ref="adminFormRef" :model="adminForm" :rules="adminRules" label-position="top" @submit.prevent="handleAdminLogin">
            <el-form-item label="账号" prop="username">
              <el-input v-model="adminForm.username" placeholder="请输入管理员账号" size="large" clearable />
            </el-form-item>
            <el-form-item label="密码" prop="password">
              <el-input v-model="adminForm.password" type="password" placeholder="请输入密码" size="large" show-password />
            </el-form-item>
            <el-button type="primary" size="large" class="login-btn" :loading="loading" @click="handleAdminLogin">登录</el-button>
          </el-form>
        </el-tab-pane>
      </el-tabs>
    </div>

    <AppFooter />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useUserStore } from '@/stores/user';
import AppFooter from '@/components/AppFooter.vue';

const router = useRouter();
const userStore = useUserStore();

/** 综合平台隐藏入口：点击顶部图标跳转，不做任何提示 */
function goIntegrated() {
  window.location.href = '/platform/';
}

const activeTab = ref('student');
const loading = ref(false);

const studentFormRef = ref();
const adminFormRef = ref();

const studentForm = reactive({ studentId: '', password: '' });
const adminForm = reactive({ username: '', password: '' });

const studentRules = {
  studentId: [{ required: true, message: '请输入学号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
};

const adminRules = {
  username: [{ required: true, message: '请输入管理员账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
};

/**
 * 回车登录：在页面级统一监听，不依赖 el-form / el-input 的事件冒泡。
 *
 * 之前把 @keyup.enter 同时绑在 el-form 和 el-input 上：
 *  - 一次回车会触发两次，靠 loading 兜底；
 *  - Element Plus 的包装层在部分浏览器/设备上不冒泡 keyup，
 *    于是"有的设备能用有的不能"。
 * 现在只保留这一个原生监听，任何输入框内回车都能登录。
 */
function onGlobalEnter(e) {
  if (e.key !== 'Enter' && e.keyCode !== 13) return;
  if (e.isComposing || e.keyCode === 229) return; // 中文输入法选词中，不触发
  if (loading.value) return;

  if (activeTab.value === 'student') handleStudentLogin();
  else handleAdminLogin();
}

onMounted(() => window.addEventListener('keydown', onGlobalEnter));
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalEnter));

async function handleStudentLogin() {
  // 防重复提交：必须在 await 之前置位。
  // 之前的写法先 await validate() 再置 loading，两次快速回车会同时通过判断，
  // 于是并发发起两个登录请求，表现为"有时候能用有时候不能用"。
  if (loading.value) return;
  loading.value = true;

  const valid = await studentFormRef.value.validate().catch(() => false);
  if (!valid) {
    loading.value = false;
    return;
  }

  try {
    const user = await userStore.studentLogin(studentForm.studentId, studentForm.password);
    ElMessage.success('登录成功，欢迎 ' + (user.name || user.studentId));
    router.push('/');
  } catch (e) {
    /* 错误提示由拦截器统一处理 */
  } finally {
    loading.value = false;
  }
}

async function handleAdminLogin() {
  // 防重复提交：同 handleStudentLogin，先置位再校验
  if (loading.value) return;
  loading.value = true;

  const valid = await adminFormRef.value.validate().catch(() => false);
  if (!valid) {
    loading.value = false;
    return;
  }

  try {
    await userStore.adminLogin(adminForm.username, adminForm.password);
    ElMessage.success('登录成功');
    router.push('/admin');
  } catch (e) {
    /* 错误提示由拦截器统一处理 */
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
  max-width: 420px;
  background: var(--c-bg);
  border: 1px solid var(--c-border);
  border-radius: var(--r-card);
  padding: 32px;
  box-shadow: 0 2px 12px rgba(26, 58, 92, 0.06);
  margin-bottom: auto;
  margin-top: auto;
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

/* 隐藏入口：图标可点击跳转综合平台，无任何提示 */
.brand-icon {
  cursor: pointer;
  transition: color .18s ease;
}

.brand-icon:hover { color: var(--c-primary-2); }

.login-tabs {
  margin-top: 8px;
}

.login-btn {
  width: 100%;
  margin-top: 4px;
}

.login-hint {
  font-size: 12px;
  color: var(--c-text-sub);
  text-align: center;
  margin: 12px 0 0;
}
</style>
