<template>
  <div v-loading="loading">
    <div class="page-header">
      <h2 class="page-title">数据统计</h2>
      <div class="toolbar">
        <!-- 先筛赛事，再筛环节 -->
        <el-select v-model="eventId" placeholder="选择赛事" style="width: 260px" @change="onEventChange">
          <el-option v-for="e in events" :key="e.id" :label="e.name" :value="e.id" />
        </el-select>
        <el-select
          v-model="stageId"
          placeholder="选择环节"
          style="width: 260px"
          :disabled="!eventId"
          @change="load"
        >
          <el-option v-for="s in stages" :key="s.id" :label="s.name" :value="s.id" />
        </el-select>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
      </div>
    </div>

    <el-empty v-if="!stageId" description="暂无环节数据" />

    <template v-else>
      <div class="stat-grid">
        <div class="app-card mini-stat">
          <span class="stat-value">{{ data.distribution.count }}</span>
          <span class="stat-label">参与队伍/人数</span>
        </div>
        <div class="app-card mini-stat">
          <span class="stat-value">{{ data.distribution.avg }}</span>
          <span class="stat-label">平均分</span>
        </div>
        <div class="app-card mini-stat">
          <span class="stat-value">{{ data.distribution.max }}</span>
          <span class="stat-label">最高分</span>
        </div>
        <div class="app-card mini-stat">
          <span class="stat-value">{{ data.distribution.min }}</span>
          <span class="stat-label">最低分</span>
        </div>
      </div>

      <div class="chart-grid">
        <div class="app-card chart-card">
          <h3 class="section-title">成绩分布</h3>
          <div ref="distRef" class="chart"></div>
        </div>

        <div class="app-card chart-card">
          <h3 class="section-title">知识模块正确率</h3>
          <div ref="moduleRef" class="chart"></div>
        </div>
      </div>

      <div class="app-card chart-card">
        <h3 class="section-title">队伍成绩对比</h3>
        <div ref="teamRef" class="chart"></div>
      </div>

      <div class="app-card">
        <h3 class="section-title">各题目正确率（由低到高）</h3>
        <el-table :data="data.questionAccuracy" size="small" max-height="420" empty-text="暂无答题数据">
          <el-table-column label="ID" prop="questionId" width="70" />
          <el-table-column label="题型" width="80" align="center">
            <template #default="{ row }">{{ typeLabel(row.type) }}</template>
          </el-table-column>
          <el-table-column label="题干" prop="content" min-width="300" show-overflow-tooltip />
          <el-table-column label="模块" prop="module" width="130" />
          <el-table-column label="正确/总数" width="110" align="center">
            <template #default="{ row }">{{ row.correctCount }} / {{ row.total }}</template>
          </el-table-column>
          <el-table-column label="正确率" width="150">
            <template #default="{ row }">
              <el-progress :percentage="row.accuracy" :stroke-width="10" :text-inside="true" />
            </template>
          </el-table-column>
        </el-table>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { Refresh } from '@element-plus/icons-vue';
import * as echarts from 'echarts';
import { adminApi, eventApi } from '@/api';
import { QUESTION_TYPE_LABEL, humanDuration } from '@/utils/format';

const loading = ref(false);
const eventId = ref(null);
const stageId = ref(null);
const events = ref([]);
const stages = ref([]);

const data = reactive({
  distribution: { buckets: [], count: 0, avg: 0, max: 0, min: 0 },
  questionAccuracy: [],
  moduleAccuracy: [],
  teamComparison: []
});

const distRef = ref();
const moduleRef = ref();
const teamRef = ref();

let distChart = null;
let moduleChart = null;
let teamChart = null;

function typeLabel(t) {
  return QUESTION_TYPE_LABEL[t] || '-';
}

// 统一图表配色 —— 遵循禁用绿色系规范
const PALETTE = ['#1A3A5C', '#2B5EA7', '#5A7FA8', '#8FA8C4', '#F39C12', '#E74C3C', '#C08457'];

/**
 * 在图表上显示「暂无数据」占位。
 *
 * 之前只有 renderTeam 处理了空数据，renderDist / renderModule 在空数组时
 * 仍然走 setOption，结果是一片空白画布——看起来就像「图表加载不出来」。
 */
function renderEmpty(chart, text) {
  chart.clear();
  chart.setOption({
    title: {
      text: text || '本环节暂无成绩数据',
      left: 'center',
      top: 'middle',
      textStyle: { color: '#7F8C8D', fontSize: 14, fontWeight: 400 }
    }
  }, true);
}

function renderDist() {
  if (!distRef.value) return;
  if (!distChart) distChart = echarts.init(distRef.value);
  const buckets = data.distribution.buckets || [];
  if (!buckets.length) return renderEmpty(distChart, '本环节暂无成绩分布');
  distChart.setOption({
    color: PALETTE,
    tooltip: { trigger: 'axis' },
    grid: { left: 50, right: 20, top: 30, bottom: 40 },
    xAxis: { type: 'category', data: buckets.map((b) => b.range), axisLine: { lineStyle: { color: '#E0E6ED' } }, axisLabel: { color: '#7F8C8D' } },
    yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#E0E6ED' } }, axisLabel: { color: '#7F8C8D' } },
    series: [{
      type: 'bar',
      data: buckets.map((b) => b.count),
      barMaxWidth: 46,
      itemStyle: { color: '#2B5EA7', borderRadius: [4, 4, 0, 0] }
    }]
  }, true);
}

