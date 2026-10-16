'use strict';

/**
 * 环节配置 (project.md 3.2) 的默认值、归一化与校验。
 */

const QUESTION_TYPES = { SINGLE: 1, MULTIPLE: 2, JUDGE: 3 };
const TYPE_KEYS = { 1: 'single', 2: 'multiple', 3: 'judge' };

function defaultConfig() {
  return {
    mode: 'individual',
    questionConfig: {
      single: 6,
      multiple: 2,
      judge: 2,
      shuffleOptions: true,
      relay: false,
      relayPlan: []
    },
    scoreConfig: {
      singleScore: 2,
      multipleScore: 4,
      judgeScore: 1,
      wrongDeduct: true,
      wrongDeductScore: 1,
      unansweredDeduct: false,
      unansweredDeductScore: 0,
      openedNotSubmitDeduct: false,
      openedNotSubmitDeductScore: 0
    },
    timeConfig: {
      totalTime: 600,
      perQuestionTime: 0,
      baseTimePerPlayer: 360,
      speedRanking: false,
      speedRankingPercent: 50,
      speedRankingRoundUp: false,
      buzzerWaitTime: 5
    },
    specialConfig: {
      timeAccumulate: false,
      firstPlayersNoDeduct: false,
      allowSkip: true,
      allowReturn: false,
      questionDifferent: false
    },
    paperStrategy: 'random',
    moduleFilter: [],
    difficultyFilter: [],
    fixedQuestionIds: [],
    allowViewAnswer: false,
    buzzer: false,
    // 答题过程中「答题卡」旁展示的榜单：
    //   auto     跟随赛制（团队环节看队伍总榜，个人环节看个人榜）
    //   merged   固定展示队伍总榜（全队三人分数相加，一个队伍一行）
    //   separate 固定展示个人榜（每位队员一行）
    rankBoard: 'auto'
  };
}

function num(v, d) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}
function bool(v, d) {
  return typeof v === 'boolean' ? v : d;
}
function arr(v) {
  return Array.isArray(v) ? v : [];
}

/**
 * 将任意（可能不完整的）配置归一化为完整结构，缺失字段回落到默认值。
 * 这样前端只提交变更字段也不会破坏引擎。
 */
function normalizeConfig(raw) {
  const d = defaultConfig();
  const c = raw && typeof raw === 'object' ? raw : {};
  const q = c.questionConfig || {};
  const s = c.scoreConfig || {};
  const t = c.timeConfig || {};
  const sp = c.specialConfig || {};

  const cfg = {
    mode: c.mode === 'team' ? 'team' : 'individual',
    questionConfig: {
      single: Math.max(0, num(q.single, d.questionConfig.single)),
      multiple: Math.max(0, num(q.multiple, d.questionConfig.multiple)),
      judge: Math.max(0, num(q.judge, d.questionConfig.judge)),
      shuffleOptions: bool(q.shuffleOptions, d.questionConfig.shuffleOptions),
      relay: bool(q.relay, false),
      relayPlan: arr(q.relayPlan).map((p, i) => ({
        index: num(p.index, i + 1),
        single: Math.max(0, num(p.single, 0)),
        multiple: Math.max(0, num(p.multiple, 0)),
        judge: Math.max(0, num(p.judge, 0))
      }))
    },
    scoreConfig: {
      singleScore: num(s.singleScore, d.scoreConfig.singleScore),
      multipleScore: num(s.multipleScore, d.scoreConfig.multipleScore),
      judgeScore: num(s.judgeScore, d.scoreConfig.judgeScore),
      wrongDeduct: bool(s.wrongDeduct, d.scoreConfig.wrongDeduct),
      // null 表示"扣对应分值"，在计算时解析为该题满分
      wrongDeductScore: s.wrongDeductScore === null ? null : num(s.wrongDeductScore, d.scoreConfig.wrongDeductScore),
      unansweredDeduct: bool(s.unansweredDeduct, d.scoreConfig.unansweredDeduct),
      unansweredDeductScore: s.unansweredDeductScore === null ? null : num(s.unansweredDeductScore, d.scoreConfig.unansweredDeductScore),
      openedNotSubmitDeduct: bool(s.openedNotSubmitDeduct, d.scoreConfig.openedNotSubmitDeduct),
      openedNotSubmitDeductScore: s.openedNotSubmitDeductScore === null ? null : num(s.openedNotSubmitDeductScore, d.scoreConfig.openedNotSubmitDeductScore)
    },
    timeConfig: {
      totalTime: Math.max(0, num(t.totalTime, d.timeConfig.totalTime)),
      perQuestionTime: Math.max(0, num(t.perQuestionTime, d.timeConfig.perQuestionTime)),
      baseTimePerPlayer: Math.max(0, num(t.baseTimePerPlayer, d.timeConfig.baseTimePerPlayer)),
      speedRanking: bool(t.speedRanking, d.timeConfig.speedRanking),
      speedRankingPercent: Math.min(100, Math.max(1, num(t.speedRankingPercent, d.timeConfig.speedRankingPercent))),
      speedRankingRoundUp: bool(t.speedRankingRoundUp, d.timeConfig.speedRankingRoundUp),
      buzzerWaitTime: Math.max(0, num(t.buzzerWaitTime, d.timeConfig.buzzerWaitTime))
    },
    specialConfig: {
      timeAccumulate: bool(sp.timeAccumulate, d.specialConfig.timeAccumulate),
      firstPlayersNoDeduct: bool(sp.firstPlayersNoDeduct, d.specialConfig.firstPlayersNoDeduct),
      allowSkip: bool(sp.allowSkip, d.specialConfig.allowSkip),
      allowReturn: bool(sp.allowReturn, d.specialConfig.allowReturn),
      questionDifferent: bool(sp.questionDifferent, d.specialConfig.questionDifferent)
    },
    paperStrategy: c.paperStrategy === 'fixed' ? 'fixed' : 'random',
    moduleFilter: arr(c.moduleFilter).map(String),
    difficultyFilter: arr(c.difficultyFilter).map((x) => Number(x)).filter((x) => Number.isFinite(x)),
    fixedQuestionIds: arr(c.fixedQuestionIds).map((x) => Number(x)).filter((x) => Number.isFinite(x)),
    allowViewAnswer: bool(c.allowViewAnswer, false),
    buzzer: bool(c.buzzer, false),
    rankBoard: ['auto', 'merged', 'separate'].includes(c.rankBoard) ? c.rankBoard : 'auto'
  };

  // 抢答类环节统一打上标记
  if (cfg.timeConfig.perQuestionTime > 0 && cfg.timeConfig.speedRanking) cfg.buzzer = true;
  return cfg;
}

