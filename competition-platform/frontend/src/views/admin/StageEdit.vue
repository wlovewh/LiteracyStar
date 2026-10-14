<template>
  <div v-loading="loading">
    <div class="page-header">
      <div>
        <h2 class="page-title">{{ isNew ? '新建环节' : '编辑环节' }}</h2>
        <p class="text-sub form-sub">配置环节的题目、分值、时间与特殊规则（project.md 4.1）</p>
      </div>
      <div class="toolbar">
        <el-button :icon="ArrowLeft" @click="goBack">返回</el-button>
        <el-button type="primary" :icon="Check" :loading="saving" @click="handleSave">保存</el-button>
      </div>
    </div>

    <el-form ref="formRef" :model="form" :rules="rules" label-width="140px">
      <!-- 基本信息 -->
      <div class="app-card form-card">
        <h3 class="section-title">基本信息</h3>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="环节名称" prop="name">
              <el-input v-model="form.name" placeholder="请输入环节名称" maxlength="100" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="答题模式">
              <el-radio-group v-model="form.config.mode">
                <el-radio label="individual">个人独立</el-radio>
                <el-radio label="team">团队协作</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="允许查看答案">
          <el-switch v-model="form.config.allowViewAnswer" />
          <span class="field-hint">开启后学生完成环节可查看错题及解析（project.md 9.1）</span>
        </el-form-item>
      </div>

      <!-- 题目配置 -->
      <div class="app-card form-card">
        <h3 class="section-title">题目配置</h3>
        <el-row :gutter="20">
          <el-col :span="6">
            <el-form-item label="单选题数量">
              <el-input-number v-model="form.config.questionConfig.single" :min="0" :max="200" controls-position="right" />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="多选题数量">
              <el-input-number v-model="form.config.questionConfig.multiple" :min="0" :max="200" controls-position="right" />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="判断题数量">
              <el-input-number v-model="form.config.questionConfig.judge" :min="0" :max="200" controls-position="right" />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="选项乱序">
              <el-switch v-model="form.config.questionConfig.shuffleOptions" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider content-position="left">组卷策略（project.md 5.4）</el-divider>
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="组卷方式">
              <el-radio-group v-model="form.config.paperStrategy">
                <el-radio label="random">随机抽题</el-radio>
                <el-radio label="fixed">固定试卷</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="知识模块筛选">
              <el-select v-model="form.config.moduleFilter" multiple filterable allow-create default-first-option placeholder="不限" style="width: 100%">
                <el-option v-for="m in facets.modules" :key="m" :label="m" :value="m" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="难度筛选">
              <el-select v-model="form.config.difficultyFilter" multiple placeholder="不限" style="width: 100%">
                <el-option v-for="d in [1,2,3,4,5]" :key="d" :label="'难度 ' + d" :value="d" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item v-if="form.config.paperStrategy === 'fixed'" label="指定题目ID">
          <el-select v-model="form.config.fixedQuestionIds" multiple filterable remote :remote-method="searchQuestions" placeholder="搜索并选择题目" style="width: 100%">
            <el-option v-for="q in questionOptions" :key="q.id" :label="'#' + q.id + ' ' + q.content.slice(0, 40)" :value="q.id" />
          </el-select>
        </el-form-item>
      </div>

      <!-- 分值配置 -->
      <div class="app-card form-card">
        <h3 class="section-title">分值配置</h3>
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="单选每题分值">
              <el-input-number v-model="form.config.scoreConfig.singleScore" :min="0" :step="0.5" :precision="1" controls-position="right" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="多选每题分值">
              <el-input-number v-model="form.config.scoreConfig.multipleScore" :min="0" :step="0.5" :precision="1" controls-position="right" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="判断每题分值">
              <el-input-number v-model="form.config.scoreConfig.judgeScore" :min="0" :step="0.5" :precision="1" controls-position="right" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider content-position="left">扣分规则</el-divider>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="答错扣分">
              <el-switch v-model="form.config.scoreConfig.wrongDeduct" />
              <el-input-number v-if="form.config.scoreConfig.wrongDeduct" v-model="form.config.scoreConfig.wrongDeductScore" :min="0" :step="0.5" :precision="1" controls-position="right" class="inline-num" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="不答扣分">
              <el-switch v-model="form.config.scoreConfig.unansweredDeduct" />
              <el-input-number v-if="form.config.scoreConfig.unansweredDeduct" v-model="form.config.scoreConfig.unansweredDeductScore" :min="0" :step="0.5" :precision="1" controls-position="right" class="inline-num" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="已打开未提交扣分">
              <el-switch v-model="form.config.scoreConfig.openedNotSubmitDeduct" />
              <el-input-number v-if="form.config.scoreConfig.openedNotSubmitDeduct" v-model="form.config.scoreConfig.openedNotSubmitDeductScore" :min="0" :step="0.5" :precision="1" controls-position="right" class="inline-num" />
            </el-form-item>
          </el-col>
        </el-row>
        <p class="field-hint hint-block">提示：扣分分值留空表示"扣对应分值"（即该题满分）。</p>
      </div>

      <!-- 时间配置 -->
      <div class="app-card form-card">
        <h3 class="section-title">时间配置</h3>
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="总时限（秒）">
              <el-input-number v-model="form.config.timeConfig.totalTime" :min="0" :step="60" controls-position="right" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="单题时限（秒）">
              <el-input-number v-model="form.config.timeConfig.perQuestionTime" :min="0" :step="10" controls-position="right" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="每人基础时间（秒）">
              <el-input-number v-model="form.config.timeConfig.baseTimePerPlayer" :min="0" :step="60" controls-position="right" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="速度排名">
              <el-switch v-model="form.config.timeConfig.speedRanking" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="速度排名百分比">
              <el-input-number v-model="form.config.timeConfig.speedRankingPercent" :min="1" :max="100" controls-position="right" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="奇数进位取整">
              <el-switch v-model="form.config.timeConfig.speedRankingRoundUp" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="抢答候时（秒）">
              <el-input-number v-model="form.config.timeConfig.buzzerWaitTime" :min="0" :step="1" controls-position="right" />
            </el-form-item>
          </el-col>
        </el-row>
      </div>

      <!-- 特殊配置 -->
      <div class="app-card form-card">
        <h3 class="section-title">特殊配置</h3>
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="时间累加（接力）">
              <el-switch v-model="form.config.specialConfig.timeAccumulate" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="前段队员不扣分">
              <el-switch v-model="form.config.specialConfig.firstPlayersNoDeduct" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="允许跳题">
              <el-switch v-model="form.config.specialConfig.allowSkip" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="允许返回">
              <el-switch v-model="form.config.specialConfig.allowReturn" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="每人试题不同">
              <el-switch v-model="form.config.specialConfig.questionDifferent" />
            </el-form-item>
          </el-col>
        </el-row>

        <!-- 接力模式：每人题目配置 (project.md 4.2 环节5) -->
        <template v-if="form.config.specialConfig.timeAccumulate">
          <el-divider content-position="left">接力题目配置（每位队员的题目数量）</el-divider>
          <el-table :data="form.config.questionConfig.relayPlan" size="small">
            <el-table-column label="队员序号" width="100" align="center">
              <template #default="{ row }">第 {{ row.index }} 名</template>
            </el-table-column>
            <el-table-column label="单选题">
              <template #default="{ row }"><el-input-number v-model="row.single" :min="0" size="small" controls-position="right" /></template>
            </el-table-column>
            <el-table-column label="多选题">
              <template #default="{ row }"><el-input-number v-model="row.multiple" :min="0" size="small" controls-position="right" /></template>
            </el-table-column>
            <el-table-column label="判断题">
              <template #default="{ row }"><el-input-number v-model="row.judge" :min="0" size="small" controls-position="right" /></template>
            </el-table-column>
            <el-table-column label="小计" width="80" align="center">
              <template #default="{ row }">{{ row.single + row.multiple + row.judge }}</template>
            </el-table-column>
          </el-table>
        </template>

        <el-alert
          v-if="form.config.specialConfig.timeAccumulate && !form.config.questionConfig.relay"
          type="info"
          :closable="false"
          show-icon
          class="mode-alert"
          title="提示：保存时将自动启用接力模式，题目数量以上表为准。"
        />
      </div>
    </el-form>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ArrowLeft, Check } from '@element-plus/icons-vue';
