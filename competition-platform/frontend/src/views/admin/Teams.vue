<template>
  <div>
    <div class="page-header">
      <h2 class="page-title">队伍管理</h2>
      <div class="toolbar">
        <el-button :icon="Upload" @click="router.push('/admin/teams/import')">批量导入</el-button>
        <el-button :icon="Download" @click="handleExport">导出</el-button>
        <el-button :icon="RefreshLeft" :disabled="!selection.length" @click="openClearDialog(selection)">清空选中答题</el-button>
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
            <el-button link type="primary" @click="openClearDialog([row])">清空答题</el-button>
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

    <!-- 清空答题数据：可选择环节，支持批量 -->
    <el-dialog v-model="clearDialog" title="清空答题数据" width="560px">
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="此操作不可撤销"
        description="将删除所选队伍的答题记录、成绩、抽题快照与排行榜缓存，清空后这些队伍可重新作答。"
        style="margin-bottom: 16px"
      />

      <div class="clear-targets">
        <span class="text-sub">清空对象（{{ clearTargets.length }} 支队伍）：</span>
        <span class="clear-target-names">{{ clearTargetNames }}</span>
      </div>

      <el-form label-width="90px" style="margin-top: 16px">
        <el-form-item label="清空范围">
          <el-radio-group v-model="clearMode">
            <el-radio label="stage">指定环节</el-radio>
            <el-radio label="all">全部环节</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item v-if="clearMode === 'stage'" label="选择环节">
          <el-select
            v-model="clearStageIds"
            multiple
            collapse-tags
            collapse-tags-tooltip
            placeholder="可多选，不选则无法提交"
            style="width: 100%"
          >
            <el-option
              v-for="s in allStages"
              :key="s.id"
              :label="s.eventName + ' / ' + s.name"
              :value="s.id"
            />
          </el-select>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="clearDialog = false">取消</el-button>
        <el-button type="danger" :loading="clearing" @click="doClear">确认清空</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
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

// ---------------- 清空答题数据（可选环节 + 批量） ----------------

const clearDialog = ref(false);
const clearing = ref(false);
const clearTargets = ref([]);   // 待清空的队伍列表
const clearMode = ref('stage'); // stage = 指定环节，all = 全部环节
const clearStageIds = ref([]);  // 多选的环节 id
const allStages = ref([]);      // 全部环节（含所属赛事名，便于区分同名环节）

const clearTargetNames = computed(() =>
  clearTargets.value.map((t) => t.name).join('、') || '-'
);

/** 打开清空弹窗：一次性载入可选环节 */
async function openClearDialog(rows) {
  const targets = (rows || []).filter(Boolean);
  if (!targets.length) return;
  clearTargets.value = targets;
  clearMode.value = 'stage';
  clearStageIds.value = [];

  if (!allStages.value.length) {
    try {
      const list = await http.get('/stages/options');
      allStages.value = Array.isArray(list) ? list : [];
    } catch (e) {
      /* 拦截器已提示 */
    }
  }
  clearDialog.value = true;
}

/** 执行清空：按选择的范围逐支队伍清空，最后汇总提示 */
async function doClear() {
  const ids = clearTargets.value.map((t) => t.id);
  if (!ids.length) return;

  let stageIds = [null];
  if (clearMode.value === 'stage') {
    if (!clearStageIds.value.length) return ElMessage.warning('请至少选择一个环节');
    stageIds = clearStageIds.value.slice();
  }

  const scopeText = clearMode.value === 'all'
    ? '全部环节'
    : '所选 ' + stageIds.length + ' 个环节';

  try {
    await ElMessageBox.confirm(
      '将清空 ' + ids.length + ' 支队伍的「' + scopeText + '」答题数据，此操作不可撤销，确定继续吗？',
      '再次确认',
      { type: 'warning', confirmButtonText: '确认清空', cancelButtonText: '取消' }
    );
  } catch (e) {
    return;
  }

  clearing.value = true;
  const total = { answers: 0, scores: 0, cheatCleared: 0, papers: 0 };
  try {
    for (const teamId of ids) {
      for (const sid of stageIds) {
        const res = await teamApi.clearAnswers(teamId, sid === null ? undefined : sid);
        total.answers += Number(res.answers || 0);
        total.scores += Number(res.scores || 0);
        total.cheatCleared += Number(res.cheatCleared || 0);
        total.papers += Number(res.papers || 0);
      }
    }
    ElMessage.success(
      '已清空 ' + ids.length + ' 支队伍：答题 ' + total.answers + ' 条、成绩 ' + total.scores +
      ' 条、抽题快照 ' + total.papers + ' 条、预警 ' + total.cheatCleared + ' 条'
    );
    clearDialog.value = false;
    await load();
  } catch (e) {
    /* 拦截器已提示 */
  } finally {
    clearing.value = false;
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

.filter-card :deep(.el-form) {
  row-gap: 12px;
}

.filter-card :deep(.el-form-item) {
  margin-bottom: 0;
  margin-right: 20px;
}

/* 查询/重置按钮与筛选项并排，不再单独换行，并保持与标签左对齐 */
.filter-card :deep(.el-form-item:last-child) {
  margin-right: 0;
}

.filter-card :deep(.el-form-item:last-child .el-form-item__content) {
  gap: 12px;
}

.pager {
  margin-top: var(--sp);
  display: flex;
  justify-content: flex-end;
}
</style>
