'use strict';
const db = require('../config/db');
const redis = require('../config/redis');
const scoring = require('./scoringService');

/**
 * 排行榜服务 (project.md 8)
 *   Redis ZSET:  ZADD stage:{stageId}:rank {score} {teamId}
 *   复合 score:  score * 1000000 - timeSpent
 */

/** 写入/更新某队伍在环节中的排名分 */
async function updateRank(stageId, teamId, totalScore, totalTime, scopeKey = 'common') {
  const key = redis.rankKey(stageId, scopeKey);
  const value = scoring.compositeScore(totalScore, totalTime);
  await redis.zadd(key, value, teamId);
  return value;
}

/** 读取排行榜（按分数从高到低） */
async function getRanking(stageId, { scopeKey = 'common', limit = 200 } = {}) {
  const key = redis.rankKey(stageId, scopeKey);
  let entries = await redis.zrange(key, 0, limit - 1, true);

  // ZSET 为空（例如答题进行中、尚未有人交卷）时，
  // 退化为按 answers 实时汇总，保证答题过程中排行榜可见。
  if (!entries.length) {
    const live = await db.query(
      'SELECT team_id, COALESCE(SUM(score_delta), 0) AS total_score, COALESCE(SUM(time_spent), 0) AS total_time ' +
      'FROM answers WHERE stage_id = ? GROUP BY team_id',
      [stageId]
    );
    if (!live.length) return [];
    entries = live
      .map((r) => ({ member: String(r.team_id), score: scoring.compositeScore(Number(r.total_score), Number(r.total_time)) }))
      .sort((a, b) => a.score - b.score);
  }

  // ZSET 升序 -> 反转得到降序
  const desc = entries.slice().reverse();

  const teamIds = [...new Set(desc.map((e) => Number(e.member)))];
  const teams = teamIds.length
    ? await db.query('SELECT id, name, leader_name, leader_id FROM teams WHERE id IN (' + teamIds.map(() => '?').join(',') + ')', teamIds)
    : [];
  const teamMap = new Map(teams.map((t) => [t.id, t]));

  const scores = await db.query(
    'SELECT team_id, student_id, total_score, total_time FROM stage_scores WHERE stage_id = ?',
    [stageId]
  );
  const scoreMap = new Map();
  scores.forEach((s) => {
    scoreMap.set(String(s.team_id) + '|' + (s.student_id || ''), s);
  });

  return desc.map((e, i) => {
    const teamId = Number(e.member);
    const team = teamMap.get(teamId) || {};
    const row = scoreMap.get(String(teamId) + '|' + (scopeKey === 'common' ? '' : scopeKey)) || scoreMap.get(String(teamId) + '|');
    return {
      rank: i + 1,
      teamId,
      teamName: team.name || ('队伍#' + teamId),
      leaderName: team.leader_name || '',
      totalScore: row ? Number(row.total_score) : 0,
      totalTime: row ? Number(row.total_time) : 0,
      compositeScore: Number(e.score)
    };
  });
}

/** 从数据库重建某环节的 ZSET（服务重启或数据修复时使用） */
async function rebuild(stageId) {
  const rows = await db.query(
    'SELECT team_id, student_id, total_score, total_time FROM stage_scores WHERE stage_id = ?',
    [stageId]
  );
  const keys = await redis.keys(redis.rankKey(stageId, 'common') + '*');
  for (const k of keys) await redis.del(k);

  // 团队维度取团队分，个人维度按学号分别建榜
  const teamBest = new Map();
  for (const r of rows) {
    if (r.student_id) {
      await updateRank(stageId, r.team_id, r.total_score, r.total_time, r.student_id);
    }
    const prev = teamBest.get(r.team_id);
    if (!prev || Number(r.total_score) > Number(prev.total_score)) teamBest.set(r.team_id, r);
  }
  for (const [teamId, r] of teamBest.entries()) {
    await updateRank(stageId, teamId, r.total_score, r.total_time, 'common');
  }
  return teamBest.size;
}

async function clearStage(stageId) {
  const keys = await redis.keys(redis.rankKey(stageId, 'common') + '*');
  for (const k of keys) await redis.del(k);
  return keys.length;
}

/**
 * 个人榜：个人环节中每位选手独立排名。
 *
 * 说明：stage_scores 只在"交卷"时写入，若仅依赖它，
 * 答题过程中的排行榜将始终为空。因此这里以 answers 的实时累计分
 * 为基础（COALESCE 取较大值，保证交卷后的正式成绩不被实时分覆盖）。
 */
async function getIndividualRanking(stageId, { limit = 200 } = {}) {
  const rows = await db.query(
    'SELECT a.student_id, a.team_id, ' +
    '       GREATEST(COALESCE(ss.total_score, 0), COALESCE(SUM(a.score_delta), 0)) AS total_score, ' +
    '       LEAST(COALESCE(ss.total_time, 999999), COALESCE(SUM(a.time_spent), 0)) AS total_time, ' +
    '       t.name AS team_name, ' +
    'CASE WHEN t.leader_id = a.student_id THEN t.leader_name ' +
    '     WHEN t.member1_id = a.student_id THEN t.member1_name ' +
    '     ELSE t.member2_name END AS student_name ' +
    'FROM answers a ' +
    'LEFT JOIN stage_scores ss ON ss.stage_id = a.stage_id AND ss.team_id = a.team_id AND ss.student_id = a.student_id ' +
    'LEFT JOIN teams t ON t.id = a.team_id ' +
    'WHERE a.stage_id = ? ' +
    'GROUP BY a.student_id, a.team_id, ss.total_score, ss.total_time, t.name, t.leader_id, t.leader_name, t.member1_id, t.member1_name, t.member2_name ' +
    'ORDER BY total_score DESC, total_time ASC LIMIT ' + Number(limit),
    [stageId]
  );
  return rows.map((r, i) => ({
    rank: i + 1,
    studentId: r.student_id,
    studentName: r.student_name || '',
    teamId: r.team_id,
    teamName: r.team_name || '',
    totalScore: Number(r.total_score),
    totalTime: Number(r.total_time)
  }));
}

module.exports = { updateRank, getRanking, getIndividualRanking, rebuild, clearStage };