/** 该环节的题目总数（接力模式按 relayPlan 求和） */
function totalQuestionCount(cfg) {
  const q = cfg.questionConfig;
  if (q.relay && q.relayPlan.length) {
    return q.relayPlan.reduce((sum, p) => sum + p.single + p.multiple + p.judge, 0);
  }
  return q.single + q.multiple + q.judge;
}

/** 单题满分 */
function questionScore(cfg, type) {
  const s = cfg.scoreConfig;
  if (type === QUESTION_TYPES.SINGLE) return s.singleScore;
  if (type === QUESTION_TYPES.MULTIPLE) return s.multipleScore;
  return s.judgeScore;
}

/** 环节总分（不含扣分） */
function totalPossibleScore(cfg) {
  const q = cfg.questionConfig;
  if (q.relay && q.relayPlan.length) {
    return q.relayPlan.reduce(
      (sum, p) => sum + p.single * cfg.scoreConfig.singleScore + p.multiple * cfg.scoreConfig.multipleScore + p.judge * cfg.scoreConfig.judgeScore,
      0
    );
  }
  return (
    q.single * cfg.scoreConfig.singleScore +
    q.multiple * cfg.scoreConfig.multipleScore +
    q.judge * cfg.scoreConfig.judgeScore
  );
}

/**
 * 校验配置合法性，返回错误信息数组（空数组表示通过）。
 */
function validateConfig(cfg) {
  const errors = [];
  const q = cfg.questionConfig;
  if (q.relay && q.relayPlan.length === 0) {
    errors.push('接力模式必须配置 relayPlan（每人题目数量）');
  }
  if (!q.relay && totalQuestionCount(cfg) <= 0) {
    errors.push('题目数量不能为 0');
  }
  if (cfg.paperStrategy === 'fixed' && cfg.fixedQuestionIds.length === 0) {
    errors.push('固定试卷策略必须指定题目列表');
  }
  if (cfg.timeConfig.totalTime <= 0 && cfg.timeConfig.perQuestionTime <= 0) {
    errors.push('总时限与单题时限不能同时为 0');
  }
  const s = cfg.scoreConfig;
  for (const key of ['singleScore', 'multipleScore', 'judgeScore']) {
    if (s[key] < 0) errors.push(key + ' 不能为负数');
  }
  return errors;
}

/** 对外暴露给前端的环节摘要信息 */
function summarize(stage) {
  const cfg = normalizeConfig(stage.config);
  return {
    id: stage.id,
    eventId: stage.event_id,
    name: stage.name,
    sortOrder: stage.sort_order,
    status: stage.status,
    config: cfg,
    mode: cfg.mode,
    questionCount: totalQuestionCount(cfg),
    totalScore: totalPossibleScore(cfg),
    totalTime: cfg.timeConfig.totalTime,
    perQuestionTime: cfg.timeConfig.perQuestionTime,
    allowViewAnswer: cfg.allowViewAnswer,
    rankBoard: cfg.rankBoard
  };
}

module.exports = {
  QUESTION_TYPES,
  TYPE_KEYS,
  defaultConfig,
  normalizeConfig,
  totalQuestionCount,
  totalPossibleScore,
  questionScore,
  validateConfig,
  summarize
};
