<template>
  <div>
    <!-- 检索与操作 -->
    <div class="app-card filter-card">
      <el-form inline>
        <el-form-item label="题干关键词">
          <el-input v-model="query.keyword" placeholder="输入题干关键词" clearable style="width: 220px" @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item label="题型">
          <el-select v-model="query.type" placeholder="全部题型" clearable style="width: 130px">
            <el-option label="单选" :value="1" />
            <el-option label="多选" :value="2" />
            <el-option label="判断" :value="3" />
          </el-select>
        </el-form-item>
        <el-form-item label="知识模块">
          <el-select v-model="query.module" placeholder="全部模块" clearable style="width: 160px">
            <el-option v-for="m in facets.modules" :key="m" :label="m" :value="m" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div class="app-card">
      <div class="panel-head">
        <span class="panel-title">题库管理 <span class="text-sub">（共 {{ total }} 题，与模拟竞赛平台共用）</span></span>
        <div class="panel-actions">
          <el-button v-if="selection.length" type="danger" plain @click="batchRemove">删除选中（{{ selection.length }}）</el-button>
          <el-button @click="downloadTemplate">下载模板</el-button>
          <el-button @click="importDialog = true">批量导入</el-button>
          <el-button type="primary" @click="openDialog()">新增题目</el-button>
        </div>
      </div>

      <el-table
        v-loading="loading"
        :data="list"
        stripe
        style="width: 100%"
        @selection-change="(v) => (selection = v)"
      >
        <el-table-column type="selection" width="46" />
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column label="题型" width="80">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ row.typeLabel }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="content" label="题干" min-width="260" show-overflow-tooltip />
        <el-table-column label="选项" width="90">
          <template #default="{ row }">
            <span class="text-sub">{{ row.options.length }} 项</span>
          </template>
        </el-table-column>
        <el-table-column label="答案" width="80">
          <template #default="{ row }">
            <span class="answer-pill">{{ row.answer }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="module" label="知识模块" width="130" show-overflow-tooltip />
        <el-table-column prop="difficulty" label="难度" width="70" />
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openDialog(row)">编辑</el-button>
            <el-button link type="danger" size="small" @click="removeOne(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <AppPager
        v-model:page="query.page"
        v-model:page-size="query.pageSize"
        :total="total"
        @update:page="load"
        @update:page-size="handleSearch"
      />
    </div>

    <!-- 编辑弹窗 -->
    <el-dialog v-model="dialog" :title="form.id ? '编辑题目' : '新增题目'" width="640px" top="6vh">
      <el-form :model="form" label-width="90px">
        <el-form-item label="题型" required>
          <el-radio-group v-model="form.type">
            <el-radio :value="1">单选</el-radio>
            <el-radio :value="2">多选</el-radio>
            <el-radio :value="3">判断</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="题干" required>
          <el-input v-model="form.content" type="textarea" :rows="3" placeholder="请输入题干内容" />
        </el-form-item>

        <el-form-item label="选项">
          <div class="opt-editor">
            <div v-for="opt in form.options" :key="opt.letter" class="opt-row">
              <span class="opt-letter">{{ opt.letter }}</span>
              <el-input v-model="opt.text" :placeholder="'选项 ' + opt.letter" />
              <el-button
                v-if="form.options.length > 2"
                link
                type="danger"
                size="small"
                @click="removeOption(opt.letter)"
              >
                删除
              </el-button>
            </div>
            <el-button v-if="form.options.length < 6" size="small" @click="addOption">添加选项</el-button>
            <div class="text-sub">判断题可只保留 A / B 两个选项</div>
          </div>
        </el-form-item>

        <el-form-item label="正确答案" required>
          <el-input v-model="form.answer" placeholder="例如 A 或 ABCD" style="width: 180px" />
        </el-form-item>
        <el-form-item label="解析">
          <el-input v-model="form.analysis" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="知识模块">
          <el-input v-model="form.module" placeholder="例如：信息检索技术" />
        </el-form-item>
        <el-form-item label="难度">
          <el-input-number v-model="form.difficulty" :min="1" :max="5" />
        </el-form-item>
        <el-form-item label="来源">
          <el-input v-model="form.source" />
        </el-form-item>
        <el-form-item label="标签">
          <el-input v-model="form.tags" placeholder="多个标签用逗号分隔" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <!-- 批量导入弹窗 -->
    <el-dialog v-model="importDialog" title="批量导入题目" width="640px">
      <el-alert type="info" :closable="false" style="margin-bottom: 16px">
        <template #title>
          支持 CSV / Excel 文件，或直接粘贴 JSON 行数组。列顺序请参照模板：
          题型、题干、选项A-F、正确答案、解析、知识模块、难度、来源、标签。
        </template>
      </el-alert>

      <el-tabs v-model="importMode">
        <el-tab-pane label="上传文件" name="file">
          <input
            ref="importInput"
            type="file"
            accept=".csv,.xlsx,.xls"
            style="display: none"
            @change="onImportFile"
          />
          <el-button type="primary" @click="importInput && importInput.click()">选择文件</el-button>
          <span v-if="importFile" class="text-sub" style="margin-left: 12px">{{ importFile.name }}</span>
        </el-tab-pane>
        <el-tab-pane label="粘贴 JSON" name="json">
          <el-input
            v-model="importJson"
            type="textarea"
            :rows="8"
            placeholder='[{"type":1,"content":"题干","options":[{"letter":"A","text":"选项A"}],"answer":"A"}]'
          />
        </el-tab-pane>
      </el-tabs>

      <el-checkbox v-model="skipDuplicate" style="margin-top: 12px">跳过题干重复的题目</el-checkbox>

      <div v-if="importResult" class="import-result">
        <div>共 {{ importResult.total }} 行：成功 <b>{{ importResult.inserted }}</b>，
          跳过 {{ importResult.skipped }}，失败 {{ importResult.failed }}</div>
        <ul v-if="importResult.errors && importResult.errors.length">
          <li v-for="e in importResult.errors" :key="e.line">第 {{ e.line }} 行：{{ e.message }}</li>
        </ul>
      </div>

      <template #footer>
        <el-button @click="closeImport">关闭</el-button>
        <el-button type="primary" :loading="importing" @click="doImport">开始导入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { questionApi } from '@/api';
import AppPager from '@/components/AppPager.vue';

const emit = defineEmits(['changed']);

const list = ref([]);
const total = ref(0);
const loading = ref(false);
const saving = ref(false);
const selection = ref([]);
const facets = ref({ modules: [] });

const query = ref({ keyword: '', type: null, module: '', page: 1, pageSize: 10 });

const dialog = ref(false);
const form = ref(emptyForm());

const importDialog = ref(false);
const importMode = ref('file');
const importFile = ref(null);
const importJson = ref('');
const skipDuplicate = ref(true);
const importing = ref(false);
const importResult = ref(null);
const importInput = ref(null);

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function emptyForm() {
  return {
    id: null, type: 1, content: '',
    options: [{ letter: 'A', text: '' }, { letter: 'B', text: '' }],
    answer: '', analysis: '', module: '', difficulty: 3, source: '', tags: ''
  };
}

async function loadFacets() {
  try {
    facets.value = await questionApi.facets();
  } catch (e) { /* 错误已提示 */ }
}

async function load() {
  loading.value = true;
  try {
    const data = await questionApi.search({
      keyword: query.value.keyword || undefined,
      type: query.value.type || undefined,
      module: query.value.module || undefined,
      page: query.value.page,
      pageSize: query.value.pageSize
    });
    list.value = data.list;
    total.value = data.total;
  } catch (e) { /* 错误已提示 */ } finally {
    loading.value = false;
  }
}

function handleSearch() {
  query.value.page = 1;
  load();
}

function handleReset() {
  query.value = { keyword: '', type: null, module: '', page: 1, pageSize: query.value.pageSize };
  load();
}

function openDialog(row) {
  if (row) {
    form.value = {
      id: row.id, type: row.type, content: row.content,
      options: row.options.length ? row.options.map((o) => ({ ...o })) : [{ letter: 'A', text: '' }, { letter: 'B', text: '' }],
      answer: row.answer, analysis: row.analysis, module: row.module,
      difficulty: row.difficulty, source: row.source, tags: row.tags
    };
  } else {
    form.value = emptyForm();
  }
  dialog.value = true;
}

function addOption() {
  const used = form.value.options.map((o) => o.letter);
  const next = LETTERS.find((l) => !used.includes(l));
  if (next) form.value.options.push({ letter: next, text: '' });
}

function removeOption(letter) {
  form.value.options = form.value.options.filter((o) => o.letter !== letter);
}

async function save() {
  if (!form.value.content.trim()) return ElMessage.warning('请填写题干');
  if (!form.value.answer.trim()) return ElMessage.warning('请填写正确答案');

  saving.value = true;
  try {
    const payload = {
      type: form.value.type,
      content: form.value.content,
      options: form.value.options.filter((o) => o.text.trim() !== ''),
      answer: form.value.answer.trim().toUpperCase(),
      analysis: form.value.analysis,
      module: form.value.module,
      difficulty: form.value.difficulty,
      source: form.value.source,
      tags: form.value.tags
    };
    if (form.value.id) await questionApi.update(form.value.id, payload);
    else await questionApi.create(payload);
    ElMessage.success('保存成功');
    dialog.value = false;
    await Promise.all([load(), loadFacets()]);
    emit('changed');
  } catch (e) { /* 错误已提示 */ } finally {
    saving.value = false;
  }
}

async function removeOne(row) {
  try {
    await ElMessageBox.confirm('确定删除题目 #' + row.id + ' 吗？', '删除确认', { type: 'warning' });
  } catch (e) { return; }
  try {
    await questionApi.remove(row.id);
    ElMessage.success('已删除');
    await load();
    emit('changed');
  } catch (e) { /* 错误已提示 */ }
}

async function batchRemove() {
  try {
    await ElMessageBox.confirm('确定删除选中的 ' + selection.value.length + ' 道题目吗？', '批量删除确认', { type: 'warning' });
  } catch (e) { return; }
  try {
    const r = await questionApi.batchRemove(selection.value.map((q) => q.id));
    ElMessage.success('已删除 ' + r.deleted + ' 道题目');
    await load();
    emit('changed');
  } catch (e) { /* 错误已提示 */ }
}

function downloadTemplate() {
  const headers = ['题型', '题干', '选项A', '选项B', '选项C', '选项D', '选项E', '选项F', '正确答案', '解析', '知识模块', '难度', '来源', '标签'];
  const sample = [
    [1, '人工智能领域中，GPT 中的 G 代表？', 'Generative', 'General', 'Global', 'Graph', '', '', 'A', 'GPT 全称 Generative Pre-trained Transformer。', '人工智能', 2, '示例题库', 'AI'],
    [3, '信息素养只需要掌握检索技能即可。', '', '', '', '', '', '', 'B', '信息素养包含信息意识、知识、能力与伦理。', '信息素养基础', 1, '示例题库', '判断题']
  ];
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const csv = '\ufeff' + [headers.join(','), ...sample.map((r) => r.map(esc).join(','))].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '题库导入模板.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  ElMessage.success('模板已下载');
}

function onImportFile(ev) {
  importFile.value = ev.target.files && ev.target.files[0];
}

async function doImport() {
  importing.value = true;
  importResult.value = null;
  try {
    if (importMode.value === 'file') {
      if (!importFile.value) {
        ElMessage.warning('请先选择文件');
        return;
      }
      importResult.value = await questionApi.importFile(importFile.value, skipDuplicate.value);
    } else {
      let rows;
      try {
        rows = JSON.parse(importJson.value);
      } catch (e) {
        return ElMessage.error('JSON 格式有误，请检查');
      }
      if (!Array.isArray(rows)) return ElMessage.error('JSON 需为数组');
      importResult.value = await questionApi.importRows(rows, skipDuplicate.value);
    }
    ElMessage.success('导入完成');
    await Promise.all([load(), loadFacets()]);
    emit('changed');
  } catch (e) { /* 错误已提示 */ } finally {
    importing.value = false;
  }
}

function closeImport() {
  importDialog.value = false;
  importFile.value = null;
  importJson.value = '';
  importResult.value = null;
}

onMounted(() => {
  loadFacets();
  load();
});
</script>

<style scoped>
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.panel-title { font-size: var(--f-base); font-weight: 600; color: var(--c-primary); }
.panel-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

.answer-pill {
  display: inline-block;
  background: var(--c-primary-2);
  color: #fff;
  font-size: var(--f-xs);
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--r-tag);
}

.opt-editor { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.opt-row { display: flex; align-items: center; gap: 8px; }

.opt-letter {
  flex: 0 0 24px;
  height: 24px;
  line-height: 24px;
  text-align: center;
  background: var(--c-selected);
  color: var(--c-primary);
  border-radius: var(--r-tag);
  font-size: var(--f-xs);
  font-weight: 600;
}

.import-result {
  margin-top: 16px;
  padding: 12px;
  background: var(--c-bg);
  border-radius: var(--r-btn);
  font-size: var(--f-sm);
  line-height: 1.9;
}

.import-result ul { margin: 6px 0 0; padding-left: 20px; color: var(--c-danger); }
</style>
