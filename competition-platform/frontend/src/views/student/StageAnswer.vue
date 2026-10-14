<template>
  <div class="page">
    <div class="exam-shell" v-loading="loading">
      <!-- 顶部：环节名称、倒计时、题号 (project.md 7.1 步骤4) -->
      <div class="exam-topbar app-card">
        <div class="topbar-left">
          <div class="stage-title">{{ exam?.stage?.name }}</div>
          <div class="text-sub">
            <span v-if="exam?.relay?.active">第 {{ exam.relay.playerIndex }} 位队员作答</span>
            <span v-else>{{ exam?.stage?.mode === 'team' ? '团队协作' : '个人独立' }}</span>
          </div>
        </div>

        <div class="topbar-center">
          <div class="timer" :class="{ 'timer-urgent': remaining <= 60 }">
            <el-icon :size="18"><Clock /></el-icon>
            <span>{{ formatDuration(remaining) }}</span>
          </div>
          <div class="progress-text">{{ currentIndex + 1 }} / {{ questions.length }}</div>
        </div>

        <div class="topbar-right">
          <el-tag v-if="switchCount > 0" type="danger" effect="plain" size="small">
            切屏 {{ switchCount }} 次
          </el-tag>
        </div>
      </div>

      <el-progress :percentage="progressPercent" :show-text="false" :stroke-width="4" class="exam-progress" />

      <!-- 主体：左侧答题区 + 右侧实时排行榜 (project.md 7.1) -->
      <div class="exam-body">
        <div class="exam-main">
      <!-- 中部：题干与选项 -->
      <div v-if="currentQuestion" class="app-card question-card">
        <div class="question-head">
          <el-tag size="small" effect="plain">{{ typeLabel(currentQuestion.type) }}</el-tag>
          <span class="text-sub">本题 {{ currentQuestion.score }} 分</span>
          <el-tag v-if="currentQuestion.module" size="small" type="info" effect="plain">{{ currentQuestion.module }}</el-tag>
        </div>

        <div class="question-content">{{ currentQuestion.content }}</div>

        <div class="options">
          <div
            v-for="opt in currentQuestion.options"
            :key="opt.letter"
            class="option-item"
            :class="{ 'is-selected': isSelected(opt.letter) }"
            @click="selectOption(opt.letter)"
          >
            <span class="option-letter">{{ opt.letter }}</span>
            <span class="option-text">{{ opt.text }}</span>
          </div>
        </div>

        <!-- 提交后即时反馈 (7.1 步骤5，仅管理员开启允许查看答案时) -->
        <el-alert
          v-if="feedback"
          :type="feedback.isCorrect === 1 ? 'success' : 'error'"
          :closable="false"
          show-icon
          class="feedback-alert"
          :title="feedback.isCorrect === 1 ? ('回答正确 +' + feedback.scoreDelta + ' 分') : (feedback.isCorrect === 0 ? ('回答错误 ' + feedback.scoreDelta + ' 分') : '未作答')"
        >
          <div v-if="feedback.correctAnswer" class="feedback-detail">
            <div>正确答案：{{ feedback.correctAnswer }}</div>
            <div v-if="feedback.analysis">解析：{{ feedback.analysis }}</div>
          </div>
        </el-alert>
      </div>

      <!-- 底部：上一题/下一题/跳题/提交 (7.1 步骤4) -->
      <div class="exam-bottombar app-card">
        <el-button :disabled="currentIndex === 0 || !allowReturn" :icon="ArrowLeft" @click="go(-1)">上一题</el-button>
        <el-button v-if="allowSkip" :icon="DArrowRight" @click="go(1)">跳题</el-button>
        <div class="bottombar-spacer"></div>
        <!-- 点击「下一题」时自动提交当前题目 -->
        <el-button v-if="!isLast" type="primary" :loading="submitting" @click="nextQuestion">下一题</el-button>
        <el-button type="primary" :icon="Check" @click="confirmSubmit">交卷</el-button>
      </div>

      <!-- 答题卡 -->
      <div class="app-card card-sheet">
        <div class="sheet-title">答题卡</div>
        <div class="sheet-grid">
          <div
            v-for="(q, i) in questions"
            :key="q.questionId"
            class="sheet-item"
            :class="{
              'is-current': i === currentIndex,
              'is-answered': !!answers[q.questionId],
              'is-locked': !allowReturn && i < currentIndex
            }"
            @click="jump(i)"
          >{{ i + 1 }}</div>
        </div>
      </div>
        </div>

        <!-- 右侧：实时排行榜 -->
        <aside class="app-card exam-rank">
          <div class="rank-head">
            <span class="rank-title">实时排行榜</span>
            <span class="rank-live" :class="{ 'is-live': rankConnected }">
              <i class="dot"></i>{{ rankConnected ? '实时' : '连接中' }}
            </span>
          </div>

          <div class="rank-cols">
            <span class="col-rank">名次</span>
            <span class="col-name">{{ isTeamMode ? '队伍' : '选手' }}</span>
            <span class="col-score">得分</span>
          </div>

          <div class="rank-list">
            <div
              v-for="(row, i) in rankList"
              :key="row.teamId ?? row.studentId ?? i"
              class="rank-row"
              :class="[
                'rank-row-' + (i + 1),
                { 'is-me': isSelf(row), 'row-updated': updatedKeys.has(String(row.teamId ?? row.studentId)) }
              ]"
            >
              <span class="col-rank">{{ i + 1 }}</span>
              <span class="col-name" :title="row.teamName || row.studentName">{{ row.teamName || row.studentName || '-' }}</span>
              <span class="col-score">{{ scoreOf(row) }}</span>
            </div>
            <div v-if="!rankList.length" class="rank-empty">暂无排名数据</div>
          </div>

          <div class="rank-foot">
            <span>我的得分</span>
            <strong>{{ myScore }}</strong>
          </div>
        </aside>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Clock, ArrowLeft, DArrowRight, Check } from '@element-plus/icons-vue';
