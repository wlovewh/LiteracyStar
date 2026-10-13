<template>
  <div>
    <div class="page-header">
      <h2 class="page-title">题库管理</h2>
      <div class="toolbar">
        <el-button :icon="Upload" @click="router.push('/admin/questions/import')">批量导入</el-button>
        <el-button :icon="Download" @click="handleExport">导出</el-button>
        <el-button type="danger" :icon="Delete" :disabled="!selection.length" @click="handleBatchDelete">删除选中</el-button>
        <el-button type="primary" :icon="Plus" @click="router.push('/admin/questions/new/edit')">新增题目</el-button>
      </div>
    </div>

    <!-- 筛选 (project.md 5.1) -->
    <div class="app-card filter-card">
      <el-form :inline="true" @submit.prevent>
        <el-form-item label="题型">
          <el-select v-model="query.type" placeholder="全部" clearable style="width: 120px" @change="reload">
            <el-option label="单选" :value="1" />
            <el-option label="多选" :value="2" />
            <el-option label="判断" :value="3" />
          </el-select>
        </el-form-item>
        <el-form-item label="知识模块">
          <el-select v-model="query.module" placeholder="全部" clearable style="width: 160px" @change="reload">
            <el-option v-for="m in facets.modules" :key="m" :label="m" :value="m" />
          </el-select>
        </el-form-item>
        <el-form-item label="难度">
          <el-select v-model="query.difficulty" placeholder="全部" clearable style="width: 120px" @change="reload">
            <el-option v-for="d in [1,2,3,4,5]" :key="d" :label="'难度 ' + d" :value="d" />
          </el-select>
        </el-form-item>
        <el-form-item label="来源">
          <el-select v-model="query.source" placeholder="全部" clearable style="width: 150px" @change="reload">
            <el-option v-for="s in facets.sources" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="关键词">
          <el-input v-model="query.keyword" placeholder="题干关键词" clearable style="width: 200px" @keyup.enter="reload" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="reload">查询</el-button>
          <el-button :icon="RefreshLeft" @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div class="app-card">
      <el-table :data="list" v-loading="loading" empty-text="暂无题目" @selection-change="onSelectionChange">
        <el-table-column type="selection" width="48" />
        <el-table-column label="ID" prop="id" width="70" />
        <el-table-column label="题型" width="80" align="center">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ typeLabel(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="题干摘要" min-width="300">
          <template #default="{ row }">
            <span class="content-cell">{{ row.content.length > 50 ? row.content.slice(0, 50) + '...' : row.content }}</span>
          </template>
        </el-table-column>
        <el-table-column label="正确答案" prop="answer" width="90" align="center" />
        <el-table-column label="知识模块" prop="module" width="130" />
        <el-table-column label="难度" width="80" align="center">
          <template #default="{ row }">{{ row.difficulty }}</template>
        </el-table-column>
        <el-table-column label="来源" prop="source" width="120" show-overflow-tooltip />
        <el-table-column label="操作" width="130" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="router.push('/admin/questions/' + row.id + '/edit')">编辑</el-button>
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
import { questionApi } from '@/api';
import { QUESTION_TYPE_LABEL } from '@/utils/format';
import http from '@/api/http';

const router = useRouter();

const loading = ref(false);
const list = ref([]);
const total = ref(0);
const selection = ref([]);
const facets = reactive({ modules: [], sources: [] });

const query = reactive({ page: 1, pageSize: 20, type: null, module: null, difficulty: null, source: null, keyword: '' });

function typeLabel(t) {
  return QUESTION_TYPE_LABEL[t] || '-';
}

function onSelectionChange(rows) {
  selection.value = rows;
}

async function load() {
  loading.value = true;
  try {
    const data = await questionApi.list(query);
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
  Object.assign(query, { page: 1, type: null, module: null, difficulty: null, source: null, keyword: '' });
  load();
}

async function loadFacets() {
  try {
    const data = await questionApi.facets();
    facets.modules = data.modules || [];
    facets.sources = data.sources || [];
  } catch (e) {
    /* 拦截器已提示 */
  }
}

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm('确认删除该题目？', '删除确认', { type: 'warning' });
  } catch (e) {
    return;
  }
  try {
    await questionApi.remove(row.id);
    ElMessage.success('删除成功');
    await load();
  } catch (e) {
    /* 拦截器已提示 */
  }
}

async function handleBatchDelete() {
  const ids = selection.value.map((r) => r.id);
  try {
    await ElMessageBox.confirm('确认删除选中的 ' + ids.length + ' 道题目？', '批量删除', { type: 'warning' });
  } catch (e) {
    return;
  }
  try {
    const res = await questionApi.removeMany(ids);
    ElMessage.success('已删除 ' + res.deleted + ' 道题目' + (res.skipped?.length ? '，' + res.skipped.length + ' 道被跳过' : ''));
    await load();
  } catch (e) {
    /* 拦截器已提示 */
  }
}

async function handleExport() {
  try {
    const res = await http.get('/questions/export', { params: query, responseType: 'blob' });
    const { downloadBlob } = await import('@/utils/format');
    downloadBlob(res.data, 'questions.xlsx');
    ElMessage.success('导出成功');
  } catch (e) {
    ElMessage.error('导出失败');
  }
}

onMounted(() => {
  loadFacets();
  load();
});
</script>

<style scoped>
.filter-card {
  margin-bottom: var(--sp);
}

.filter-card :deep(.el-form-item) {
  margin-bottom: 0;
}

.content-cell {
  color: var(--c-text);
}

.pager {
  margin-top: var(--sp);
  display: flex;
  justify-content: flex-end;
}
</style>
