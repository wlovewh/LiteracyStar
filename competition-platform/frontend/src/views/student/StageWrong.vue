<template>
  <div class="page">
    <div class="exam-shell" v-loading="loading">
      <div class="page-header">
        <h2 class="page-title">错题本 · {{ stageName }}</h2>
        <div class="toolbar">
          <el-button :icon="ArrowLeft" @click="router.push('/stage/' + stageId + '/result')">返回成绩</el-button>
        </div>
      </div>

      <template v-if="data">
        <!-- 管理员未开启查看答案 (project.md 9.2) -->
        <div v-if="!data.allowed" class="app-card">
          <el-empty :description="data.message || '管理员未开启查看答案'">
            <div class="score-brief">
              <div class="brief-item">
                <span class="stat-value">{{ data.totalScore }}</span>
                <span class="stat-label">总分</span>
              </div>
              <div class="brief-item">
                <span class="stat-value">{{ formatDuration(data.totalTime) }}</span>
                <span class="stat-label">用时</span>
              </div>
              <div class="brief-item">
                <span class="stat-value">{{ data.rank || '-' }}</span>
                <span class="stat-label">排名</span>
              </div>
            </div>
          </el-empty>
        </div>

        <template v-else>
          <div class="app-card summary-card">
            <div class="brief-item">
              <span class="stat-value">{{ data.totalScore }}</span>
              <span class="stat-label">总分</span>
            </div>
            <div class="brief-item">
              <span class="stat-value">{{ formatDuration(data.totalTime) }}</span>
              <span class="stat-label">用时</span>
            </div>
            <div class="brief-item">
              <span class="stat-value">{{ data.rank || '-' }}</span>
              <span class="stat-label">排名</span>
            </div>
            <div class="brief-item">
              <span class="stat-value">{{ data.wrong.length }}</span>
              <span class="stat-label">错题数</span>
            </div>
            <div v-if="skippedCount" class="brief-item">
              <span class="stat-value">{{ skippedCount }}</span>
              <span class="stat-label">未作答</span>
            </div>
          </div>

          <el-empty v-if="!data.wrong.length" description="恭喜，本环节没有错题，也没有跳过的题目" />

          <div v-for="(w, i) in data.wrong" :key="w.questionId" class="app-card wrong-card">
            <div class="wrong-head">
              <el-tag size="small" effect="plain">{{ typeLabel(w.type) }}</el-tag>
              <span class="wrong-index">第 {{ i + 1 }} 题</span>
              <el-tag v-if="w.module" size="small" type="info" effect="plain">{{ w.module }}</el-tag>
              <!-- 跳过的题目也要展示，并明确标出「未作答」以区别于答错 -->
              <el-tag v-if="w.skipped" size="small" type="warning" effect="plain">未作答</el-tag>
              <span class="wrong-delta">{{ w.scoreDelta }} 分</span>
            </div>

            <div class="question-content">{{ w.content }}</div>

            <div class="options">
              <div v-for="opt in w.options" :key="opt.letter" class="option-row" :class="optionClass(w, opt.letter)">
                <span class="option-letter">{{ opt.letter }}</span>
                <span class="option-text">{{ opt.text }}</span>
                <el-tag v-if="isCorrectOption(w, opt.letter)" size="small" type="primary" effect="plain">正确答案</el-tag>
                <el-tag v-if="isUserOption(w, opt.letter)" size="small" type="danger" effect="plain">你的选择</el-tag>
              </div>
            </div>

            <div class="answer-line">
              <span>你的答案：<b :class="w.userAnswer ? 'result-wrong' : 'text-sub'">{{ w.userAnswer || '未作答' }}</b></span>
              <span>正确答案：<b class="result-correct">{{ w.correctAnswer }}</b></span>
            </div>

            <div v-if="w.analysis" class="analysis-box">
              <div class="analysis-title">解析</div>
              <div class="analysis-text">{{ w.analysis }}</div>
            </div>
          </div>
        </template>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft } from '@element-plus/icons-vue';
import { examApi } from '@/api';
import { formatDuration, QUESTION_TYPE_LABEL } from '@/utils/format';

const route = useRoute();
const router = useRouter();
const stageId = route.params.id;

const loading = ref(false);
const data = ref(null);

const stageName = computed(() => data.value?.stage?.name || '错题回顾');

function typeLabel(t) {
  return QUESTION_TYPE_LABEL[t] || '题目';
}

/** 跳过的题目数量（未作答，与答错区分展示） */
const skippedCount = computed(() => (data.value?.wrong || []).filter((w) => w.skipped).length);

function isCorrectOption(w, letter) {
  return String(w.correctAnswer || '').includes(letter);
}

function isUserOption(w, letter) {
  return String(w.userAnswer || '').includes(letter);
}

function optionClass(w, letter) {
  return {
    'is-correct': isCorrectOption(w, letter),
    'is-user-wrong': isUserOption(w, letter) && !isCorrectOption(w, letter)
  };
}

async function load() {
  loading.value = true;
  try {
    data.value = await examApi.wrong(stageId);
  } catch (e) {
    setTimeout(() => router.push('/stage/' + stageId + '/result'), 900);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.summary-card {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--sp);
  text-align: center;
  margin-bottom: var(--sp);
}

.brief-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.score-brief {
  display: flex;
  gap: 40px;
  justify-content: center;
  margin-top: var(--sp);
}

.wrong-card {
  margin-bottom: var(--sp);
}

.wrong-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.wrong-index {
  font-size: 13px;
  color: var(--c-text-sub);
}

.wrong-delta {
  margin-left: auto;
  font-weight: 600;
  color: var(--c-danger);
}

.options {
  margin: 12px 0;
}

.option-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border: 1px solid var(--c-border);
  border-radius: var(--r-btn);
  margin-bottom: 8px;
}

.option-row.is-correct {
  border-color: var(--c-primary-2);
  background: var(--c-selected);
}

.option-row.is-user-wrong {
  border-color: var(--c-danger);
  background: #FDF3F2;
}

.option-text {
  flex: 1;
}

.answer-line {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
  padding-top: 12px;
  border-top: 1px solid var(--c-border);
  font-size: 14px;
}

.analysis-box {
  margin-top: 12px;
  padding: 14px;
  background: var(--c-bg-sub);
  border-radius: var(--r-btn);
}

.analysis-title {
  font-weight: 600;
  color: var(--c-primary);
  margin-bottom: 6px;
}

.analysis-text {
  line-height: 1.8;
  color: var(--c-text);
}

@media (max-width: 640px) {
  .summary-card {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