import { examApi, rankApi } from '@/api';
import { getToken, getUser } from '@/api/http';
import { formatDuration, QUESTION_TYPE_LABEL } from '@/utils/format';
import { useAntiCheat } from '@/utils/useAntiCheat';

const route = useRoute();
const router = useRouter();
const stageId = route.params.id;

// 防复制 + 切屏检测 (project.md 7.4 / 7.5)
const { switchCount } = useAntiCheat(stageId);

const loading = ref(false);
const exam = ref(null);
const questions = ref([]);
const currentIndex = ref(0);
const answers = ref({});
const feedback = ref(null);
const remaining = ref(0);
const submitting = ref(false);

// 实时排行榜 (project.md 8.2)
// 已成功提交到服务端的题目（用于交卷前补交未提交的答案）
const submittedIds = ref(new Set());

const rankList = ref([]);
const rankConnected = ref(false);
const myScore = ref(0);
const updatedKeys = ref(new Set());
let rankSource = null;

let timer = null;

const isTeamMode = computed(() => exam.value?.stage?.mode === 'team');
const myUser = getUser() || {};

/** 判断某一行是否是当前登录者（队伍或本人） */
function isSelf(row) {
  if (isTeamMode.value) return String(row.teamId) === String(myUser.teamId);
  return String(row.studentId) === String(myUser.studentId);
}

/** 后端返回的得分字段为 totalScore */
function scoreOf(row) {
  return Number(row.totalScore ?? row.score ?? 0);
}

/** 计算当前登录者在本环节的得分 */
function refreshMyScore() {
  const me = rankList.value.find((r) => isSelf(r));
  myScore.value = me ? scoreOf(me) : 0;
}

/** 排行榜变化时高亮对应行 */
function markUpdated(rows) {
  const next = new Set();
  rows.forEach((r) => next.add(String(r.teamId ?? r.studentId)));
  updatedKeys.value = next;
  setTimeout(() => {
    updatedKeys.value = new Set();
  }, 1200);
}

