'use strict';
const db = require('../config/db');

/** 仪表盘 (project.md 10.1) */
async function dashboard() {
  const [onlineRow, activeStageRow, todayAnswerRow, cheatRow, teamRow, questionRow] = await Promise.all([
    // 在线队伍数：最近 5 分钟内有答题记录
    db.queryOne('SELECT COUNT(DISTINCT team_id) AS c FROM answers WHERE created_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)'),
    db.queryOne('SELECT COUNT(*) AS c FROM stages WHERE status = 1'),
    db.queryOne('SELECT COUNT(*) AS c FROM answers WHERE DATE(created_at) = CURDATE()'),
    db.queryOne('SELECT COUNT(*) AS c FROM cheat_logs'),
    db.queryOne('SELECT COUNT(*) AS c FROM teams WHERE status = 1'),
    db.queryOne('SELECT COUNT(*) AS c FROM questions')
  ]);

  const activeStages = await db.query(
    'SELECT s.id, s.name, s.status, e.name AS event_name FROM stages s JOIN events e ON e.id = s.event_id WHERE s.status = 1 ORDER BY s.sort_order ASC LIMIT 10'
  );

  return {
    onlineTeams: onlineRow ? Number(onlineRow.c) : 0,
    activeStageCount: activeStageRow ? Number(activeStageRow.c) : 0,
    todayAnswers: todayAnswerRow ? Number(todayAnswerRow.c) : 0,
    cheatLogCount: cheatRow ? Number(cheatRow.c) : 0,
    teamCount: teamRow ? Number(teamRow.c) : 0,
    questionCount: questionRow ? Number(questionRow.c) : 0,
    activeStages
  };
}

/** 成绩分布 (project.md 10.2) */
async function scoreDistribution(stageId) {
  const rows = await db.query(
    'SELECT total_score FROM stage_scores WHERE stage_id = ?',
    [stageId]
  );
  const scores = rows.map((r) => Number(r.total_score));
  if (!scores.length) return { buckets: [], count: 0, avg: 0, max: 0, min: 0 };

  const max = Math.max(...scores);
  const min = Math.min(...scores);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

  // 以 10 分为一档构造分布
  const step = 10;
  const start = Math.floor(Math.min(0, min) / step) * step;
  const end = Math.ceil(max / step) * step;
  const buckets = [];
  for (let lo = start; lo < end || buckets.length === 0; lo += step) {
    const hi = lo + step;
    const count = scores.filter((s) => s >= lo && (s < hi || (hi >= end && s <= hi))).length;
    buckets.push({ range: lo + '~' + hi, min: lo, max: hi, count });
    if (lo + step > end) break;
  }
  return { buckets, count: scores.length, avg: Number(avg.toFixed(2)), max, min };
}

/** 各题目正确率 (project.md 10.2) */
async function questionAccuracy(stageId, limit = 50) {
  const rows = await db.query(
    'SELECT a.question_id, q.content, q.type, q.module, ' +
    'SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) AS correct_count, ' +
    'SUM(CASE WHEN a.is_correct = 0 THEN 1 ELSE 0 END) AS wrong_count, ' +
    'SUM(CASE WHEN a.is_correct = 2 THEN 1 ELSE 0 END) AS blank_count, ' +
    'COUNT(*) AS total ' +
    'FROM answers a JOIN questions q ON q.id = a.question_id ' +
    'WHERE a.stage_id = ? GROUP BY a.question_id, q.content, q.type, q.module ' +
    'ORDER BY correct_count / COUNT(*) ASC LIMIT ' + Number(limit),
    [stageId]
  );
  return rows.map((r) => ({
    questionId: r.question_id,
    content: r.content,
    type: r.type,
    module: r.module,
    correctCount: Number(r.correct_count),
    wrongCount: Number(r.wrong_count),
    blankCount: Number(r.blank_count),
    total: Number(r.total),
    accuracy: Number(r.total) ? Number(((Number(r.correct_count) / Number(r.total)) * 100).toFixed(1)) : 0
  }));
}

