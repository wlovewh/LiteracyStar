<template>
  <div>
    <div class="page-header">
      <h2 class="page-title">预警管理</h2>
      <div class="toolbar">
        <el-button :icon="Download" @click="handleExport">导出CSV</el-button>
        <el-button :icon="Refresh" @click="load" :loading="loading">刷新</el-button>
      </div>
    </div>

    <div class="stat-grid">
      <div class="app-card mini-stat">
        <span class="stat-value">{{ summary.total }}</span>
        <span class="stat-label">预警总数</span>
      </div>
      <div class="app-card mini-stat">
        <span class="stat-value">{{ summary.today }}</span>
        <span class="stat-label">今日预警</span>
      </div>
      <div class="app-card mini-stat threshold-card">
        <span class="threshold-text">触发阈值：切屏 {{ summary.thresholds?.maxSwitchCount }} 次 或 累计 {{ summary.thresholds?.maxSwitchSeconds }} 秒</span>
      </div>
    </div>

    <div class="app-card filter-card">
      <el-form :inline="true" @submit.prevent>
        <el-form-item label="事件类型">
          <el-select v-model="query.eventType" placeholder="全部" clearable style="width: 160px" @change="reload">
            <el-option v-for="t in eventTypes" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="学号">
          <el-input v-model="query.studentId" placeholder="按学号筛选" clearable style="width: 180px" @keyup.enter="reload" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="reload">查询</el-button>
          <el-button :icon="RefreshLeft" @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div class="app-card">
      <el-table :data="list" v-loading="loading" empty-text="暂无预警记录">
        <el-table-column label="时间" width="180">
          <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="队伍" min-width="140">
          <template #default="{ row }">{{ row.team_name || '-' }}</template>
        </el-table-column>
        <el-table-column label="学号" prop="student_id" width="140" />
        <el-table-column label="事件类型" width="130">
          <template #default="{ row }">
            <el-tag :type="row.event_type === '超过阈值' ? 'danger' : 'warning'" effect="plain" size="small">
              {{ row.event_type }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="持续时间" width="120" align="center">
          <template #default="{ row }">{{ row.duration }} 秒</template>
        </el-table-column>
        <el-table-column label="环节" prop="stage_name" min-width="180" />
      </el-table>

      <div class="pager">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          :total="total"
          :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="load"
          @size-change="reload"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Download, Refresh, Search, RefreshLeft } from '@element-plus/icons-vue';
import { adminApi } from '@/api';
import { formatDateTime, downloadBlob } from '@/utils/format';
import http from '@/api/http';

const loading = ref(false);
const list = ref([]);
const total = ref(0);
const summary = ref({ total: 0, today: 0, byType: [], thresholds: {} });

const eventTypes = ['切屏', '窗口失焦', '超过阈值'];

const query = reactive({ page: 1, pageSize: 20, eventType: null, studentId: '' });

async function load() {
  loading.value = true;
  try {
    const data = await adminApi.cheatLogs(query);
    list.value = data.list;
    total.value = data.total;
  } catch (e) {
    /* 拦截器已提示 */
  } finally {
    loading.value = false;
  }
}

async function loadSummary() {
  try {
    summary.value = await adminApi.cheatSummary();
  } catch (e) {
    /* 拦截器已提示 */
  }
}

function reload() {
  query.page = 1;
  load();
}

function resetQuery() {
  Object.assign(query, { page: 1, eventType: null, studentId: '' });
  load();
}

async function handleExport() {
  try {
    const res = await http.get('/admin/cheat-logs/export', { params: query, responseType: 'blob' });
    downloadBlob(res.data, 'cheat-logs.csv');
    ElMessage.success('导出成功');
  } catch (e) {
    ElMessage.error('导出失败');
  }
}

onMounted(() => {
  load();
  loadSummary();
});
</script>

<style scoped>
.stat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 2fr;
  gap: var(--sp);
  margin-bottom: var(--sp);
}

.mini-stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
  justify-content: center;
}

.threshold-card {
  align-items: flex-start;
}

.threshold-text {
  font-size: 13px;
  color: var(--c-text-sub);
}

.filter-card {
  margin-bottom: var(--sp);
}

.filter-card :deep(.el-form-item) {
  margin-bottom: 0;
}

.pager {
  margin-top: var(--sp);
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 1100px) {
  .stat-grid { grid-template-columns: 1fr; }
}
</style>