import { eventApi, stageApi, questionApi } from '@/api';

const route = useRoute();
const router = useRouter();

const isNew = computed(() => route.params.id === 'new');
const stageId = computed(() => route.params.id);
const eventId = computed(() => route.query.eventId || null);

const loading = ref(false);
const saving = ref(false);
const formRef = ref();
const facets = reactive({ modules: [] });
const questionOptions = ref([]);

const defaultConfig = () => ({
  mode: 'individual',
  questionConfig: { single: 6, multiple: 2, judge: 2, shuffleOptions: true, relay: false, relayPlan: [
    { index: 1, single: 3, multiple: 1, judge: 1 },
    { index: 2, single: 3, multiple: 1, judge: 1 },
    { index: 3, single: 4, multiple: 3, judge: 3 }
  ] },
  scoreConfig: {
    singleScore: 2, multipleScore: 4, judgeScore: 1,
    wrongDeduct: true, wrongDeductScore: 1,
    unansweredDeduct: false, unansweredDeductScore: 0,
    openedNotSubmitDeduct: false, openedNotSubmitDeductScore: 0
  },
  timeConfig: { totalTime: 600, perQuestionTime: 0, baseTimePerPlayer: 360, speedRanking: false, speedRankingPercent: 50, speedRankingRoundUp: false, buzzerWaitTime: 5 },
  specialConfig: { timeAccumulate: false, firstPlayersNoDeduct: false, allowSkip: true, allowReturn: false, questionDifferent: false },
  paperStrategy: 'random',
  moduleFilter: [],
  difficultyFilter: [],
  fixedQuestionIds: [],
  allowViewAnswer: false
});