/** 当前环节应看的榜单：团队环节看队伍总榜，个人环节看个人榜 */
function currentBoard() {
  return isTeamMode.value ? 'team' : 'individual';
}

/** 建立 SSE 连接，答题期间实时刷新排行榜 */
function connectRankStream() {
  const token = getToken();
  if (!token) return;
  const url = '/api/rank/stream?stageId=' + encodeURIComponent(stageId)
    + '&board=' + currentBoard()
    + '&token=' + encodeURIComponent(token);
  rankSource = new EventSource(url);

  rankSource.addEventListener('open', () => {
    rankConnected.value = true;
  });

  rankSource.addEventListener('rank', (ev) => {
    try {
      const payload = JSON.parse(ev.data);
      // 后端推送结构: { stageId, individual, list, updatedAt }
      const rows = payload.list || payload.ranking || [];
      markUpdated(rows);
      rankList.value = rows;
      refreshMyScore();
    } catch (e) {
      /* 忽略单次解析异常 */
    }
  });

  rankSource.addEventListener('error', () => {
    rankConnected.value = false;
    // EventSource 会自动重连，此处不主动关闭
  });
}

function closeRankStream() {
  if (rankSource) {
    rankSource.close();
    rankSource = null;
  }
  rankConnected.value = false;
}

const currentQuestion = computed(() => questions.value[currentIndex.value] || null);
const isLast = computed(() => currentIndex.value >= questions.value.length - 1);
const allowSkip = computed(() => exam.value?.allowSkip !== false);
const allowReturn = computed(() => exam.value?.allowReturn === true);

const progressPercent = computed(() =>
  questions.value.length ? Math.round(((currentIndex.value + 1) / questions.value.length) * 100) : 0
);

function typeLabel(t) {
  return QUESTION_TYPE_LABEL[t] || '题目';
}

function isSelected(letter) {
  const q = currentQuestion.value;
  if (!q) return false;
  const ans = answers.value[q.questionId] || '';
  return ans.includes(letter);
}

/** 单选/判断互斥，多选可累加 (7.1 中部) */
function selectOption(letter) {
  const q = currentQuestion.value;
  if (!q) return;

  const prev = answers.value[q.questionId] || '';
  if (q.type === 2) {
    const set = new Set(prev.split(''));
    if (set.has(letter)) set.delete(letter);
    else set.add(letter);
    answers.value[q.questionId] = [...set].sort().join('');
  } else {
    answers.value[q.questionId] = letter;
  }

  feedback.value = null;
  // 注意：选中选项不自动提交，必须由用户点击「下一题」或「提交本题」确认，
  // 避免误触导致直接锁定答案。
}

async function submitCurrent() {
  const q = currentQuestion.value;
  if (!q) return;
  const ans = answers.value[q.questionId];
  if (!ans) return;

  try {
    submitting.value = true;
    const res = await examApi.answer(stageId, {
      questionId: q.questionId,
      answer: ans,
      timeSpent: elapsedForCurrent()
    });
    feedback.value = res;
    submittedIds.value.add(q.questionId);
    // 提交后立即拉取一次最新排名，无需等待下一个推送周期
    await refreshRankOnce();
  } catch (e) {
    /* 拦截器已提示 */
  } finally {
    submitting.value = false;
  }
}

/** 主动拉取一次排行榜快照（提交答案后立即刷新） */
async function refreshRankOnce() {
  try {
    const rows = await rankApi.snapshot(stageId, currentBoard());
    const list = Array.isArray(rows) ? rows : (rows.list || rows.ranking || []);
    markUpdated(list);
    rankList.value = list;
    refreshMyScore();
  } catch (e) {
    /* 排行榜失败不影响答题 */
  }
}

function go(delta) {
  const next = currentIndex.value + delta;
  if (next < 0) return;
  if (next >= questions.value.length) return;
  // 不允许返回时只能前进
  if (delta < 0 && !allowReturn.value) {
    ElMessage.warning('本环节不允许返回上一题');
    return;
  }
  feedback.value = null;
  currentIndex.value = next;
  markQuestionStart();
}