function renderModule() {
  if (!moduleRef.value) return;
  if (!moduleChart) moduleChart = echarts.init(moduleRef.value);
  const rows = data.moduleAccuracy || [];
  if (!rows.length) return renderEmpty(moduleChart, '本环节暂无模块数据');
  moduleChart.setOption({
    color: ['#2B5EA7'],
    tooltip: {},
    radar: {
      indicator: rows.map((r) => ({ name: r.module, max: 100 })),
      axisName: { color: '#7F8C8D', fontSize: 11 },
      splitLine: { lineStyle: { color: '#E0E6ED' } },
      splitArea: { areaStyle: { color: ['#FFFFFF', '#F5F7FA'] } },
      axisLine: { lineStyle: { color: '#E0E6ED' } }
    },
    series: [{
      type: 'radar',
      data: [{
        value: rows.map((r) => r.accuracy),
        name: '正确率(%)',
        areaStyle: { color: 'rgba(43, 94, 167, 0.18)' },
        lineStyle: { color: '#2B5EA7', width: 2 },
        itemStyle: { color: '#1A3A5C' }
      }]
    }]
  }, true);
}

function renderTeam() {
  if (!teamRef.value) return;
  if (!teamChart) teamChart = echarts.init(teamRef.value);
  const rows = data.teamComparison || [];

  if (!rows.length) return renderEmpty(teamChart);

  const stageName = stages.value.find((s) => s.id === stageId.value)?.name || '';
  const isIndividual = rows.some((r) => r.memberCount !== undefined);

  teamChart.setOption({
    title: {
      text: stageName + (isIndividual ? '（按队伍汇总队员成绩）' : '（团队成绩）'),
      left: 'center',
      top: 0,
      textStyle: { color: '#7F8C8D', fontSize: 12, fontWeight: 400 }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const p = params[0];
        const row = rows.slice().reverse()[p.dataIndex];
        if (!row) return p.name;
        const time = row.totalTime ? humanDuration(row.totalTime) : '-';
        const extra = row.memberCount !== undefined ? '<br/>参与人数：' + row.memberCount : '';
        return '<strong>' + row.teamName + '</strong><br/>总分：' + row.totalScore + ' 分<br/>总用时：' + time + extra;
      }
    },
    grid: { left: 130, right: 60, top: 34, bottom: 30 },
    xAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: '#E0E6ED' } },
      axisLabel: { color: '#7F8C8D' }
    },
    yAxis: {
      type: 'category',
      data: rows.map((r) => r.teamName).reverse(),
      axisLine: { lineStyle: { color: '#E0E6ED' } },
      axisLabel: { color: '#7F8C8D' }
    },
    series: [{
      type: 'bar',
      data: rows.map((r) => r.totalScore).reverse(),
      barMaxWidth: 22,
      label: { show: true, position: 'right', color: '#2C3E50', fontSize: 12 },
      itemStyle: { color: '#1A3A5C', borderRadius: [0, 4, 4, 0] }
    }]
  }, true);
}

function resizeAll() {
  distChart?.resize();
  moduleChart?.resize();
  teamChart?.resize();
}

async function load() {
  loading.value = true;
  try {
    const res = await adminApi.stats(stageId.value || undefined);
    Object.assign(data, {
      distribution: res.distribution || data.distribution,
      questionAccuracy: res.questionAccuracy || [],
      moduleAccuracy: res.moduleAccuracy || [],
      teamComparison: res.teamComparison || []
    });
    if (!stageId.value && res.stageId) stageId.value = res.stageId;

    await nextTick();
    renderDist();
    renderModule();
    renderTeam();
  } catch (e) {
    /* 拦截器已提示 */
  } finally {
    loading.value = false;
  }
}

/** 载入赛事列表，并默认选中第一个赛事 */
async function loadEvents() {
  try {
    const list = await eventApi.list();
    events.value = list;
    if (list.length && !eventId.value) {
      eventId.value = list[0].id;
      await loadStages();
    }
  } catch (e) {
    /* 拦截器已提示 */
  }
}

/**
 * 载入当前赛事下的环节，并智能选中默认环节。
 *
 * 之前无条件选 list[0]：若第一个环节恰好没有成绩数据（例如未启用的
 * 「检索专项」），切换赛事后三张图全是空的，看起来就像「图表加载不出来」。
 * 现在优先选中第一个有成绩数据的环节；都没有数据时才退回第一个。
 */
async function loadStages() {
  stages.value = [];
  stageId.value = null;
  if (!eventId.value) return;
  try {
    const list = await eventApi.stages(eventId.value);
    stages.value = list;
    if (!list.length) return;

    // 已启用且有成绩数据的环节优先；其次是启用的；最后才用第一个
    const picked =
      list.find((s) => Number(s.status) === 1 && Number(s.hasScore) > 0) ||
      list.find((s) => Number(s.hasScore) > 0) ||
      list.find((s) => Number(s.status) === 1) ||
      list[0];
    stageId.value = picked.id;
  } catch (e) {
    /* 拦截器已提示 */
  }
}

/** 切换赛事：重置环节并重新加载统计 */
async function onEventChange() {
  await loadStages();
  await load();
}

onMounted(async () => {
  await loadEvents();
  await load();
  window.addEventListener('resize', resizeAll);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeAll);
  distChart?.dispose();
  moduleChart?.dispose();
  teamChart?.dispose();
});
</script>

<style scoped>
.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--sp);
  margin-bottom: var(--sp);
}

.mini-stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
}

.chart-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp);
  margin-bottom: var(--sp);
}

.chart-card {
  margin-bottom: var(--sp);
}

.section-title {
  font-size: 16px;
  color: var(--c-primary);
  margin: 0 0 14px;
}

.chart {
  height: 300px;
  width: 100%;
}

@media (max-width: 1100px) {
  .stat-grid { grid-template-columns: repeat(2, 1fr); }
  .chart-grid { grid-template-columns: 1fr; }
}
</style>
