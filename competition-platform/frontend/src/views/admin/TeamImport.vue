<template>
  <div>
    <div class="page-header">
      <h2 class="page-title">批量导入队伍</h2>
      <el-button :icon="ArrowLeft" @click="router.push('/admin/teams')">返回列表</el-button>
    </div>

    <el-alert type="info" :closable="false" show-icon class="tip-alert" title="导入说明">
      <ul class="rule-list">
        <li v-for="(r, i) in rules" :key="i">{{ r }}</li>
      </ul>
    </el-alert>

    <div class="app-card">
      <h3 class="section-title">第一步：下载导入模板</h3>
      <p class="text-sub">模板包含标准表头与示例数据，请勿修改表头名称。</p>
      <el-button :icon="Download" :loading="downloading" @click="downloadTemplate">下载模板</el-button>
    </div>

    <div class="app-card">
      <h3 class="section-title">第二步：上传文件</h3>
      <el-upload
        drag
        :auto-upload="false"
        :show-file-list="true"
        :limit="1"
        accept=".xlsx,.xls,.csv"
        :on-change="onFileChange"
        :on-exceed="onExceed"
      >
        <el-icon class="upload-icon"><UploadFilled /></el-icon>
        <div class="upload-text">将 Excel / CSV 文件拖到此处，或<em>点击选择文件</em></div>
        <div class="text-sub">支持 .xlsx / .xls / .csv，文件不超过 10MB</div>
      </el-upload>

      <div class="upload-actions">
        <el-button type="primary" :icon="Upload" :loading="importing" :disabled="!file" @click="handleImport">开始导入</el-button>
        <el-button :icon="Delete" :disabled="!file" @click="clearFile">清除</el-button>
      </div>
    </div>

    <div class="app-card">
      <h3 class="section-title">第三步：查看导入结果</h3>
      <el-empty v-if="!result" description="尚未执行导入" />

      <template v-else>
        <div class="result-stats">
          <div class="result-item">
            <span class="stat-value">{{ result.total }}</span>
            <span class="stat-label">总行数</span>
          </div>
          <div class="result-item">
            <span class="stat-value success-text">{{ result.success }}</span>
            <span class="stat-label">成功</span>
          </div>
          <div class="result-item">
            <span class="stat-value fail-text">{{ result.failed }}</span>
            <span class="stat-label">失败</span>
          </div>
        </div>

        <el-table v-if="result.errors && result.errors.length" :data="result.errors" size="small" max-height="320" class="error-table">
          <el-table-column label="行号" prop="row" width="90" align="center" />
          <el-table-column label="失败原因" prop="reason" min-width="300" />
        </el-table>
        <el-alert v-else type="success" :closable="false" show-icon title="全部数据导入成功" class="ok-alert" />
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ArrowLeft, Download, Upload, UploadFilled, Delete } from '@element-plus/icons-vue';
import { teamApi } from '@/api';
import http from '@/api/http';
import { downloadBlob, filenameFromHeaders } from '@/utils/format';

const router = useRouter();

const downloading = ref(false);

const rules = [
  "带 * 的列为必填项",
  "导入后自动为每个学号创建账号，密码默认与学号相同",
  "队长可见全部环节，队员默认仅可见个人环节",
  "学号不能与已有队伍重复",
  "同一队伍内学号不能重复"
];

const file = ref(null);
const importing = ref(false);
const result = ref(null);

function onFileChange(uploadFile) {
  file.value = uploadFile.raw;
  result.value = null;
}

function onExceed(files) {
  file.value = files[0];
  result.value = null;
}

function clearFile() {
  file.value = null;
  result.value = null;
}

async function downloadTemplate() {
  // 必须通过带 Authorization 头的请求下载（window.open 无法携带令牌）
  downloading.value = true;
  try {
    const res = await http.get('/teams/import/template', { responseType: 'blob' });
    downloadBlob(res.data, filenameFromHeaders(res.headers, 'team-import-template.xlsx'));
    ElMessage.success('模板已开始下载');
  } catch (e) {
    ElMessage.error('模板下载失败，请重试');
  } finally {
    downloading.value = false;
  }
}

async function handleImport() {
  if (!file.value) {
    ElMessage.warning('请先选择文件');
    return;
  }
  importing.value = true;
  try {
    result.value = await teamApi.importFile(file.value);
    if (result.value.failed === 0) ElMessage.success('导入成功，共 ' + result.value.success + ' 条');
    else ElMessage.warning('导入完成：成功 ' + result.value.success + ' 条，失败 ' + result.value.failed + ' 条');
  } catch (e) {
    /* 拦截器已提示 */
  } finally {
    importing.value = false;
  }
}
</script>

<style scoped>
.tip-alert {
  margin-bottom: var(--sp);
  border-radius: var(--r-btn);
}

.rule-list {
  margin: 6px 0 0;
  padding-left: 18px;
  line-height: 1.9;
}

.section-title {
  font-size: 16px;
  color: var(--c-primary);
  margin: 0 0 12px;
}

.app-card {
  margin-bottom: var(--sp);
}

.upload-icon {
  font-size: 46px;
  color: var(--c-primary-2);
  margin-bottom: 10px;
}

.upload-text {
  color: var(--c-text);
}

.upload-text em {
  color: var(--c-primary-2);
  font-style: normal;
}

.upload-actions {
  margin-top: var(--sp);
  display: flex;
  gap: var(--sp-tight);
}

.result-stats {
  display: flex;
  gap: 48px;
  margin-bottom: var(--sp);
}

.result-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.success-text {
  color: var(--c-primary-2);
}

.fail-text {
  color: var(--c-danger);
}

.error-table {
  margin-top: var(--sp-tight);
}

.ok-alert {
  border-radius: var(--r-btn);
}
</style>
