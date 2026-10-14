<template>
  <div>
    <div class="page-header">
      <h2 class="page-title">赛事管理</h2>
      <el-button type="primary" :icon="Plus" @click="openDialog()">新建赛事</el-button>
    </div>

    <div class="app-card">
      <el-table :data="list" v-loading="loading" empty-text="暂无赛事">
        <el-table-column label="ID" prop="id" width="70" />
        <el-table-column label="赛事名称" prop="name" min-width="240" />
        <el-table-column label="赛事描述" prop="description" min-width="280" show-overflow-tooltip />
        <el-table-column label="环节数量" width="110" align="center">
          <template #default="{ row }">
            <span>{{ row.stage_count }}</span>
            <span class="text-sub"> (启用 {{ row.active_stage_count }})</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'primary' : 'info'" effect="plain" size="small">
              {{ row.status === 1 ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="router.push('/admin/events/' + row.id + '/stages')">进入管理</el-button>
            <el-button link type="primary" @click="openDialog(row)">编辑</el-button>
            <el-button link type="danger" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑赛事' : '新建赛事'" width="520px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="赛事名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入赛事名称" maxlength="100" show-word-limit />
        </el-form-item>
        <el-form-item label="赛事描述" prop="description">
          <el-input v-model="form.description" type="textarea" :rows="4" placeholder="请输入赛事描述" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="form.status" :active-value="1" :inactive-value="0" active-text="启用" inactive-text="停用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { eventApi } from '@/api';
import { formatDateTime } from '@/utils/format';

const router = useRouter();

const loading = ref(false);
const saving = ref(false);
const list = ref([]);
const dialogVisible = ref(false);
const formRef = ref();

const form = reactive({ id: null, name: '', description: '', status: 1 });

const rules = {
  name: [{ required: true, message: '请输入赛事名称', trigger: 'blur' }]
};

async function load() {
  loading.value = true;
  try {
    list.value = await eventApi.list();
  } catch (e) {
    /* 拦截器已提示 */
  } finally {
    loading.value = false;
  }
}

function openDialog(row) {
  if (row) {
    Object.assign(form, { id: row.id, name: row.name, description: row.description || '', status: row.status });
  } else {
    Object.assign(form, { id: null, name: '', description: '', status: 1 });
  }
  dialogVisible.value = true;
}

async function handleSave() {
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;

  saving.value = true;
  try {
    const payload = { name: form.name, description: form.description, status: form.status };
    if (form.id) await eventApi.update(form.id, payload);
    else await eventApi.create(payload);
    ElMessage.success('保存成功');
    dialogVisible.value = false;
    await load();
  } catch (e) {
    /* 拦截器已提示 */
  } finally {
    saving.value = false;
  }
}

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm('确认删除赛事「' + row.name + '」？该操作会同时删除其下所有环节。', '删除确认', { type: 'warning' });
  } catch (e) {
    return;
  }
  try {
    await eventApi.remove(row.id);
    ElMessage.success('删除成功');
    await load();
  } catch (e) {
    /* 拦截器已提示 */
  }
}

onMounted(load);
</script>
