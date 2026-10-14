<template>
  <div class="page">
    <div class="page-header">
      <div class="header-main">
        <h2 class="page-title">{{ event?.name || '赛事列表' }}</h2>
        <p v-if="event?.description" class="text-sub event-desc">{{ event.description }}</p>
      </div>
      <div class="header-actions">
        <!-- 多个赛事时提供切换入口 -->
        <el-select
          v-if="events.length > 1"
          v-model="selectedEventId"
          class="event-select"
          placeholder="选择赛事"
          @change="onEventChange"
        >
          <el-option
            v-for="e in events"
            :key="e.id"
            :label="e.name"
            :value="e.id"
          >
            <span class="opt-name">{{ e.name }}</span>
            <span class="opt-count">{{ e.active_stage_count }} 个环节</span>
          </el-option>
        </el-select>
        <el-button :icon="Refresh" @click="load" :loading="loading">刷新</el-button>
      </div>
    </div>

    <el-alert
      v-if="userStore.isMember"
      type="info"
      :closable="false"
      show-icon
      class="role-alert"
      title="您当前为队员身份，仅可参与个人环节。团队协作环节请由队长登录作答。"
    />

    <div v-loading="loading">
      <el-empty v-if="!loading && !visibleStages.length" description="当前没有已开启的环节" />

      <div v-else class="stage-grid">
        <div v-for="s in visibleStages" :key="s.id" class="stage-card app-card">
          <div class="stage-card-head">
            <div class="stage-name">{{ s.name }}</div>
            <el-tag :type="s.mode === 'team' ? 'warning' : 'primary'" effect="plain" size="small">
              {{ s.mode === 'team' ? '团队协作' : '个人独立' }}
            </el-tag>
          </div>

          <div class="stage-meta">
            <div class="meta-item">
              <span class="stat-value">{{ s.questionCount }}</span>
              <span class="stat-label">题目数</span>
            </div>
            <div class="meta-item">
              <span class="stat-value">{{ s.totalScore }}</span>
              <span class="stat-label">总分</span>
            </div>
            <div class="meta-item">
              <span class="stat-value time-value">{{ timeLabel(s) }}</span>
              <span class="stat-label">时限</span>
            </div>
          </div>

          <div class="stage-tags">
            <el-tag v-if="s.config.specialConfig.timeAccumulate" size="small" effect="plain">接力赛</el-tag>
            <el-tag v-if="s.config.timeConfig.speedRanking" size="small" effect="plain" type="warning">速度排名</el-tag>
            <el-tag v-if="s.config.specialConfig.questionDifferent" size="small" effect="plain">试题不同</el-tag>
            <el-tag v-if="s.config.paperStrategy === 'fixed'" size="small" effect="plain" type="info">固定试卷</el-tag>
            <el-tag v-if="s.config.allowViewAnswer" size="small" effect="plain" type="info">可看错题</el-tag>
          </div>

          <div class="stage-actions">
            <el-button type="primary" :icon="EditPen" @click="router.push('/stage/' + s.id + '/ready')">进入答题</el-button>
            <el-button :icon="TrendCharts" @click="router.push('/stage/' + s.id + '/rank')">排行榜</el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Refresh, EditPen, TrendCharts } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { eventApi } from '@/api';
import { useUserStore } from '@/stores/user';
import { humanDuration } from '@/utils/format';

const router = useRouter();
const userStore = useUserStore();

const loading = ref(false);
const event = ref(null);
const stages = ref([]);
const events = ref([]);
const selectedEventId = ref(null);

// 记住学生上次选择的赛事，刷新后不再跳回默认赛事
const STORAGE_KEY = 'selectedEventId';

// 队员仅可见个人环节 (project.md 6.4)
const visibleStages = computed(() => {
  const list = stages.value || [];
  if (userStore.canViewAllStages) return list;
  return list.filter((s) => s.mode === 'individual');
});

function timeLabel(s) {
  const t = s.config?.timeConfig || {};
  if (t.perQuestionTime > 0) return '每题' + t.perQuestionTime + '秒';
  return humanDuration(t.totalTime);
}

async function load(eventId) {
  loading.value = true;
  try {
    const data = await eventApi.current(eventId ?? selectedEventId.value ?? undefined);
    events.value = data.events || [];
    event.value = data.event;
    selectedEventId.value = data.event ? data.event.id : null;
    // 仅显示已开启环节 (7.1 步骤1)
    stages.value = (data.stages || []).filter((s) => Number(s.status) === 1);

    if (data.event) {
      localStorage.setItem(STORAGE_KEY, String(data.event.id));
    } else if (eventId !== undefined) {
      // 上次选择的赛事已被停用或删除，清掉记忆并回到默认赛事
      localStorage.removeItem(STORAGE_KEY);
      ElMessage.warning('该赛事已不可用，已切换到其他赛事');
      selectedEventId.value = null;
      await load();
    }
  } catch (e) {
    /* 拦截器已提示 */
  } finally {
    loading.value = false;
  }
}

function onEventChange(id) {
  localStorage.setItem(STORAGE_KEY, String(id));
  load(id);
}

onMounted(() => {
  const saved = localStorage.getItem(STORAGE_KEY);
  selectedEventId.value = saved ? Number(saved) : null;
  load();
});
</script>

<style scoped>
.header-main {
  min-width: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: var(--sp-tight);
  flex-shrink: 0;
}

.event-select {
  width: 260px;
}

.opt-name {
  margin-right: 12px;
}

.opt-count {
  color: var(--c-text-sub);
  font-size: var(--f-xs);
  float: right;
}

.event-desc {
  margin: 6px 0 0;
  max-width: 700px;
}

.role-alert {
  margin-bottom: var(--sp);
  border-radius: var(--r-btn);
}

.stage-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--sp);
}

.stage-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  transition: box-shadow 0.18s, transform 0.18s;
}

.stage-card:hover {
  box-shadow: 0 4px 16px rgba(26, 58, 92, 0.09);
  transform: translateY(-1px);
}

.stage-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.stage-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--c-primary);
  line-height: 1.4;
}

.stage-meta {
  display: flex;
  gap: var(--sp);
  padding: 12px 0;
  border-top: 1px solid var(--c-border);
  border-bottom: 1px solid var(--c-border);
}

.meta-item {
  flex: 1;
  text-align: center;
}

.time-value {
  font-size: 18px;
}

.stage-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  min-height: 24px;
}

.stage-actions {
  display: flex;
  gap: var(--sp-tight);
}

.stage-actions .el-button {
  flex: 1;
  margin-left: 0;
}
</style>