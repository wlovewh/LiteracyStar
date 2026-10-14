<template>
  <div class="page">
    <div class="exam-shell" v-loading="loading">
      <div class="page-header">
        <h2 class="page-title">{{ data?.stage?.name || '成绩' }}</h2>
        <el-button :icon="ArrowLeft" @click="router.push('/')">返回首页</el-button>
      </div>

      <template v-if="data">
        <div v-if="!data.finished" class="app-card">
          <el-empty description="尚未完成本环节答题">
            <el-button type="primary" @click="router.push('/stage/' + stageId + '/ready')">前往答题</el-button>
          </el-empty>
        </div>

        <template v-else>
          <div class="app-card result-hero">
            <div class="hero-label">本次成绩</div>
            <div class="hero-score">{{ data.score.totalScore }}</div>
            <div class="hero-meta">
              <span>用时 {{ formatDuration(data.score.totalTime) }}</span>
              <span class="divider">·</span>
              <span>排名 第 {{ data.score.rank || '-' }} 名</span>
            </div>
          </div>

          <div class="result-actions">
            <el-button type="primary" :icon="TrendCharts" @click="router.push('/stage/' + stageId + '/rank')">查看排行榜</el-button>
            <!-- 管理员开启"允许查看答案"后才显示错题入口 (project.md 9.2) -->
            <el-button v-if="data.allowViewAnswer" :icon="Notebook" @click="router.push('/stage/' + stageId + '/wrong')">查看错题</el-button>
            <el-button v-else disabled>错题本未开放</el-button>
          </div>

          <!-- 接力模式：显示接力情况 (7.2) -->
          <div v-if="data.relay?.active" class="app-card relay-card">
            <h3 class="section-title">接力情况</h3>
            <el-descriptions :column="2" border>
              <el-descriptions-item label="当前队员序号">第 {{ data.relay.playerIndex }} 位</el-descriptions-item>
              <el-descriptions-item label="本次可用时间">{{ formatDuration(data.relay.availableTime) }}</el-descriptions-item>
              <el-descriptions-item label="前段节余时间">{{ formatDuration(data.relay.carried || 0) }}</el-descriptions-item>
              <el-descriptions-item label="下一位队员">
                {{ data.relay.nextPlayer ? data.relay.nextPlayer.name : '无（本队最后一位）' }}
              </el-descriptions-item>
            </el-descriptions>
          </div>

          <el-alert
            v-if="!data.allowViewAnswer"
            type="info"
            :closable="false"
            show-icon
            class="tip-alert"
            title="管理员尚未开启查看答案，仅显示总分与排名。"
          />
        </template>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, TrendCharts, Notebook } from '@element-plus/icons-vue';
import { examApi } from '@/api';
import { formatDuration } from '@/utils/format';

const route = useRoute();
const router = useRouter();
const stageId = route.params.id;

const loading = ref(false);
const data = ref(null);

async function load() {
  loading.value = true;
  try {
    data.value = await examApi.result(stageId);
  } catch (e) {
    /* 拦截器已提示 */
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.result-hero {
  text-align: center;
  padding: 36px 20px;
  margin-bottom: var(--sp);
  background: linear-gradient(180deg, #FBFCFE 0%, #FFFFFF 100%);
}

.hero-label {
  font-size: 13px;
  color: var(--c-text-sub);
  margin-bottom: 8px;
}

.hero-score {
  font-size: 56px;
  font-weight: 600;
  color: var(--c-primary);
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.hero-meta {
  margin-top: 14px;
  color: var(--c-text-sub);
  font-size: 14px;
}

.divider {
  margin: 0 10px;
}

.result-actions {
  display: flex;
  gap: var(--sp-tight);
  justify-content: center;
  margin-bottom: var(--sp);
  flex-wrap: wrap;
}

.relay-card {
  margin-bottom: var(--sp);
}

.section-title {
  font-size: 16px;
  color: var(--c-primary);
  margin: 0 0 14px;
}

.tip-alert {
  border-radius: var(--r-btn);
}
</style>
