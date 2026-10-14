<template>
  <div class="app-container">
    <div class="page-header">
      <div>
        <div class="page-title">管理后台</div>
        <div class="text-sub">密钥管理 · 资源维护 · 聊天室配置 · 数据统计</div>
      </div>
    </div>

    <el-tabs v-model="tab">
      <!-- ============ 数据统计 ============ -->
      <el-tab-pane label="数据统计" name="dashboard">
        <div class="stat-grid">
          <div v-for="s in statCards" :key="s.label" class="app-card stat-card">
            <div class="stat-value">{{ s.value }}</div>
            <div class="stat-label">{{ s.label }}</div>
          </div>
        </div>

        <div class="chart-row">
          <div class="app-card">
            <div class="chart-title">资源分类分布</div>
            <div ref="catChart" class="chart-box"></div>
          </div>
          <div class="app-card">
            <div class="chart-title">近 7 天消息量</div>
            <div ref="trendChart" class="chart-box"></div>
          </div>
        </div>

        <div class="app-card" style="margin-top: var(--sp)">
          <div class="chart-title">访问量 Top 10 网站</div>
          <el-table :data="stats.topSites" stripe style="width: 100%">
            <el-table-column type="index" label="排名" width="70" />
            <el-table-column prop="name" label="网站名称" min-width="180" />
            <el-table-column prop="categoryName" label="分类" width="160" />
            <el-table-column prop="visitCount" label="访问次数" width="110" />
            <el-table-column label="网址" min-width="240">
              <template #default="{ row }">
                <a :href="row.url" target="_blank" rel="noopener">{{ row.url }}</a>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <!-- ============ 密钥管理 ============ -->
      <el-tab-pane label="密钥管理" name="keys">
        <div class="app-card filter-card">
          <el-form inline>
            <el-form-item label="关键词">
              <el-input v-model="keyQuery.keyword" placeholder="密钥值 / 备注" clearable style="width: 220px" @keyup.enter="loadKeys" />
            </el-form-item>
            <el-form-item label="类型">
              <el-select v-model="keyQuery.keyType" placeholder="全部类型" clearable style="width: 160px">
                <el-option label="管理员" :value="1" />
                <el-option label="用户" :value="2" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="loadKeys">查询</el-button>
              <el-button @click="resetKeyQuery">重置</el-button>
            </el-form-item>
          </el-form>
        </div>

        <div class="app-card">
          <div class="page-header">
            <div class="page-title" style="font-size: var(--f-base)">访问密钥（共 {{ keyTotal }} 个）</div>
            <el-button type="primary" @click="openKeyDialog()">新增密钥</el-button>
          </div>

          <el-table v-loading="keyLoading" :data="keys" stripe style="width: 100%">
            <el-table-column prop="key_value" label="密钥值" min-width="200" />
            <el-table-column label="类型" width="110">
              <template #default="{ row }">
                <el-tag :type="row.key_type === 1 ? 'primary' : 'info'" effect="plain" size="small">
                  {{ row.key_type === 1 ? '管理员' : '用户' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="remark" label="备注" min-width="180" />
            <el-table-column label="有效期" width="170">
              <template #default="{ row }">
                <span v-if="row.expires_at">{{ formatDate(row.expires_at) }}</span>
                <span v-else class="text-sub">永久</span>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.status === 1 ? 'primary' : 'info'" effect="plain" size="small">
                  {{ row.status === 1 ? '启用' : '禁用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="200">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="copyKey(row)">复制</el-button>
                <el-button link type="primary" size="small" @click="openKeyDialog(row)">编辑</el-button>
                <el-button link type="danger" size="small" @click="removeKey(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>

          <AppPager
            v-model:page="keyQuery.page"
            v-model:page-size="keyQuery.pageSize"
            :total="keyTotal"
            @update:page="loadKeys"
            @update:page-size="loadKeys"
          />
        </div>
      </el-tab-pane>

      <!-- ============ 资源管理 ============ -->
      <el-tab-pane label="资源管理" name="resources">
        <ResourceManage @changed="loadDashboard" />
      </el-tab-pane>

      <!-- ============ 题库管理 ============ -->
      <el-tab-pane label="题库管理" name="questions">
        <QuestionManage @changed="loadDashboard" />
      </el-tab-pane>

      <!-- ============ 聊天室配置 ============ -->
      <el-tab-pane label="聊天室配置" name="rooms">
        <div class="app-card">
          <div class="page-header">
            <div class="page-title" style="font-size: var(--f-base)">聊天室列表（共 {{ rooms.length }} 个）</div>
            <el-button @click="purgeMessages">清理过期消息</el-button>
          </div>
          <el-table :data="rooms" stripe style="width: 100%">
            <el-table-column prop="id" label="ID" width="70" />
            <el-table-column prop="name" label="名称" min-width="180" />
            <el-table-column prop="invite_code" label="邀请码" width="110" />
            <el-table-column prop="max_members" label="人数上限" width="100" />
            <el-table-column prop="retention_days" label="保留天数" width="100">
              <template #default="{ row }">
                {{ row.retention_days > 0 ? row.retention_days + ' 天' : '永久' }}
              </template>
            </el-table-column>
            <el-table-column prop="message_count" label="消息数" width="90" />
            <el-table-column label="操作" width="200">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="openRoomDialog(row)">配置</el-button>
                <el-button link type="danger" size="small" @click="clearRoom(row)">清空消息</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div class="app-card" style="margin-top: var(--sp)">
          <div class="page-header">
            <div class="page-title" style="font-size: var(--f-base)">快速短语（共 {{ phrases.length }} 条）</div>
            <el-button type="primary" @click="openPhraseDialog()">新增短语</el-button>
          </div>
          <el-table :data="phrases" stripe style="width: 100%">
            <el-table-column prop="content" label="短语内容" min-width="200" />
            <el-table-column prop="sort_order" label="排序" width="90" />
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.status === 1 ? 'primary' : 'info'" effect="plain" size="small">
                  {{ row.status === 1 ? '启用' : '禁用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="160">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="openPhraseDialog(row)">编辑</el-button>
                <el-button link type="danger" size="small" @click="removePhrase(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <!-- ============ 平台设置 ============ -->
      <el-tab-pane label="平台设置" name="settings">
        <div class="app-card" style="max-width: 640px">
          <el-form label-width="180px">
            <el-form-item label="开放题库检索">
              <el-switch v-model="searchEnabled" :active-value="true" :inactive-value="false" />
            </el-form-item>
            <div class="text-sub" style="padding-left: 180px; margin-bottom: 20px; line-height: 1.7">
              关闭后，未使用密钥登录的访客将无法检索题库；管理员与已登录用户不受影响。
            </div>
            <el-form-item>
              <el-button type="primary" :loading="savingSettings" @click="saveSettings">保存设置</el-button>
            </el-form-item>
          </el-form>
        </div>

        <!-- 数据库备份 -->
        <div class="app-card" style="max-width: 900px; margin-top: 16px">
          <div class="card-head">
            <span class="card-title">数据库备份</span>
            <div>
              <el-button :loading="backupRunning" @click="runBackupNow">立即备份</el-button>
              <el-button
                type="danger"
                plain
                :disabled="!backupSelected.length"
                @click="removeSelectedBackups"
              >删除选中（{{ backupSelected.length }}）</el-button>
            </div>
          </div>

          <el-form label-width="180px" style="margin-top: 12px">
            <el-form-item label="启用定时备份">
              <el-switch v-model="backupForm.enabled" :active-value="true" :inactive-value="false" />
            </el-form-item>
            <el-form-item label="每天备份时间">
              <el-time-select
                v-model="backupTime"
                start="00:00"
                step="00:30"
                end="23:30"
                placeholder="选择时间"
                :disabled="!backupForm.enabled"
                style="width: 160px"
              />
              <span class="text-sub" style="margin-left: 12px">按服务器时间执行</span>
            </el-form-item>
            <el-form-item label="保留份数">
              <el-input-number v-model="backupForm.keep" :min="1" :max="90" />
              <span class="text-sub" style="margin-left: 12px">超出份数的旧备份会自动删除</span>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="savingBackup" @click="saveBackupSettings">保存备份设置</el-button>
            </el-form-item>
          </el-form>

          <el-table
            :data="backupList"
            v-loading="backupLoading"
            empty-text="暂无备份记录"
            @selection-change="(rows) => (backupSelected = rows)"
          >
            <el-table-column type="selection" width="46" />
            <el-table-column label="文件名" prop="filename" min-width="230" show-overflow-tooltip />
            <el-table-column label="大小" width="110" align="center">
              <template #default="{ row }">{{ formatSize(row.file_size) }}</template>
            </el-table-column>
            <el-table-column label="方式" width="90" align="center">
              <template #default="{ row }">
                <el-tag :type="row.trigger_by === 'auto' ? 'info' : 'primary'" effect="plain" size="small">
                  {{ row.trigger_by === 'auto' ? '定时' : '手动' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="90" align="center">
              <template #default="{ row }">
                <el-tag :type="row.status === 'ok' ? 'primary' : 'danger'" effect="plain" size="small">
                  {{ row.status === 'ok' ? '成功' : '失败' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="备份时间" width="170">
              <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="130" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" :disabled="row.status !== 'ok'" @click="downloadBackup(row)">下载</el-button>
                <el-button link type="danger" @click="removeOneBackup(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 密钥弹窗 -->
    <el-dialog v-model="keyDialog" :title="keyForm.id ? '编辑密钥' : '新增密钥'" width="480px">
      <el-form :model="keyForm" label-width="90px">
        <el-form-item label="密钥值">
          <el-input v-model="keyForm.keyValue" placeholder="留空自动生成">
            <template #append>
              <el-button @click="genKey">生成</el-button>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item label="类型">
          <el-radio-group v-model="keyForm.keyType">
            <el-radio :value="1">管理员</el-radio>
            <el-radio :value="2">用户</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="keyForm.remark" placeholder="例如：发放给高一（3）班" />
        </el-form-item>
        <el-form-item label="有效期">
          <el-date-picker v-model="keyForm.expiresAt" type="datetime" placeholder="留空表示永久" style="width: 100%" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="keyForm.status" :active-value="1" :inactive-value="0" active-text="启用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="keyDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveKey">保存</el-button>
      </template>
    </el-dialog>


    <!-- 聊天室配置弹窗 -->
    <el-dialog v-model="roomDialog" title="聊天室配置" width="440px">
      <el-form :model="roomForm" label-width="110px">
        <el-form-item label="聊天室名称">
          <el-input v-model="roomForm.name" />
        </el-form-item>
        <el-form-item label="人数上限">
          <el-input-number v-model="roomForm.maxMembers" :min="1" :max="20" />
        </el-form-item>
        <el-form-item label="消息保留天数">
          <el-input-number v-model="roomForm.retentionDays" :min="0" :max="365" />
        </el-form-item>
        <div class="text-sub" style="padding-left: 110px; line-height: 1.7">
          保留天数设为 0 表示永久保留；超期消息每小时自动清理一次。
        </div>
      </el-form>
      <template #footer>
        <el-button @click="roomDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveRoom">保存</el-button>
      </template>
    </el-dialog>

    <!-- 短语弹窗 -->
    <el-dialog v-model="phraseDialog" :title="phraseForm.id ? '编辑短语' : '新增短语'" width="440px">
      <el-form :model="phraseForm" label-width="90px">
        <el-form-item label="短语内容" required>
          <el-input v-model="phraseForm.content" maxlength="100" show-word-limit />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="phraseForm.sortOrder" :min="0" :max="999" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="phraseForm.status" :active-value="1" :inactive-value="0" active-text="启用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="phraseDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="savePhrase">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, nextTick } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import * as echarts from 'echarts';
import { adminApi, authApi, resourceApi, chatApi, questionApi } from '@/api';
import AppPager from '@/components/AppPager.vue';
import ResourceManage from '@/views/admin/ResourceManage.vue';
import QuestionManage from '@/views/admin/QuestionManage.vue';

const tab = ref('dashboard');
const saving = ref(false);

// ---------------- 统计 ----------------
const dashboard = ref({});
const stats = ref({ topSites: [], categories: [], trend: [], messageTypes: [] });
const catChart = ref(null);
const trendChart = ref(null);
let catInstance = null;
let trendInstance = null;

const statCards = computed(() => [
  { label: '资源网站', value: dashboard.value.siteCount ?? 0 },
  { label: '累计访问', value: dashboard.value.siteVisits ?? 0 },
  { label: '题库题目', value: dashboard.value.questionCount ?? 0 },
  { label: '题库检索次数', value: dashboard.value.searchCount ?? 0 },
  { label: '访问密钥', value: dashboard.value.keyCount ?? 0 },
  { label: '聊天室', value: dashboard.value.roomCount ?? 0 },
  { label: '聊天消息', value: dashboard.value.messageCount ?? 0 },
  { label: '快速短语', value: dashboard.value.phraseCount ?? 0 }
]);

async function loadDashboard() {
  try {
    const [d, s] = await Promise.all([adminApi.dashboard(), adminApi.stats(7)]);
    dashboard.value = d;
    stats.value = s;
    await nextTick();
    renderCharts();
  } catch (e) { /* 错误已提示 */ }
}

function renderCharts() {
  if (catChart.value) {
    if (!catInstance) catInstance = echarts.init(catChart.value);
    catInstance.setOption({
      tooltip: { trigger: 'item' },
      legend: { bottom: 0, type: 'scroll', textStyle: { fontSize: 11 } },
      series: [{
        type: 'pie',
        radius: ['38%', '62%'],
        center: ['50%', '44%'],
        data: stats.value.categories.map((c) => ({ name: c.name, value: c.siteCount })),
        label: { fontSize: 11 }
      }],
      color: ['#1A3A5C', '#2B5EA7', '#4A7FC1', '#6E9BD1', '#93B6E0', '#B8D0EC', '#D3E0F2', '#E4EBF5', '#8FA8C8']
    });
  }
  if (trendChart.value) {
    if (!trendInstance) trendInstance = echarts.init(trendChart.value);
    trendInstance.setOption({
      tooltip: { trigger: 'axis' },
      grid: { left: 40, right: 20, top: 20, bottom: 40 },
      xAxis: { type: 'category', data: stats.value.trend.map((t) => t.day.slice(5)), axisLabel: { fontSize: 11 } },
      yAxis: { type: 'value', minInterval: 1 },
      series: [{
        type: 'line',
        smooth: true,
        areaStyle: { opacity: 0.15 },
        data: stats.value.trend.map((t) => t.count),
        itemStyle: { color: '#2B5EA7' }
      }]
    });
  }
}

// ---------------- 密钥 ----------------
const keys = ref([]);
const keyTotal = ref(0);
const keyLoading = ref(false);
const keyQuery = ref({ keyword: '', keyType: null, page: 1, pageSize: 10 });
const keyDialog = ref(false);
const keyForm = ref({ id: null, keyValue: '', keyType: 2, remark: '', expiresAt: null, status: 1 });

async function loadKeys() {
  keyLoading.value = true;
  try {
    const data = await authApi.listKeys({
      keyword: keyQuery.value.keyword || undefined,
      keyType: keyQuery.value.keyType || undefined,
      page: keyQuery.value.page,
      pageSize: keyQuery.value.pageSize
    });
    keys.value = data.list;
    keyTotal.value = data.total;
  } catch (e) { /* 错误已提示 */ } finally {
    keyLoading.value = false;
  }
}

function resetKeyQuery() {
  keyQuery.value = { keyword: '', keyType: null, page: 1, pageSize: keyQuery.value.pageSize };
  loadKeys();
}

function openKeyDialog(row) {
  keyForm.value = row
    ? { id: row.id, keyValue: row.key_value, keyType: row.key_type, remark: row.remark || '', expiresAt: row.expires_at, status: row.status }
    : { id: null, keyValue: '', keyType: 2, remark: '', expiresAt: null, status: 1 };
  keyDialog.value = true;
}

async function genKey() {
  try {
    const r = await authApi.generateKey();
    keyForm.value.keyValue = r.keyValue;
  } catch (e) { /* 错误已提示 */ }
}

async function saveKey() {
  saving.value = true;
  try {
    const payload = {
      keyValue: keyForm.value.keyValue,
      keyType: keyForm.value.keyType,
      remark: keyForm.value.remark,
      expiresAt: keyForm.value.expiresAt || null,
      status: keyForm.value.status
    };
    if (keyForm.value.id) await authApi.updateKey(keyForm.value.id, payload);
    else await authApi.createKey(payload);
    ElMessage.success('保存成功');
    keyDialog.value = false;
    loadKeys();
  } catch (e) { /* 错误已提示 */ } finally {
    saving.value = false;
  }
}

async function removeKey(row) {
  try {
    await ElMessageBox.confirm('确定删除密钥「' + row.key_value + '」吗？', '删除确认', { type: 'warning' });
  } catch (e) { return; }
  try {
    await authApi.removeKey(row.id);
    ElMessage.success('已删除');
    loadKeys();
  } catch (e) { /* 错误已提示 */ }
}

function copyKey(row) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(row.key_value).then(
      () => ElMessage.success('已复制'),
      () => ElMessage.info(row.key_value)
    );
  } else {
    ElMessage.info(row.key_value);
  }
}

// ---------------- 聊天室 ----------------
const rooms = ref([]);
const phrases = ref([]);
const roomDialog = ref(false);
const roomForm = ref({ id: null, name: '', maxMembers: 3, retentionDays: 30 });
const phraseDialog = ref(false);
const phraseForm = ref({ id: null, content: '', sortOrder: 0, status: 1 });

async function loadRooms() {
  try {
    rooms.value = await chatApi.rooms();
  } catch (e) { /* 错误已提示 */ }
}

async function loadPhrases() {
  try {
    phrases.value = await chatApi.phrases();
  } catch (e) { /* 错误已提示 */ }
}

function openRoomDialog(row) {
  roomForm.value = { id: row.id, name: row.name, maxMembers: row.max_members, retentionDays: row.retention_days };
  roomDialog.value = true;
}

async function saveRoom() {
  saving.value = true;
  try {
    await chatApi.updateRoom(roomForm.value.id, {
      name: roomForm.value.name,
      maxMembers: roomForm.value.maxMembers,
      retentionDays: roomForm.value.retentionDays
    });
    ElMessage.success('保存成功');
    roomDialog.value = false;
    loadRooms();
  } catch (e) { /* 错误已提示 */ } finally {
    saving.value = false;
  }
}

async function clearRoom(row) {
  try {
    await ElMessageBox.confirm('确定清空聊天室「' + row.name + '」的全部消息吗？此操作不可恢复。', '清空确认', { type: 'warning' });
  } catch (e) { return; }
  try {
    await chatApi.clearRoom(row.id);
    ElMessage.success('已清空');
    loadRooms();
  } catch (e) { /* 错误已提示 */ }
}

async function purgeMessages() {
  try {
    const r = await adminApi.purgeMessages();
    ElMessage.success('已清理 ' + r.deleted + ' 条过期消息');
    loadRooms();
  } catch (e) { /* 错误已提示 */ }
}

function openPhraseDialog(row) {
  phraseForm.value = row
    ? { id: row.id, content: row.content, sortOrder: row.sort_order, status: row.status }
    : { id: null, content: '', sortOrder: 0, status: 1 };
  phraseDialog.value = true;
}

async function savePhrase() {
  if (!phraseForm.value.content.trim()) return ElMessage.warning('请填写短语内容');
  saving.value = true;
  try {
    const payload = { content: phraseForm.value.content, sortOrder: phraseForm.value.sortOrder, status: phraseForm.value.status };
    if (phraseForm.value.id) await chatApi.updatePhrase(phraseForm.value.id, payload);
    else await chatApi.createPhrase(payload);
    ElMessage.success('保存成功');
    phraseDialog.value = false;
    loadPhrases();
  } catch (e) { /* 错误已提示 */ } finally {
    saving.value = false;
  }
}

async function removePhrase(row) {
  try {
    await ElMessageBox.confirm('确定删除短语「' + row.content + '」吗？', '删除确认', { type: 'warning' });
  } catch (e) { return; }
  try {
    await chatApi.removePhrase(row.id);
    ElMessage.success('已删除');
    loadPhrases();
  } catch (e) { /* 错误已提示 */ }
}

// ---------------- 设置 ----------------
const searchEnabled = ref(true);
const savingSettings = ref(false);

async function loadSettings() {
  try {
    const r = await adminApi.settings();
    searchEnabled.value = !!r.searchEnabled;
  } catch (e) { /* 错误已提示 */ }
}

async function saveSettings() {
  savingSettings.value = true;
  try {
    await questionApi.setSettings(searchEnabled.value);
    ElMessage.success('设置已保存');
  } catch (e) { /* 错误已提示 */ } finally {
    savingSettings.value = false;
  }
}

// ---------------- 数据库备份 ----------------
const backupForm = reactive({ enabled: false, hour: 3, minute: 0, keep: 7 });
const backupTime = ref('03:00');
const backupList = ref([]);
const backupSelected = ref([]);
const backupLoading = ref(false);
const backupRunning = ref(false);
const savingBackup = ref(false);

/** 时间字符串 <-> 时分互转 */
function timeToHM(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ''));
  if (!m) return { hour: 3, minute: 0 };
  return { hour: Math.min(23, Number(m[1])), minute: Math.min(59, Number(m[2])) };
}

function hmToTime(h, m) {
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

function formatSize(bytes) {
  const n = Number(bytes || 0);
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}

async function loadBackups() {
  backupLoading.value = true;
  try {
    const r = await adminApi.backupOverview();
    const cfg = r.config || {};
    backupForm.enabled = !!cfg.enabled;
    backupForm.hour = cfg.hour ?? 3;
    backupForm.minute = cfg.minute ?? 0;
    backupForm.keep = cfg.keep ?? 7;
    backupTime.value = hmToTime(backupForm.hour, backupForm.minute);
    backupList.value = r.list || [];
  } catch (e) { /* 错误已提示 */ } finally {
    backupLoading.value = false;
  }
}

async function saveBackupSettings() {
  savingBackup.value = true;
  try {
    const hm = timeToHM(backupTime.value);
    await adminApi.saveBackupConfig({
      enabled: backupForm.enabled,
      hour: hm.hour,
      minute: hm.minute,
      keep: backupForm.keep
    });
    ElMessage.success('备份设置已保存');
    await loadBackups();
  } catch (e) { /* 错误已提示 */ } finally {
    savingBackup.value = false;
  }
}

async function runBackupNow() {
  backupRunning.value = true;
  try {
    const r = await adminApi.runBackup();
    ElMessage.success('备份完成：' + r.filename);
    await loadBackups();
  } catch (e) { /* 错误已提示 */ } finally {
    backupRunning.value = false;
  }
}

async function removeOneBackup(row) {
  try {
    await ElMessageBox.confirm('确定删除备份「' + row.filename + '」吗？删除后无法恢复。', '删除确认', { type: 'warning' });
  } catch (e) { return; }
  try {
    await adminApi.removeBackup(row.id);
    ElMessage.success('已删除');
    await loadBackups();
  } catch (e) { /* 错误已提示 */ }
}

async function removeSelectedBackups() {
  const ids = backupSelected.value.map((r) => r.id);
  if (!ids.length) return;
  try {
    await ElMessageBox.confirm('确定删除选中的 ' + ids.length + ' 条备份吗？删除后无法恢复。', '批量删除', { type: 'warning' });
  } catch (e) { return; }
  try {
    const r = await adminApi.removeBackups(ids);
    ElMessage.success('已删除 ' + r.removed + ' 条备份');
    backupSelected.value = [];
    await loadBackups();
  } catch (e) { /* 错误已提示 */ }
}

/** 下载备份：带上令牌，用 blob 触发浏览器保存 */
async function downloadBackup(row) {
  try {
    const res = await fetch(adminApi.backupDownloadUrl(row.filename), {
      headers: { Authorization: 'Bearer ' + (localStorage.getItem('ip_token') || '') }
    });
    if (!res.ok) throw new Error('下载失败');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = row.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    ElMessage.error('下载失败，请重试');
  }
}

function formatDate(v) {
  if (!v) return '';
  return String(v).replace('T', ' ').slice(0, 16);
}

onMounted(() => {
  loadDashboard();
  loadKeys();
  loadRooms();
  loadPhrases();
  loadSettings();
  loadBackups();
});
</script>

<style scoped>
.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--sp-mid);
  margin-bottom: var(--sp);
}
.stat-card { text-align: center; padding: 20px 12px; }
.stat-value { font-size: 28px; font-weight: 600; color: var(--c-primary); line-height: 1.2; }
.stat-label { font-size: var(--f-xs); color: var(--c-text-sub); margin-top: 6px; }

.chart-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: var(--sp); }
.chart-title { font-size: var(--f-sm); font-weight: 600; color: var(--c-primary); margin-bottom: 12px; }
.chart-box { height: 280px; width: 100%; }

.card-head { display: flex; align-items: center; justify-content: space-between; }
.card-title { font-size: var(--f-md); font-weight: 600; color: var(--c-primary); }
</style>