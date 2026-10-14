<template>
  <div v-loading="loading">
    <div class="page-header">
      <h2 class="page-title">{{ isNew ? '新增队伍' : '编辑队伍' }}</h2>
      <div class="toolbar">
        <el-button :icon="ArrowLeft" @click="router.push('/admin/teams')">返回列表</el-button>
        <el-button type="primary" :icon="Check" :loading="saving" @click="handleSave">保存</el-button>
      </div>
    </div>

    <div class="app-card">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="120px">
        <el-form-item label="队伍名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入队伍名称" maxlength="100" />
        </el-form-item>

        <el-divider content-position="left">队长信息（登录账号 = 队长学号）</el-divider>
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="队长姓名" prop="leader_name">
              <el-input v-model="form.leader_name" placeholder="请输入队长姓名" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="队长学号" prop="leader_id">
              <el-input v-model="form.leader_id" placeholder="请输入队长学号" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="联系电话" prop="leader_phone">
              <el-input v-model="form.leader_phone" placeholder="请输入联系电话" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider content-position="left">队员信息（默认仅可见个人环节）</el-divider>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="队员1姓名">
              <el-input v-model="form.member1_name" placeholder="选填" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="队员1学号">
              <el-input v-model="form.member1_id" placeholder="选填" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="队员2姓名">
              <el-input v-model="form.member2_name" placeholder="选填" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="队员2学号">
              <el-input v-model="form.member2_id" placeholder="选填" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider content-position="left">账号状态</el-divider>
        <el-form-item label="状态">
          <el-switch v-model="form.status" :active-value="1" :inactive-value="0" active-text="启用" inactive-text="禁用" />
          <span class="field-hint">禁用后该队伍所有账号无法登录</span>
        </el-form-item>

        <el-alert type="info" :closable="false" show-icon class="tip-alert" title="账号规则">
          <div>队长登录账号为队长学号，队员登录账号为各自学号，默认密码与学号相同。</div>
          <div>队长可见全部环节，队员默认仅可见个人环节（个人对抗、个人接力）。</div>
        </el-alert>
      </el-form>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ArrowLeft, Check } from '@element-plus/icons-vue';
import { teamApi } from '@/api';

const route = useRoute();
const router = useRouter();

const isNew = computed(() => route.params.id === 'new');

const loading = ref(false);
const saving = ref(false);
const formRef = ref();

const form = reactive({
  name: '', leader_name: '', leader_id: '', leader_phone: '',
  member1_name: '', member1_id: '', member2_name: '', member2_id: '', status: 1
});

const rules = {
  name: [{ required: true, message: '请输入队伍名称', trigger: 'blur' }],
  leader_name: [{ required: true, message: '请输入队长姓名', trigger: 'blur' }],
  leader_id: [{ required: true, message: '请输入队长学号', trigger: 'blur' }],
  leader_phone: [{ required: true, message: '请输入联系电话', trigger: 'blur' }]
};

async function load() {
  if (isNew.value) return;
  loading.value = true;
  try {
    const data = await teamApi.get(route.params.id);
    Object.assign(form, data);
  } catch (e) {
    /* 拦截器已提示 */
  } finally {
    loading.value = false;
  }
}

async function handleSave() {
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;

  saving.value = true;
  try {
    if (isNew.value) await teamApi.create({ ...form });
    else await teamApi.update(route.params.id, { ...form });
    ElMessage.success('保存成功');
    router.push('/admin/teams');
  } catch (e) {
    /* 拦截器已提示 */
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.field-hint {
  margin-left: 12px;
  font-size: 12px;
  color: var(--c-text-sub);
}

.tip-alert {
  margin-top: var(--sp-tight);
  border-radius: var(--r-btn);
  line-height: 1.9;
}
</style>
