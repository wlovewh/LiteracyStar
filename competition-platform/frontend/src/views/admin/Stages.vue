<template>
  <div>
    <div class="page-header">
      <div>
        <h2 class="page-title">环节管理</h2>
        <p class="text-sub event-sub">{{ eventName }}</p>
      </div>
      <div class="toolbar">
        <el-button :icon="ArrowLeft" @click="router.push('/admin/events')">返回赛事</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新建环节</el-button>
      </div>
    </div>

    <div class="app-card">
      <el-table :data="list" v-loading="loading" empty-text="暂无环节">
        <el-table-column label="排序" prop="sortOrder" width="70" align="center" />
        <el-table-column label="环节名称" prop="name" min-width="200" />
        <el-table-column label="答题模式" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="row.mode === 'team' ? 'warning' : 'primary'" effect="plain" size="small">
              {{ row.mode === 'team' ? '团队协作' : '个人独立' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="题目数量" prop="questionCount" width="100" align="center" />
        <el-table-column label="总分" prop="totalScore" width="90" align="center" />
        <el-table-column label="时限" width="120" align="center">
          <template #default="{ row }">{{ timeLabel(row) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="statusMeta(row.status).type" effect="plain" size="small">{{ statusMeta(row.status).label }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="330" fixed="right">
          <template #default="{ row, $index }">
            <el-button link type="primary" @click="router.push('/admin/stages/' + row.id + '/edit')">编辑</el-button>
            <el-button link type="primary" @click="handleCopy(row)">复制</el-button>
            <el-button link type="primary" @click="handleStatus(row)">{{ row.status === 1 ? '停用' : '开启' }}</el-button>
            <el-button link type="primary" :disabled="$index === 0" @click="handleMove(row, 'up')">上移</el-button>
            <el-button link type="primary" :disabled="$index === list.length - 1" @click="handleMove(row, 'down')">下移</el-button>
            <el-button link type="danger" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, ArrowLeft } from '@element-plus/icons-vue';
import { eventApi, stageApi } from '@/api';
import { humanDuration, STAGE_STATUS } from '@/utils/format';

const route = useRoute();
const router = useRouter();
const eventId = route.params.id;

const loading = ref(false);
const list = ref([]);
const eventName = ref('');

function statusMeta(s) {
  return STAGE_STATUS[s] || { label: '未知', type: 'info' };
}

function timeLabel(row) {
  const t = row.config?.timeConfig || {};
  if (t.perQuestionTime > 0) return '每题 ' + t.perQuestionTime + ' 秒';
  return humanDuration(t.totalTime);
}

async function load() {
  loading.value = true;
  try {
    const [ev, stages] = await Promise.all([eventApi.get(eventId), eventApi.stages(eventId)]);
    eventName.value = ev.name;
    list.value = stages;
  } catch (e) {
    /* 拦截器已提示 */
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  router.push('/admin/stages/new/edit?eventId=' + eventId);
}

async function handleCopy(row) {
  try {
    await stageApi.copy(row.id);
    ElMessage.success('复制成功');
    await load();
  } catch (e) {
    /* 拦截器已提示 */
  }
}

async function handleStatus(row) {
  const next = row.status === 1 ? 0 : 1;
  try {
    await stageApi.setStatus(row.id, next);
    ElMessage.success(next === 1 ? '环节已开启' : '环节已停用');
    await load();
  } catch (e) {
    /* 拦截器已提示 */
  }
}

async function handleMove(row, direction) {
  try {
    list.value = await stageApi.move(row.id, direction);
  } catch (e) {
    /* 拦截器已提示 */
  }
}

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm('确认删除环节「' + row.name + '」？', '删除确认', { type: 'warning' });
  } catch (e) {
    return;
  }
  try {
    await stageApi.remove(row.id);
    ElMessage.success('删除成功');
    await load();
  } catch (e) {
    /* 拦截器已提示 */
  }
}

onMounted(load);
</script>

<style scoped>
.event-sub {
  margin: 6px 0 0;
}
</style>