/** 知识模块正确率（雷达图） (project.md 10.2) */
async function moduleAccuracy(stageId) {
  const rows = await db.query(
    'SELECT COALESCE(q.module, "未分类") AS module, ' +
    'SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) AS correct_count, COUNT(*) AS total ' +
    'FROM answers a JOIN questions q ON q.id = a.question_id ' +
    'WHERE a.stage_id = ? GROUP BY COALESCE(q.module, "未分类") ORDER BY total DESC',
    [stageId]
  );
  return rows.map((r) => ({
    module: r.module,
    total: Number(r.total),
    correctCount: Number(r.correct_count),
    accuracy: Number(r.total) ? Number(((Number(r.correct_count) / Number(r.total)) * 100).toFixed(1)) : 0
  }));
}

/**
 * 队伍成绩对比 (project.md 10.2)
 *
 * 需要同时支持两种赛制，原实现只查 student_id IS NULL，
 * 导致个人赛制（成绩按学生维度存储）查不到任何数据、图表空白。
 *
 * - 团队赛制：直接取 stage_scores 中该队伍的团队成绩行
 * - 个人赛制：把该队伍所有队员的成绩按队伍汇总（得分求和、用时求和）
 */
async function teamComparison(stageId) {
  const modeRow = await db.queryOne('SELECT config FROM stages WHERE id = ?', [stageId]);
  let mode = 'team';
  try {
    const cfg = typeof modeRow?.config === 'string' ? JSON.parse(modeRow.config) : (modeRow?.config || {});
    mode = cfg.mode || 'team';
  } catch (_) {
    mode = 'team';
  }

  if (mode === 'team') {
    const rows = await db.query(
      'SELECT t.id, t.name, ss.total_score, ss.total_time ' +
      'FROM stage_scores ss JOIN teams t ON t.id = ss.team_id ' +
      'WHERE ss.stage_id = ? AND ss.student_id IS NULL ' +
      'ORDER BY ss.total_score DESC, ss.total_time ASC',
      [stageId]
    );
    return rows.map((r, i) => ({
      rank: i + 1,
      teamId: r.id,
      teamName: r.name,
      totalScore: Number(r.total_score),
      totalTime: Number(r.total_time)
    }));
  }

  // 个人赛制：按队伍汇总各队员成绩
  const rows = await db.query(
    'SELECT t.id, t.name, ' +
    '       SUM(ss.total_score) AS total_score, ' +
    '       SUM(ss.total_time)  AS total_time, ' +
    '       COUNT(*)            AS member_count ' +
    'FROM stage_scores ss JOIN teams t ON t.id = ss.team_id ' +
    'WHERE ss.stage_id = ? AND ss.student_id IS NOT NULL ' +
    'GROUP BY t.id, t.name ' +
    'ORDER BY total_score DESC, total_time ASC',
    [stageId]
  );
  return rows.map((r, i) => ({
    rank: i + 1,
    teamId: r.id,
    teamName: r.name,
    totalScore: Number(r.total_score),
    totalTime: Number(r.total_time),
    memberCount: Number(r.member_count)
  }));
}

/** 汇总：一次请求返回全部统计图表数据 */
async function overview(stageId) {
  if (!stageId) {
    const stage = await db.queryOne('SELECT id FROM stages ORDER BY id ASC LIMIT 1');
    stageId = stage ? stage.id : null;
  }
  if (!stageId) {
    return { stageId: null, distribution: { buckets: [], count: 0, avg: 0, max: 0, min: 0 }, questionAccuracy: [], moduleAccuracy: [], teamComparison: [] };
  }
  const [distribution, accuracy, modules, teams] = await Promise.all([
    scoreDistribution(stageId),
    questionAccuracy(stageId),
    moduleAccuracy(stageId),
    teamComparison(stageId)
  ]);
  return { stageId: Number(stageId), distribution, questionAccuracy: accuracy, moduleAccuracy: modules, teamComparison: teams };
}

module.exports = { dashboard, scoreDistribution, questionAccuracy, moduleAccuracy, teamComparison, overview };
