'use strict';
const db = require('../config/db');
const { AppError } = require('../utils/response');
const cfgMod = require('../config/stageConfig');
const scoring = require('./scoringService');
const questionService = require('./questionService');
const rankService = require('./rankService');
const logger = require('../utils/logger');

const { OPTION_KEYS, OPTION_LETTERS } = questionService;

/** 题目实际存在的选项字母 */
function optionLetters(question) {
  return OPTION_LETTERS.filter((_, i) => {
    const key = OPTION_KEYS[i];
    const v = question[key];
    return v !== null && v !== undefined && String(v).trim() !== '';
  });
}

/** 生成选项乱序映射 { 原始字母: 展示字母 } */
function buildOptionMap(question, shuffle) {
  const letters = optionLetters(question);
  if (!shuffle || letters.length < 2) {
    const identity = {};
    letters.forEach((l) => { identity[l] = l; });
    return identity;
  }
  const shuffled = letters.slice();
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const map = {};
  letters.forEach((orig, idx) => { map[orig] = shuffled[idx]; });
  return map;
}

/**
 * 选项乱序映射 optionMap 的语义: { 原始字母: 展示字母 }
 * 例如 {A:'D', B:'C', C:'B', D:'A'} 表示原始选项 A 显示在位置 D。
 */

/** 原始答案字母 -> 展示字母（下发题目与错题本展示时使用） */
function mapAnswer(answer, optionMap) {
  if (!answer) return answer;
  const map = optionMap || {};
  return String(answer).toUpperCase().replace(/[^A-F]/g, '').split('').map((l) => map[l] || l).sort().join('');
}

/** 展示字母 -> 原始字母（学生提交答案时使用） */
function unmapAnswer(answer, optionMap) {
  if (!answer) return answer;
  const map = optionMap || {};
  const reverse = {};
  Object.keys(map).forEach((orig) => { reverse[map[orig]] = orig; });
  return String(answer).toUpperCase().replace(/[^A-F]/g, '').split('').map((l) => reverse[l] || l).sort().join('');
}

/**
 * 确定本次答题的试卷归属 key。
 *  - 团队模式：全队共用 'common'
 *  - 个人模式且 questionDifferent=false：每人共用 'common'
 *  - 个人模式且 questionDifferent=true：按学号区分
 *  - 接力模式：按队员序号区分
 */
function scopeKeyFor(cfg, ctx) {
  if (cfg.specialConfig.timeAccumulate) return String(ctx.playerIndex || 1);
  if (cfg.mode === 'team') return 'common';
  if (cfg.specialConfig.questionDifferent) return ctx.studentId;
  return 'common';
}

/** 该环节按当前配置应抽的题量（接力模式取当前队员的计划） */
function expectedCount(cfg, scopeKey) {
  const q = cfg.questionConfig;
  if (q.relay && q.relayPlan && q.relayPlan.length) {
    const plan = q.relayPlan.find((p) => p.index === Number(scopeKey)) || q.relayPlan[0];
    return Number(plan.single || 0) + Number(plan.multiple || 0) + Number(plan.judge || 0);
  }
  return Number(q.single || 0) + Number(q.multiple || 0) + Number(q.judge || 0);
}

/**
 * 判断已存在的试卷快照是否已失效。
 *
 * 失效场景：环节抽题数量被调整，或题库在生成快照之后才补充了大量题目
 * （典型情况：先用示例题库试跑，随后导入正式题库）。
 * 此时旧快照题量少于当前配置，若继续复用会导致每次进入都是同样几道题。
 *
 * 注意：仅在「题量不符」时重建。学生已开始作答的试卷若被重建，
 * 会导致已答题目与卷面不一致，因此下面还会结合答题记录判断。
 */
async function isSnapshotStale(stage, cfg, scopeKey, existingCount) {
  const want = expectedCount(cfg, scopeKey);
  if (want > 0 && existingCount < want) return true;

  // 配置改成固定试卷时，旧快照必然不符
  if (cfg.paperStrategy === 'fixed' && cfg.fixedQuestionIds && cfg.fixedQuestionIds.length) {
    const rows = await db.query(
      'SELECT question_id FROM stage_papers WHERE stage_id = ? AND scope_key = ?',
      [stage.id, scopeKey]
    );
    const have = new Set(rows.map((r) => Number(r.question_id)));
    const allIn = cfg.fixedQuestionIds.every((id) => have.has(Number(id)));
    if (!allIn) return true;
  }
  return false;
}