/**
 * 点击「下一题」：先提交当前题目，再前进。
 * 未作答时直接前进（不提交）。
 */
async function nextQuestion() {
  const q = currentQuestion.value;
  const ans = q ? answers.value[q.questionId] : '';
  if (q && ans) await submitCurrent();
  if (currentIndex.value < questions.value.length - 1) {
    feedback.value = null;
    currentIndex.value += 1;
    markQuestionStart();
  }
}

/** 跳转前先提交当前题目，保证作答不丢失 */
async function commitCurrent() {
  const q = currentQuestion.value;
  const ans = q ? answers.value[q.questionId] : '';
  if (q && ans && !feedback.value) await submitCurrent();
}

async function jump(i) {
  if (i === currentIndex.value) return;

  if (!allowReturn.value) {
    // 不允许返回：禁止跳到任何已做过的题（即往前跳），只能向后跳。
    // 之前只弹确认框，用户点「确定」仍能回到上一题，与配置不符。
    if (i < currentIndex.value) {
      ElMessage.warning('本环节不允许返回上一题');
      return;
    }

    // 向后跳题同样不可逆，先弹窗确认，防止误触
    try {
      await ElMessageBox.confirm(
        '本环节不允许返回，跳转到第 ' + (i + 1) + ' 题后将无法回到当前题目，确定继续吗？',
        '确认跳转',
        { type: 'warning', confirmButtonText: '确定跳转', cancelButtonText: '取消' }
      );
    } catch (e) {
      return; // 用户取消，停留在当前题
    }
  }

  await commitCurrent();
  feedback.value = null;
  currentIndex.value = i;
  markQuestionStart();
}

async function confirmSubmit() {
  const unanswered = questions.value.filter((q) => !answers.value[q.questionId]).length;
  const msg = unanswered > 0
    ? '还有 ' + unanswered + ' 题未作答，确认交卷？未作答题目将按环节规则计分。'
    : '确认提交本环节答卷？';

  try {
    await ElMessageBox.confirm(msg, '交卷确认', { type: 'warning', confirmButtonText: '确认交卷', cancelButtonText: '继续答题' });
  } catch (e) {
    return;
  }
  await doSubmit();
}

/**
 * 收集「已选择但未提交」的题目。
 *
 * 选中选项不会自动提交（避免误触锁定），因此最后一题选完没点「下一题」
 * 就交卷时，答案会丢失并被判为未作答。
 * 这里既尝试逐题补交，也会把清单随交卷请求一起发送——
 * 倒计时到点那一刻的提交会被服务端以 403 拒绝，只有随交卷请求发送才兜得住。
 */
function collectPendingAnswers() {
  const elapsed = Math.max(1, Math.round((Date.now() - questionStartedAt.value) / 1000));
  return questions.value
    .filter((q) => answers.value[q.questionId] && !submittedIds.value.has(q.questionId))
    .map((q) => ({ questionId: q.questionId, answer: answers.value[q.questionId], timeSpent: elapsed }));
}

/** 尽力逐题补交；失败不阻断交卷（交卷请求里还会再带一次） */
async function flushPendingAnswers(pending) {
  for (const p of pending) {
    try {
      await examApi.answer(stageId, p);
      submittedIds.value.add(p.questionId);
    } catch (e) {
      /* 超时被拒属正常，交卷时会补记 */
    }
  }
  return pending.length;
}

