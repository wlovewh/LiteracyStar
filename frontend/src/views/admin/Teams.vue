<template>
  <div>
    <div class="page-header">
      <h2 class="page-title">队伍管理</h2>
      <div class="toolbar">
        <el-button :icon="Upload" @click="router.push('/admin/teams/import')">批量导入</el-button>
        <el-button :icon="Download" @click="handleExport">导出</el-button>
        <el-button type="danger" :icon="Delete" :disabled="!selection.length" @click="handleBatchDelete">删除选中</el-button>
        <el-button type="primary" :icon="Plus" @click="router.push('/admin/teams/new/edit')">新增队伍</el-button>
      </div>
    </div>

    <div class="app-card filter-card">
      <el-form :inline="true" @submit.prevent>
        <el-form-item label="搜索">
          <el-input v-model="query.keyword" placeholder="队伍名称或学号" clearable style="width: 240px" @keyup.enter="reload" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" placeholder="全部" clearable style="width: 120px" @change="reload">
            <el-option label="启用" :value="1" />
            <el-option label="禁用" :value="0" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="reload">查询</el-button>
          <el-button :icon="RefreshLeft" @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div class="app-card">
      <el-table :data="list" v-loading="loading" empty-text="暂无队伍" @selection-change="(r) => (selection = r)">
        <el-table-column type="selection" width="48" />
        <el-table-column label="队伍名称" prop="name" min-width="140" />
        <el-table-column label="队长姓名" prop="leader_name" width="110" />
        <el-table-column label="队长学号" prop="leader_id" width="130" />
        <el-table-column label="队长电话" prop="leader_phone" width="140" />
        <el-table-column label="队员1" width="150">
          <template #default="{ row }">
            <span v-if="row.member1_name">{{ row.member1_name }}</span>
            <span v-if="row.member1_id" class="text-sub"> ({{ row.member1_id }})</span>
            <span v-if="!row.member1_name && !row.member1_id" class="text-sub">-</span>
          </template>
        </el-table-column>
        <el-table-column label="队员2" width="150">
          <template #default="{ row }">
            <span v-if="row.member2_name">{{ row.member2_name }}</span>
            <span v-if="row.member2_id" class="text-sub"> ({{ row.member2_id }})</span>
            <span v-if="!row.member2_name && !row.member2_id" class="text-sub">-</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'primary' : 'info'" effect="plain" size="small">
              {{ row.status === 1 ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="router.push('/admin/teams/' + row.id + '/edit')">编辑</el-button>
            <el-button link type="primary" @click="handleClearAnswers(row)">清空答题</el-button>
            <el-button link type="danger" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
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
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Upload, Download, Delete, Search, RefreshLeft } from '@element-plus/icons-vue';
import { teamApi } from '@/api';
import http from '@/api/http';

const router = useRouter();

const loading = ref(false);
const list = ref([]);
const total = ref(0);
const selection = ref([]);

const query = reactive({ page: 1, pageSize: 20, keyword: '', status: null });

async function load() {
  loading.value = true;
  try {
    const data = await teamApi.list(query);
    list.value = data.list;
    total.value = data.total;
  } catch (e) {
    /* 拦截器已提示 */
  } finally {
    loading.value = false;
  }
}

function reload() {
  query.page = 1;
  load();
}

function resetQuery() {
  Object.assign(query, { page: 1, keyword: '', status: null });
  load();
}

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm('确认删除队伍「' + row.name + '」？', '删除确认', { type: 'warning' });
  } catch (e) {
    return;
  }
  try {
    await teamApi.remove(row.id);
    ElMessage.success('删除成功');
    await load();
  } catch (e) {
    /* 拦截器已提示 */
  }
}

/**
 * 清空答题数据，允许该队伍重新作答。
 * 该操作不可撤销，需二次确认。
 */
async function handleClearAnswers(row) {
  try {
    await ElMessageBox.confirm(
      '将清空队伍「' + row.name + '」的全部答题记录、成绩与排名缓存，清空后该队伍可重新作答。此操作不可撤销，确定继续吗？',
      '清空答题数据',
      { type: 'warning', confirmButtonText: '确认清空', cancelButtonText: '取消' }
    );
  } catch (e) {
    return;
  }
  try {
    const res = await teamApi.clearAnswers(row.id);
    ElMessage.success(
      '已清空：答题 ' + res.answers + ' 条、成绩 ' + res.scores + ' 条、预警 ' + res.cheatCleared + ' 条'
    );
    await load();
  } catch (e) {
    /* 拦截器已提示 */
  }
}

async function handleBatchDelete() {
  const ids = selection.value.map((r) => r.id);
  try {
    await ElMessageBox.confirm('确认删除选中的 ' + ids.length + ' 支队伍？', '批量删除', { type: 'warning' });
  } catch (e) {
    return;
  }
  try {
    const res = await teamApi.removeMany(ids);
    ElMessage.success('已删除 ' + res.deleted + ' 支队伍' + (res.skipped?.length ? '，' + res.skipped.length + ' 支被跳过' : ''));
    await load();
  } catch (e) {
    /* 拦截器已提示 */
  }
}

async function handleExport() {
  try {
    const res = await http.get('/teams/export', { params: query, responseType: 'blob' });
    const { downloadBlob } = await import('@/utils/format');
    downloadBlob(res.data, 'teams.xlsx');
    ElMessage.success('导出成功');
  } catch (e) {
    ElMessage.error('导出失败');
  }
}

onMounted(load);
</script>

<style scoped>
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
</style>