/** 读取或生成试卷快照 */
async function ensurePaper(stage, cfg, ctx) {
  const scopeKey = scopeKeyFor(cfg, ctx);

  const existing = await db.query(
    'SELECT question_id, sort_order, option_map FROM stage_papers WHERE stage_id = ? AND scope_key = ? ORDER BY sort_order ASC',
    [stage.id, scopeKey]
  );

  if (existing.length && (await isSnapshotStale(stage, cfg, scopeKey, existing.length))) {
    // 已有人作答则不动快照，避免卷面与答题记录错位；否则重建
    const answered = await db.queryOne(
      'SELECT COUNT(*) AS c FROM answers WHERE stage_id = ?',
      [stage.id]
    );
    if (!answered || Number(answered.c) === 0) {
      await db.execute('DELETE FROM stage_papers WHERE stage_id = ? AND scope_key = ?', [stage.id, scopeKey]);
      logger.info('试卷快照已过期（原 ' + existing.length + ' 题，应为 ' + expectedCount(cfg, scopeKey) + ' 题），已重新抽题: stage=' + stage.id + ' scope=' + scopeKey);
      existing.length = 0;
    }
  }

  if (existing.length) {
    const ids = existing.map((r) => r.question_id);
    const questions = await db.query('SELECT * FROM questions WHERE id IN (' + ids.map(() => '?').join(',') + ')', ids);
    const byId = new Map(questions.map((q) => [q.id, q]));
    return {
      scopeKey,
      items: existing
        .filter((r) => byId.has(r.question_id))
        .map((r) => ({ question: byId.get(r.question_id), optionMap: r.option_map || null, sortOrder: r.sort_order }))
    };
  }

  // 首次进入：抽题并持久化
  const picked = await questionService.pickQuestions(cfg, { scopeKey });
  if (!picked.length) {
    throw new AppError('题库中没有符合条件的题目，请联系管理员补充题库或调整环节筛选条件');
  }

  const items = [];
  await db.transaction(async (tx) => {
    for (let i = 0; i < picked.length; i += 1) {
      const q = picked[i];
      const optionMap = buildOptionMap(q, cfg.questionConfig.shuffleOptions);
      await tx.execute(
        'INSERT INTO stage_papers (stage_id, scope_key, question_id, sort_order, option_map) VALUES (?, ?, ?, ?, ?)',
        [stage.id, scopeKey, q.id, i + 1, JSON.stringify(optionMap)]
      );
      items.push({ question: q, optionMap, sortOrder: i + 1 });
    }
  });

  return { scopeKey, items };
}

/** 组装下发给前端的题目（隐藏答案，除非允许查看） */
function presentQuestion(item, cfg, index) {
  const q = item.question;
  const map = item.optionMap || {};
  const letters = optionLetters(q);

  // 按展示字母排序输出选项
  const options = letters
    .map((orig) => ({ letter: map[orig] || orig, text: q[OPTION_KEYS[OPTION_LETTERS.indexOf(orig)]] }))
    .sort((a, b) => a.letter.localeCompare(b.letter));

  const out = {
    index: index + 1,
    questionId: q.id,
    type: q.type,
    content: q.content,
    options,
    module: q.module,
    difficulty: q.difficulty,
    score: cfgMod.questionScore(cfg, q.type)
  };
  if (cfg.allowViewAnswer) {
    out.answer = mapAnswer(q.answer, map);
    out.analysis = q.analysis;
  }
  return out;
}

/**
 * 接力模式：解析当前队员序号与可用时间。
 *
 * 棒次按"实际进入顺序"决定，而不是队伍名单顺序 —— 比赛时队员可以自行
 * 商定谁跑第一棒，先进入答题页的人即为当前棒次。
 * 若配置 relayOrderMode='fixed' 则退回按名单顺序（兼容旧行为）。
 */
async function resolveRelayContext(stage, cfg, ctx) {
  if (!cfg.specialConfig.timeAccumulate) {
    return { active: false, playerIndex: 1, isLastPlayer: true, availableTime: cfg.timeConfig.totalTime };
  }
  const team = await db.queryOne('SELECT * FROM teams WHERE id = ?', [ctx.teamId]);
  const roster = [
    { studentId: team.leader_id, name: team.leader_name },
    { studentId: team.member1_id, name: team.member1_name },
    { studentId: team.member2_id, name: team.member2_name }
  ].filter((m) => m.studentId);

  const done = await db.query(
    'SELECT student_id, total_time FROM stage_scores WHERE stage_id = ? AND team_id = ? AND student_id IS NOT NULL',
    [stage.id, ctx.teamId]
  );
  const doneMap = new Map(done.map((d) => [d.student_id, Number(d.total_time || 0)]));

  const fixedOrder = cfg.specialConfig.relayOrderMode === 'fixed';

  // 已开始的队员及其顺序：以 stage_attempts.started_at 为准
  const attempts = await db.query(
    'SELECT student_id, started_at FROM stage_attempts WHERE stage_id = ? AND team_id = ? ORDER BY started_at ASC, id ASC',
    [stage.id, ctx.teamId]
  );

  // 已进入过答题页的队员按进入时间排序；未进入的按名单顺序排在其后
  const startedIds = attempts.map((a) => a.student_id).filter((id) => roster.some((m) => m.studentId === id));
  const ordered = fixedOrder
    ? roster.map((m) => m.studentId)
    : [...startedIds, ...roster.map((m) => m.studentId).filter((id) => !startedIds.includes(id))];

  // 去重并保持顺序
  const seq = [...new Set(ordered)];
  const members = seq
    .map((id, i) => ({ index: i + 1, studentId: id, name: (roster.find((m) => m.studentId === id) || {}).name }))
    .filter((m) => m.studentId);

  // 当前棒次 = 本人（若本人尚未完成），否则第一个未完成者
  const me = members.find((m) => m.studentId === ctx.studentId);
  const nextPlayer = (me && !doneMap.has(me.studentId))
    ? me
    : (members.find((m) => !doneMap.has(m.studentId)) || members[members.length - 1]);
  const playerIndex = nextPlayer ? nextPlayer.index : 1;

  const base = cfg.timeConfig.baseTimePerPlayer;
  const usedTimes = members
    .filter((m) => m.index < playerIndex && doneMap.has(m.studentId))
    .map((m) => doneMap.get(m.studentId));
  const pool = scoring.relayTimePool(base, usedTimes);
  const isLastPlayer = playerIndex === members.length;

  // 最后一棒可用时间 = 基础时间 + 前几棒节余
  const availableTime = isLastPlayer ? pool.pool : base;

  return {
    active: true, playerIndex, isLastPlayer, availableTime,
    members, doneMap, carried: pool.carried, nextPlayer,
    startedIds
  };
}

module.exports = {
  optionLetters,
  buildOptionMap,
  mapAnswer,
  unmapAnswer,
  scopeKeyFor,
  ensurePaper,
  presentQuestion,
  resolveRelayContext
};