async function doSubmit(auto = false) {
  if (submitting.value) return;
  submitting.value = true;
  try {
    // 先收集并尽力补交已选择但未提交的答案，避免被判未作答
    const pending = collectPendingAnswers();
    await flushPendingAnswers(pending);

    // 用时交由服务端按 stage_attempts.started_at 计算；
    // pendingAnswers 随交卷请求发送，兜住"超时导致单题提交被拒"的情况。
    const res = await examApi.submit(stageId, { pendingAnswers: pending });
    if (timer) clearInterval(timer);

    // 接力模式：提示下一位队员 (7.2)
    if (res.relay && res.relay.nextPlayer) {
      await ElMessageBox.alert(
        '第 ' + res.relay.playerIndex + ' 位队员已完成，节余 ' + formatDuration(res.relay.remaining) +
        '。请下一位队员 ' + res.relay.nextPlayer.name + ' 登录继续作答。',
        '接力完成',
        { confirmButtonText: '查看成绩', type: 'success' }
      );
    } else {
      ElMessage.success(auto ? '时间到，已自动交卷' : '交卷成功');
    }
    router.push('/stage/' + stageId + '/result');
  } catch (e) {
    /* 拦截器已提示 */
  } finally {
    submitting.value = false;
  }
}

const totalTimeLimit = ref(0);

/**
 * 每题实际用时（秒）。
 * 以墙上时钟为准，而不是每秒自减的计数器 —— 计数器在后台标签页会被
 * 浏览器降频，导致记录的时间远小于真实用时。
 */
const questionStartedAt = ref(Date.now());

/** 开始/重置当前题的计时起点 */
function markQuestionStart() {
  questionStartedAt.value = Date.now();
}

/** 当前题已用秒数（至少 1 秒，避免出现 0） */
function elapsedForCurrent() {
  return Math.max(1, Math.round((Date.now() - questionStartedAt.value) / 1000));
}

/** 交卷截止时刻（墙上时钟），比每秒自减更可靠 */
let deadlineAt = 0;

/**
 * 倒计时以「截止时刻」为准，而不是每秒自减计数器。
 * 自减计数器在后台标签页会被浏览器降频，导致：
 *   - 界面显示的时间比真实剩余时间多（用户以为还有 1 分钟，服务端已到点）
 *   - 用时统计偏小
 * 这里每秒用 Date.now() 重算剩余，标签页恢复时立即校正。
 */
function startTimer(seconds) {
  totalTimeLimit.value = seconds;
  remaining.value = seconds;
  deadlineAt = Date.now() + seconds * 1000;
  markQuestionStart();
  if (timer) clearInterval(timer);

  const tick = () => {
    const left = Math.max(0, Math.round((deadlineAt - Date.now()) / 1000));
    remaining.value = left;
    if (left <= 0) {
      clearInterval(timer);
      timer = null;
      ElMessage.warning('答题时间已结束，系统自动交卷');
      doSubmit(true);
    }
  };

  timer = setInterval(tick, 1000);
  tick();
}

/** 当前已用秒数（供展示与补交使用） */
function elapsedSeconds() {
  return Math.max(0, Math.round((Date.now() - (deadlineAt - totalTimeLimit.value * 1000)) / 1000));
}

async function load() {
  loading.value = true;
  try {
    const data = await examApi.start(stageId);
    exam.value = data;
    questions.value = data.questions || [];

    // 恢复已作答内容
    const map = {};
    const done = new Set();
    questions.value.forEach((q) => {
      if (q.userAnswer) {
        map[q.questionId] = q.userAnswer;
        done.add(q.questionId);
      }
    });
    answers.value = map;
    submittedIds.value = done;

    startTimer(data.availableTime || 600);
    markQuestionStart();
  } catch (e) {
    setTimeout(() => router.push('/stage/' + stageId + '/ready'), 900);
  } finally {
    loading.value = false;
  }
}

// 离开页面前提醒
function beforeUnload(e) {
  if (submitting.value) return;
  e.preventDefault();
  e.returnValue = '';
}

onMounted(async () => {
  await load();
  // 必须等 load() 拿到 stage.mode 后再订阅，否则团队环节会订到个人榜
  connectRankStream();
  window.addEventListener('beforeunload', beforeUnload);
});

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
  closeRankStream();
  window.removeEventListener('beforeunload', beforeUnload);
});
</script>

