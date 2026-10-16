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
        <el-table-column label="可见范围" width="150" align="center">
          <template #default="{ row }">
            <el-tag v-if="!visibleCount(row.id)" type="info" effect="plain" size="small">全部队伍</el-tag>
            <el-tag v-else type="primary" effect="plain" size="small">
              {{ visibleCount(row.id) }} 支队伍
            </el-tag>
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
        <el-table-column label="操作" width="320" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="router.push('/admin/events/' + row.id + '/stages')">进入管理</el-button>
            <el-button link type="primary" @click="openVisible(row)">可见范围</el-button>
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

    <!-- 赛事可见范围：勾选哪些队伍能看到本赛事 -->
    <el-dialog v-model="visibleDialog" title="设置可见范围" width="640px">
      <div class="visible-tip">
        <p><strong>{{ visibleForm.eventName }}</strong></p>
        <p class="text-sub">
          默认<strong>所有队伍都看不到</strong>本赛事，勾选后名单内的队伍才能看到。
        </p>
      </div>

      <div class="visible-toolbar">
        <el-input v-model="teamKeyword" placeholder="搜索队伍名称或队长学号" clearable style="width: 260px" />
        <el-button link type="primary" @click="selectAllTeams">全选</el-button>
        <el-button link type="primary" @click="clearAllTeams">清空</el-button>
        <span class="text-sub">已选 {{ visibleForm.teamIds.length }} / {{ teams.length }}</span>
      </div>

      <div class="visible-scroll">
        <el-checkbox-group v-model="visibleForm.teamIds" class="visible-list">
          <label
            v-for="t in filteredTeams"
            :key="t.id"
            class="visible-item"
            :class="{ 'is-picked': visibleForm.teamIds.includes(t.id) }"
          >
            <el-checkbox :value="t.id" class="visible-check">
              <span class="team-name">{{ t.name }}</span>
              <span class="team-meta">{{ t.leader_name }} · {{ t.leader_id }}</span>
            </el-checkbox>
          </label>
        </el-checkbox-group>
        <el-empty v-if="!filteredTeams.length" description="没有匹配的队伍" :image-size="70" />
      </div>

      <template #footer>
        <el-button @click="visibleDialog = false">取消</el-button>
        <el-button type="primary" :loading="visibleSaving" @click="saveVisible">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { eventApi, teamApi } from '@/api';
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

// ---------------- 赛事可见范围 ----------------
const visibleDialog = ref(false);
const visibleSaving = ref(false);
const visibleForm = reactive({ eventId: null, eventName: '', teamIds: [] });
const teams = ref([]);
const teamKeyword = ref('');
/** eventId -> 已配置的队伍ID数组；未出现的赛事表示对全体开放 */
const visibilityMap = ref({});

const visibleCount = (eventId) => (visibilityMap.value[String(eventId)] || []).length;

const filteredTeams = computed(() => {
  const kw = teamKeyword.value.trim().toLowerCase();
  if (!kw) return teams.value;
  return teams.value.filter(
    (t) =>
      String(t.name || '').toLowerCase().includes(kw) ||
      String(t.leader_id || '').toLowerCase().includes(kw) ||
      String(t.leader_name || '').toLowerCase().includes(kw)
  );
});

async function loadVisibility() {
  try {
    visibilityMap.value = (await eventApi.visibilityOverview()) || {};
  } catch (e) {
    visibilityMap.value = {};
  }
}

async function openVisible(row) {
  visibleForm.eventId = row.id;
  visibleForm.eventName = row.name;
  visibleForm.teamIds = [...(visibilityMap.value[String(row.id)] || [])];
  teamKeyword.value = '';
  visibleDialog.value = true;

  if (!teams.value.length) {
    try {
      const res = await teamApi.list({ pageSize: 1000 });
      teams.value = Array.isArray(res) ? res : (res.list || []);
    } catch (e) {
      /* 拦截器已提示 */
    }
  }
}

function selectAllTeams() {
  visibleForm.teamIds = filteredTeams.value.map((t) => t.id);
}

function clearAllTeams() {
  visibleForm.teamIds = [];
}

async function saveVisible() {
  visibleSaving.value = true;
  try {
    await eventApi.setVisibleTeams(visibleForm.eventId, visibleForm.teamIds);
    ElMessage.success(visibleForm.teamIds.length ? '已限定可见队伍' : '已设为全部队伍可见');
    visibleDialog.value = false;
    await loadVisibility();
  } catch (e) {
    /* 拦截器已提示 */
  } finally {
    visibleSaving.value = false;
  }
}

async function load() {
  loading.value = true;
  try {
    list.value = await eventApi.list();
    await loadVisibility();
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

<style scoped>
.visible-tip {
  margin-bottom: 14px;
  line-height: 1.7;
}
.visible-tip p {
  margin: 0 0 4px;
}
.visible-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

/* 列表在固定高度内滚动，队伍多时弹窗尺寸保持不变 */
.visible-scroll {
  max-height: 340px;
  overflow-y: auto;
  padding-right: 4px;
}

.visible-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 每支队伍一个圆角矩形卡片，彼此留出间距 */
.visible-item {
  display: block;
  margin: 0;
  padding: 12px 14px;
  border: 1px solid var(--c-border);
  border-radius: var(--r-card);
  background: var(--c-white);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.visible-item:hover {
  border-color: var(--c-primary-2);
}
.visible-item.is-picked {
  border-color: var(--c-primary);
  background: var(--c-selected);
}

.visible-check {
  width: 100%;
  height: auto;
  margin-right: 0;
  align-items: center;
}
.visible-check :deep(.el-checkbox__label) {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.5;
  white-space: normal;
}

.team-name {
  font-size: var(--f-sm);
  font-weight: 600;
  color: var(--c-text);
}
.team-meta {
  font-size: var(--f-xs);
  color: var(--c-text-sub);
}
</style>
