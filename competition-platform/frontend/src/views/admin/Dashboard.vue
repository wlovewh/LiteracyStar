<template>
  <div v-loading="loading">
    <div class="page-header">
      <h2 class="page-title">仪表盘</h2>
      <el-button :icon="Refresh" @click="load" :loading="loading">刷新</el-button>
    </div>

    <!-- 统计卡片 (project.md 10.1) -->
    <div class="stat-grid">
      <div class="stat-card app-card">
        <div class="stat-icon"><el-icon :size="22"><User /></el-icon></div>
        <div>
          <div class="stat-value">{{ data.onlineTeams }}</div>
          <div class="stat-label">当前在线队伍</div>
        </div>
      </div>
      <div class="stat-card app-card">
        <div class="stat-icon"><el-icon :size="22"><VideoPlay /></el-icon></div>
        <div>
          <div class="stat-value">{{ data.activeStageCount }}</div>
          <div class="stat-label">进行中环节</div>
        </div>
      </div>
      <div class="stat-card app-card">
        <div class="stat-icon"><el-icon :size="22"><Document /></el-icon></div>
        <div>
          <div class="stat-value">{{ data.todayAnswers }}</div>
          <div class="stat-label">今日答题次数</div>
        </div>
      </div>
      <div class="stat-card app-card">
        <div class="stat-icon stat-icon-warn"><el-icon :size="22"><Warning /></el-icon></div>
        <div>
          <div class="stat-value">{{ data.cheatLogCount }}</div>
          <div class="stat-label">预警记录</div>
        </div>
      </div>
    </div>

    <div class="dash-row">
      <!-- 进行中环节 -->
      <div class="app-card dash-col">
        <h3 class="section-title">进行中的环节</h3>
        <el-table :data="data.activeStages" empty-text="当前没有已开启的环节" size="small">
          <el-table-column label="环节名称" prop="name" min-width="200" />
          <el-table-column label="所属赛事" prop="event_name" min-width="200" />
          <el-table-column label="状态" width="90" align="center">
            <template #default><el-tag size="small" type="primary" effect="plain">已开启</el-tag></template>
          </el-table-column>
        </el-table>
      </div>

      <!-- 快捷入口 (10.1) -->
      <div class="app-card dash-col quick-col">
        <h3 class="section-title">快捷入口</h3>
        <div class="quick-grid">
          <div class="quick-item" @click="router.push('/admin/questions')">
            <el-icon :size="24"><Document /></el-icon>
            <span>题库管理</span>
            <span class="quick-count">{{ data.questionCount }} 题</span>
          </div>
          <div class="quick-item" @click="router.push('/admin/teams')">
            <el-icon :size="24"><User /></el-icon>
            <span>队伍管理</span>
            <span class="quick-count">{{ data.teamCount }} 队</span>
          </div>
          <div class="quick-item" @click="router.push('/admin/events')">
            <el-icon :size="24"><Trophy /></el-icon>
            <span>赛事管理</span>
            <span class="quick-count">进入</span>
          </div>
          <div class="quick-item" @click="router.push('/admin/stats')">
            <el-icon :size="24"><DataAnalysis /></el-icon>
            <span>数据统计</span>
            <span class="quick-count">查看</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Refresh, User, VideoPlay, Document, Warning, Trophy, DataAnalysis } from '@element-plus/icons-vue';
import { adminApi } from '@/api';

const router = useRouter();
const loading = ref(false);
const data = ref({ onlineTeams: 0, activeStageCount: 0, todayAnswers: 0, cheatLogCount: 0, teamCount: 0, questionCount: 0, activeStages: [] });

async function load() {
  loading.value = true;
  try {
    data.value = await adminApi.dashboard();
  } catch (e) {
    /* 拦截器已提示 */
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--sp);
  margin-bottom: var(--sp);
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-icon {
  width: 46px;
  height: 46px;
  border-radius: var(--r-btn);
  background: var(--c-selected);
  color: var(--c-primary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.stat-icon-warn {
  background: #FDF3E7;
  color: var(--c-warning);
}

.dash-row {
  display: grid;
  grid-template-columns: 1.6fr 1fr;
  gap: var(--sp);
}

.section-title {
  font-size: 16px;
  color: var(--c-primary);
  margin: 0 0 14px;
}

.quick-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--sp-tight);
}

.quick-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 18px 10px;
  border: 1px solid var(--c-border);
  border-radius: var(--r-btn);
  cursor: pointer;
  color: var(--c-primary);
  transition: all 0.15s;
  font-size: 13px;
}

.quick-item:hover {
  border-color: var(--c-primary-2);
  background: var(--c-selected);
}

.quick-count {
  font-size: 12px;
  color: var(--c-text-sub);
}

@media (max-width: 1100px) {
  .stat-grid { grid-template-columns: repeat(2, 1fr); }
  .dash-row { grid-template-columns: 1fr; }
}
</style>