<style scoped>
/* 主体两栏布局：左侧答题区，右侧实时排行榜 */
.exam-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: var(--sp);
  align-items: start;
}

.exam-main {
  min-width: 0;
}

.exam-rank {
  padding: 16px;
  position: sticky;
  top: 16px;
  max-height: calc(100vh - 32px);
  display: flex;
  flex-direction: column;
}

.rank-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.rank-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--c-primary);
}

.rank-live {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--c-text-sub);
}

.rank-live .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--c-border);
}

.rank-live.is-live .dot {
  background: var(--c-primary-2);
}

.rank-cols,
.rank-row {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) 56px;
  align-items: center;
  gap: 8px;
}

.rank-cols {
  font-size: 12px;
  color: var(--c-text-sub);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--c-border);
}

.col-score {
  text-align: right;
}

.rank-list {
  overflow-y: auto;
  flex: 1;
  min-height: 120px;
}

.rank-row {
  padding: 9px 8px;
  border-radius: var(--r-tag);
  font-size: 13px;
  color: var(--c-text);
  transition: background-color 0.25s ease;
}

.rank-row .col-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rank-row .col-rank {
  color: var(--c-text-sub);
  font-weight: 600;
}

.rank-row .col-score {
  font-weight: 600;
  color: var(--c-primary);
}

.rank-row.is-me {
  background: var(--c-selected);
}

.rank-empty {
  padding: 24px 0;
  text-align: center;
  font-size: 13px;
  color: var(--c-text-sub);
}

.rank-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--c-border);
  font-size: 13px;
  color: var(--c-text-sub);
}

.rank-foot strong {
  font-size: 18px;
  font-weight: 600;
  color: var(--c-primary-2);
}

@media (max-width: 1100px) {
  .exam-body {
    grid-template-columns: minmax(0, 1fr);
  }
  .exam-rank {
    position: static;
    max-height: 320px;
  }
}

.exam-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp);
  margin-bottom: 12px;
  padding: 14px 20px;
}

.topbar-left {
  flex: 1;
  min-width: 0;
}

.stage-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--c-primary);
}

.topbar-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.timer {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 20px;
  font-weight: 600;
  color: var(--c-primary);
  font-variant-numeric: tabular-nums;
}

.timer-urgent {
  color: var(--c-danger);
}

.progress-text {
  font-size: 12px;
  color: var(--c-text-sub);
}

.topbar-right {
  flex: 1;
  display: flex;
  justify-content: flex-end;
}

.exam-progress {
  margin-bottom: var(--sp);
}

.question-card {
  margin-bottom: var(--sp);
}

.question-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.options {
  margin-top: 6px;
}

.option-text {
  flex: 1;
  line-height: 1.7;
}

.feedback-alert {
  margin-top: 14px;
  border-radius: var(--r-btn);
}

.feedback-detail {
  margin-top: 6px;
  line-height: 1.8;
}

.exam-bottombar {
  display: flex;
  align-items: center;
  gap: var(--sp-tight);
  margin-bottom: var(--sp);
  padding: 14px 20px;
}

.bottombar-spacer {
  flex: 1;
}

.card-sheet {
  margin-bottom: var(--sp-page);
}

.sheet-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--c-text);
}

.sheet-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-tight);
}

.sheet-item.is-locked {
  opacity: 0.45;
  cursor: not-allowed;
}

.sheet-item {
  width: 36px;
  height: 36px;
  line-height: 34px;
  text-align: center;
  border: 1px solid var(--c-border);
  border-radius: var(--r-input);
  cursor: pointer;
  font-size: 13px;
  background: var(--c-bg);
  transition: all 0.15s;
}

.sheet-item:hover {
  border-color: var(--c-primary-2);
}

.sheet-item.is-answered {
  background: var(--c-selected);
  border-color: var(--c-primary-2);
  color: var(--c-primary);
  font-weight: 600;
}

.sheet-item.is-current {
  background: var(--c-primary);
  border-color: var(--c-primary);
  color: #FFFFFF;
  font-weight: 600;
}
</style>
