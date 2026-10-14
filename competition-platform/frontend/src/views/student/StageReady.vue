<template>
  <div class="page">
    <div class="exam-shell" v-loading="loading">
      <div class="page-header">
        <h2 class="page-title">{{ info?.stage?.name || '答题准备' }}</h2>
        <el-button :icon="ArrowLeft" @click="router.push('/')">返回首页</el-button>
      </div>

      <template v-if="info">
        <!-- 接力模式：显示当前队员与时间池 (project.md 7.2) -->
        <el-alert
          v-if="info.relay?.active"
          type="warning"
          :closable="false"
          show-icon
          class="relay-alert"
          :title="'接力赛 · 当前第 ' + info.relay.playerIndex + ' 位队员作答'"
        >
          <template #default>
            <div class="relay-detail">
              <span>本次可用时间：<b>{{ humanDuration(info.relay.availableTime) }}</b></span>
              <span v-if="info.relay.carried > 0">（含前段队员节余 {{ humanDuration(info.relay.carried) }}）</span>
            </div>
          </template>
        </el-alert>

        <el-alert
          v-if="info.finished"
          type="success"
          :closable="false"
          show-icon
          class="relay-alert"
          title="您已完成本环节，可查看成绩与排行榜"
        />

        <div class="app-card info-card">
          <div class="info-grid">
            <div class="info-item">
              <span class="stat-value">{{ info.stage.questionCount }}</span>
              <span class="stat-label">题目数量</span>
            </div>
            <div class="info-item">
              <span class="stat-value">{{ info.stage.totalScore }}</span>
              <span class="stat-label">总分</span>
            </div>
            <div class="info-item">
              <span class="stat-value time-value">{{ timeLabel }}</span>
              <span class="stat-label">答题时限</span>
            </div>
            <div class="info-item">
              <span class="stat-value">{{ info.stage.mode === 'team' ? '团队' : '个人' }}</span>
              <span class="stat-label">答题模式</span>
            </div>
          </div>
        </div>

        <div class="app-card rules-card">
          <h3 class="rules-title">答题须知</h3>
          <ul class="rules-list">
            <li>本环节共 {{ info.stage.questionCount }} 题，总分 {{ info.stage.totalScore }} 分。</li>
            <li v-if="cfg.scoreConfig.wrongDeduct">答错扣分：每错一题扣 {{ deductText(cfg.scoreConfig.wrongDeductScore) }}。</li>
            <li v-if="cfg.scoreConfig.unansweredDeduct">不答扣分：未作答的题目扣 {{ deductText(cfg.scoreConfig.unansweredDeductScore) }}。</li>
            <li v-if="cfg.scoreConfig.openedNotSubmitDeduct">已打开未提交扣分：扣 {{ deductText(cfg.scoreConfig.openedNotSubmitDeductScore) }}。</li>
            <li>{{ cfg.specialConfig.allowSkip ? '允许跳题。' : '不允许跳题，请逐题作答。' }}</li>
            <li>{{ cfg.specialConfig.allowReturn ? '允许返回上一题修改答案。' : '提交后不可返回修改。' }}</li>
            <li v-if="cfg.questionConfig.shuffleOptions">选项顺序已随机打乱。</li>
            <li>答题过程中请勿切换窗口或退出全屏，系统将记录异常行为。</li>
            <li>本页面禁止复制、剪切与右键操作。</li>
          </ul>
        </div>

        <div class="action-bar">
          <el-button v-if="!info.finished" type="primary" size="large" :icon="EditPen" @click="start">开始答题</el-button>
          <el-button v-else type="primary" size="large" :icon="Trophy" @click="router.push('/stage/' + stageId + '/result')">查看成绩</el-button>
          <el-button size="large" :icon="TrendCharts" @click="router.push('/stage/' + stageId + '/rank')">查看排行榜</el-button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ArrowLeft, EditPen, Trophy, TrendCharts } from '@element-plus/icons-vue';
import { examApi } from '@/api';
import { humanDuration } from '@/utils/format';

const route = useRoute();
const router = useRouter();
const stageId = route.params.id;

const loading = ref(false);
const info = ref(null);

const cfg = computed(() => info.value?.stage?.config || { scoreConfig: {}, specialConfig: {}, questionConfig: {}, timeConfig: {} });

const timeLabel = computed(() => {
  const t = cfg.value.timeConfig || {};
  if (t.perQuestionTime > 0) return '每题' + t.perQuestionTime + '秒';
  return humanDuration(t.totalTime);
});

function deductText(v) {
  return v === null || v === undefined ? '对应分值' : v + ' 分';
}

async function load() {
  loading.value = true;
  try {
    info.value = await examApi.ready(stageId);
  } catch (e) {
    setTimeout(() => router.push('/'), 800);
  } finally {
    loading.value = false;
  }
}

async function start() {
  try {
    await examApi.start(stageId);
    router.push('/stage/' + stageId + '/answer');
  } catch (e) {
    /* 拦截器已提示 */
  }
}

onMounted(load);
</script>

<style scoped>
.relay-alert {
  margin-bottom: var(--sp);
  border-radius: var(--r-btn);
}

.relay-detail {
  margin-top: 4px;
  font-size: 13px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.info-card {
  margin-bottom: var(--sp);
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--sp);
  text-align: center;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.time-value {
  font-size: 20px;
}

.rules-card {
  margin-bottom: var(--sp);
}

.rules-title {
  font-size: 16px;
  color: var(--c-primary);
  margin: 0 0 12px;
}

.rules-list {
  margin: 0;
  padding-left: 20px;
  color: var(--c-text);
  line-height: 2;
}

.action-bar {
  display: flex;
  gap: var(--sp-tight);
  justify-content: center;
  padding: var(--sp) 0;
}

@media (max-width: 640px) {
  .info-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
