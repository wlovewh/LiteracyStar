<template>
  <div class="app-container">
    <div class="page-header">
      <div>
        <div class="page-title">题库检索</div>
        <div class="text-sub">共 {{ total }} 道题目，与模拟竞赛平台共用同一份题库</div>
      </div>
      <el-button v-if="total" @click="exportCsv" :loading="exporting">导出 CSV</el-button>
    </div>

    <!-- 管理员关闭检索功能时的明确提示 -->
    <el-alert
      v-if="!searchEnabled"
      title="题库检索功能当前未开放"
      description="管理员已在后台关闭题库检索，请联系管理员开启后再使用。"
      type="warning"
      :closable="false"
      show-icon
      class="closed-alert"
    />

    <!-- 检索条件 -->
    <div v-show="searchEnabled" class="app-card filter-card">
      <el-form inline>
        <el-form-item label="题干关键词">
          <el-input
            v-model="query.keyword"
            placeholder="输入关键词，自动检索"
            clearable
            style="width: 260px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="知识模块">
          <el-select v-model="query.module" placeholder="全部模块" clearable style="width: 180px">
            <el-option v-for="m in facets.modules" :key="m" :label="m" :value="m" />
          </el-select>
        </el-form-item>
        <el-form-item label="题型">
          <el-select v-model="query.type" placeholder="全部题型" clearable style="width: 140px">
            <el-option v-for="t in facets.types" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="难度">
          <el-select v-model="query.difficulty" placeholder="全部难度" clearable style="width: 140px">
            <el-option v-for="d in facets.difficulties" :key="d" :label="'难度 ' + d" :value="d" />
          </el-select>
        </el-form-item>
        <el-form-item label="来源">
          <el-select v-model="query.source" placeholder="全部来源" clearable style="width: 160px">
            <el-option v-for="s in facets.sources" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <!-- 结果列表 -->
    <div v-loading="loading">
      <div v-if="list.length" class="question-list">
        <div v-for="q in list" :key="q.id" class="app-card question-item">
          <div class="q-head">
            <el-tag size="small" effect="plain">{{ q.typeLabel }}</el-tag>
            <el-tag size="small" type="info" effect="plain">难度 {{ q.difficulty }}</el-tag>
            <el-tag v-if="q.module" size="small" type="info" effect="plain">{{ q.module }}</el-tag>
            <span v-if="q.source" class="text-sub">来源：{{ q.source }}</span>
            <span class="q-id text-sub">#{{ q.id }}</span>
          </div>

          <div class="q-content">{{ q.content }}</div>

          <div v-if="q.options.length" class="q-options">
            <div v-for="o in q.options" :key="o.letter" class="q-option">
              <span class="opt-letter">{{ o.letter }}</span>
              <span class="opt-text">{{ o.text }}</span>
            </div>
          </div>

          <div class="q-answer">
            <span class="answer-label">正确答案</span>
            <span class="answer-value">{{ q.answer }}</span>
          </div>

          <div v-if="q.analysis" class="q-analysis">
            <span class="analysis-label">解析</span>
            <span>{{ q.analysis }}</span>
          </div>

          <div v-if="auth.isLoggedIn" class="q-actions">
            <el-button link type="primary" size="small" @click="sendToChat(q)">发送到聊天室</el-button>
          </div>
        </div>
      </div>
      <el-empty v-else-if="!loading && searchEnabled" description="没有找到匹配的题目" />
    </div>

    <AppPager
      v-if="searchEnabled"
      v-model:page="query.page"
      v-model:page-size="query.pageSize"
      :total="total"
      @update:page="load"
      @update:page-size="handleSearch"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { questionApi } from '@/api';
import { useAuthStore } from '@/stores/auth';
import AppPager from '@/components/AppPager.vue';

const router = useRouter();
const auth = useAuthStore();

const list = ref([]);
const total = ref(0);
const loading = ref(false);
const exporting = ref(false);

const query = ref({ keyword: '', module: '', type: null, difficulty: null, source: '', page: 1, pageSize: 10 });
const facets = ref({ modules: [], sources: [], types: [], difficulties: [1, 2, 3, 4, 5] });