const form = reactive({ name: '', config: defaultConfig() });

const rules = {
  name: [{ required: true, message: '请输入环节名称', trigger: 'blur' }]
};

async function searchQuestions(keyword) {
  if (!keyword) return;
  try {
    const data = await questionApi.list({ keyword, pageSize: 20 });
    questionOptions.value = data.list || [];
  } catch (e) {
    /* 拦截器已提示 */
  }
}

async function load() {
  loading.value = true;
  try {
    const f = await questionApi.facets();
    facets.modules = f.modules || [];

    if (!isNew.value) {
      const stage = await stageApi.get(stageId.value);
      form.name = stage.name;
      // 合并后端配置到默认结构，避免缺失字段
      const base = defaultConfig();
      form.config = {
        ...base,
        ...stage.config,
        questionConfig: { ...base.questionConfig, ...(stage.config.questionConfig || {}) },
        scoreConfig: { ...base.scoreConfig, ...(stage.config.scoreConfig || {}) },
        timeConfig: { ...base.timeConfig, ...(stage.config.timeConfig || {}) },
        specialConfig: { ...base.specialConfig, ...(stage.config.specialConfig || {}) }
      };
    }
  } catch (e) {
    /* 拦截器已提示 */
  } finally {
    loading.value = false;
  }
}

async function handleSave() {
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;

  // 时间累加即接力模式
  form.config.questionConfig.relay = form.config.specialConfig.timeAccumulate;

  saving.value = true;
  try {
    if (isNew.value) {
      await eventApi.createStage(eventId.value, { name: form.name, config: form.config });
      ElMessage.success('创建成功');
    } else {
      await stageApi.update(stageId.value, { name: form.name, config: form.config });
      ElMessage.success('保存成功');
    }
    goBack();
  } catch (e) {
    /* 拦截器已提示 */
  } finally {
    saving.value = false;
  }
}

function goBack() {
  if (eventId.value) router.push('/admin/events/' + eventId.value + '/stages');
  else router.back();
}

onMounted(load);
</script>

<style scoped>
.form-sub {
  margin: 6px 0 0;
}

.form-card {
  margin-bottom: var(--sp);
}

.section-title {
  font-size: 16px;
  color: var(--c-primary);
  margin: 0 0 18px;
}

.field-hint {
  margin-left: 12px;
  font-size: 12px;
  color: var(--c-text-sub);
}

.hint-block {
  margin: 0;
  display: block;
}

.inline-num {
  margin-left: 12px;
  width: 130px;
}

.mode-alert {
  margin-top: 12px;
  border-radius: var(--r-btn);
}
</style>