async function loadFacets() {
  try {
    facets.value = await questionApi.facets();
  } catch (e) {
    /* 错误已提示 */
  }
}

/** 检索开关：管理员可在后台关闭题库检索，关闭时给出明确提示而非报错 */
const searchEnabled = ref(true);

async function loadSettings() {
  try {
    const s = await questionApi.getSettings();
    searchEnabled.value = !(s && s.searchEnabled === false);
  } catch (e) {
    /* 读取失败时按开放处理，避免误挡用户 */
  }
}

async function load() {
  if (!searchEnabled.value) return;
  loading.value = true;
  try {
    const data = await questionApi.search({
      keyword: query.value.keyword || undefined,
      module: query.value.module || undefined,
      type: query.value.type || undefined,
      difficulty: query.value.difficulty || undefined,
      source: query.value.source || undefined,
      page: query.value.page,
      pageSize: query.value.pageSize
    });
    list.value = data.list;
    total.value = data.total;
  } catch (e) {
    // 403 表示管理员关闭了检索功能：拦截器已弹提示，这里同步切换到「未开放」状态
    if (e && e.response && e.response.status === 403) searchEnabled.value = false;
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  query.value.page = 1;
  load();
}

/**
 * 输入即搜：关键词变化后 350ms 自动查询，无需手动点「查询」。
 * 回车/点击「查询」仍可立即触发（会取消待执行的防抖）。
 */
let searchTimer = null;
function scheduleSearch() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    searchTimer = null;
    handleSearch();
  }, 350);
}

watch(() => query.value.keyword, scheduleSearch);
watch(() => [query.value.module, query.value.type, query.value.difficulty, query.value.source], () => {
  if (searchTimer) clearTimeout(searchTimer);
  handleSearch();
});

function handleReset() {
  query.value = { keyword: '', module: '', type: null, difficulty: null, source: '', page: 1, pageSize: query.value.pageSize };
  load();
}

async function exportCsv() {
  exporting.value = true;
  try {
    const res = await questionApi.exportCsv({
      keyword: query.value.keyword || undefined,
      module: query.value.module || undefined,
      type: query.value.type || undefined,
      difficulty: query.value.difficulty || undefined,
      source: query.value.source || undefined
    });
    const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '题库导出-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    ElMessage.success('导出成功');
  } catch (e) {
    ElMessage.error('导出失败');
  } finally {
    exporting.value = false;
  }
}

/** 把题目带到聊天室，便于团队讨论 (7.3) */
function sendToChat(q) {
  router.push({ path: '/chat', query: { questionId: q.id } });
}

onMounted(async () => {
  await loadSettings();
  loadFacets();
  load();
});
</script>

<style scoped>
.closed-alert { margin-bottom: var(--sp-mid); }
.question-list { display: flex; flex-direction: column; gap: var(--sp-mid); }
.question-item { padding: var(--sp-mid) var(--sp-card); }
.q-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.q-id { margin-left: auto; }
.q-content { font-size: var(--f-base); font-weight: 500; line-height: 1.7; margin-bottom: 12px; white-space: pre-wrap; }
.q-options { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.q-option { display: flex; gap: 10px; font-size: var(--f-sm); line-height: 1.7; }
.opt-letter {
  flex: 0 0 22px; height: 22px; line-height: 22px; text-align: center;
  background: var(--c-selected); color: var(--c-primary);
  border-radius: var(--r-tag); font-weight: 600; font-size: var(--f-xs);
}
.opt-text { flex: 1; }
.q-answer { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.answer-label { font-size: var(--f-xs); color: var(--c-text-sub); }
.answer-value {
  background: var(--c-primary-2); color: #fff; font-weight: 600;
  padding: 2px 10px; border-radius: var(--r-tag); font-size: var(--f-sm);
}
.q-analysis {
  display: flex; gap: 10px; font-size: var(--f-sm); line-height: 1.7;
  background: var(--c-bg); border-radius: var(--r-btn); padding: 10px 12px;
}
.analysis-label { color: var(--c-text-sub); font-size: var(--f-xs); white-space: nowrap; padding-top: 2px; }
.q-actions { margin-top: 10px; }
</style>
