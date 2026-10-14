'use strict';
const db = require('../config/db');
const { AppError } = require('../utils/response');
const cfgMod = require('../config/stageConfig');
const scoring = require('./scoringService');
const paper = require('./paperService');
const rankService = require('./rankService');
const stageService = require('./stageService');
const logger = require('../utils/logger');

/**
 * 校验学生是否有权进入该环节 (project.md 6.4)
 * 队长可见全部环节；队员默认仅可见个人环节。
 */
async function assertVisible(stage, cfg, user) {
  if (Number(stage.status) !== 1) {
    throw new AppError('该环节尚未开启', 403, 403);
  }
  if (user.role === 'leader') return;
  // 队员：仅个人环节
  if (cfg.mode !== 'individual') {
    throw new AppError('该环节为团队协作环节，仅队长可进入', 403, 403);
  }
}

/** 答题准备页数据 (project.md 7.1 步骤2) */
async function getReadyInfo(stageId, user) {
  const stage = await stageService.getRow(stageId);
  const cfg = cfgMod.normalizeConfig(stage.config);
  await assertVisible(stage, cfg, user);

  const relay = await paper.resolveRelayContext(stage, cfg, { teamId: user.teamId, studentId: user.studentId });

  // 已完成的成绩（用于接力判断与结果页）
  const myScore = await db.queryOne(
    'SELECT * FROM stage_scores WHERE stage_id = ? AND team_id = ? AND student_id <=> ?',
    [stageId, user.teamId, cfg.mode === 'team' ? null : user.studentId]
  );

  return {
    stage: cfgMod.summarize(stage),
    relay,
    finished: !!myScore,
    score: myScore || null,
    visible: true
  };
}

/** 开始答题：生成/读取试卷并下发题目 */
async function startExam(stageId, user) {
  const stage = await stageService.getRow(stageId);
  const cfg = cfgMod.normalizeConfig(stage.config);
  await assertVisible(stage, cfg, user);

  const relay = await paper.resolveRelayContext(stage, cfg, { teamId: user.teamId, studentId: user.studentId });

  // 接力模式下，只有轮到的队员可以答题
  if (relay.active && relay.nextPlayer && relay.nextPlayer.studentId !== user.studentId) {
    throw new AppError('当前尚未轮到你答题，请等待队友完成接力', 403, 403);
  }

  const ctx = {
    studentId: user.studentId,
    teamId: user.teamId,
    playerIndex: relay.active ? relay.playerIndex : 1
  };
  const { scopeKey, items } = await paper.ensurePaper(stage, cfg, ctx);

  // 已有作答记录（断线重连）
  const existing = await db.query(
    'SELECT question_id, user_answer FROM answers WHERE stage_id = ? AND team_id = ? AND student_id = ?',
    [stageId, user.teamId, user.studentId]
  );
  const answerMap = new Map(existing.map((a) => [a.question_id, a.user_answer]));

  const questions = items.map((item, i) => {
    const q = paper.presentQuestion(item, cfg, i);
    q.userAnswer = answerMap.has(item.question.id) ? paper.mapAnswer(answerMap.get(item.question.id), item.optionMap || {}) : null;
    return q;
  });

  return {
    stage: cfgMod.summarize(stage),
    scopeKey,
    questions,
    relay,
    serverTime: new Date().toISOString(),
    // 服务端权威时限（秒）
    availableTime: relay.active ? relay.availableTime : cfg.timeConfig.totalTime,
    perQuestionTime: cfg.timeConfig.perQuestionTime,
    allowSkip: cfg.specialConfig.allowSkip,
    allowReturn: cfg.specialConfig.allowReturn,
    buzzerWaitTime: cfg.timeConfig.buzzerWaitTime
  };
}

/**
 * 提交单题答案。
 * 抢答类环节需要记录提交顺序用于速度排名。
 */
async function submitAnswer(stageId, user, { questionId, answer, timeSpent }) {
  const stage = await stageService.getRow(stageId);
  const cfg = cfgMod.normalizeConfig(stage.config);
  await assertVisible(stage, cfg, user);

  const relay = await paper.resolveRelayContext(stage, cfg, { teamId: user.teamId, studentId: user.studentId });
  const ctx = { studentId: user.studentId, teamId: user.teamId, playerIndex: relay.active ? relay.playerIndex : 1 };
  const { items } = await paper.ensurePaper(stage, cfg, ctx);

  const item = items.find((it) => it.question.id === Number(questionId));
  if (!item) throw new AppError('题目不属于本环节试卷', 400);

  // 展示字母 -> 原始字母
  const rawAnswer = answer ? paper.unmapAnswer(answer, item.optionMap || {}) : null;
  const result = scoring.scoreQuestion(cfg, item.question, rawAnswer, {
    opened: true,
    isLastPlayer: relay.active ? relay.isLastPlayer : true
  });

  const existing = await db.queryOne(
    'SELECT id FROM answers WHERE stage_id = ? AND team_id = ? AND student_id = ? AND question_id = ?',
    [stageId, user.teamId, user.studentId, questionId]
  );

  const spent = Math.max(0, Math.min(86400, Number(timeSpent) || 0));

  if (existing) {
    // 允许返回时才能改答案
    if (!cfg.specialConfig.allowReturn) throw new AppError('本环节不允许修改已提交的答案', 400);
    await db.execute(
      'UPDATE answers SET user_answer = ?, is_correct = ?, score_delta = ?, time_spent = ? WHERE id = ?',
      [rawAnswer, result.isCorrect, result.scoreDelta, spent, existing.id]
    );
  } else {
    // 提交顺序：用于速度排名
    const orderRow = await db.queryOne('SELECT COALESCE(MAX(submit_order), 0) + 1 AS next FROM answers WHERE stage_id = ?', [stageId]);
    const submitOrder = orderRow ? Number(orderRow.next) : 1;
    await db.execute(
      'INSERT INTO answers (stage_id, team_id, student_id, question_id, user_answer, is_correct, score_delta, time_spent, submit_order) VALUES (?,?,?,?,?,?,?,?,?)',
      [stageId, user.teamId, user.studentId, questionId, rawAnswer, result.isCorrect, result.scoreDelta, spent, submitOrder]
    );
  }

  // 抢答环节：答对后立即按提交时间写入速度榜
  if (cfg.timeConfig.speedRanking && result.isCorrect === 1) {
    await rankService.updateRank(stageId, user.teamId, 0, spent, 'speed');
  }

  // 实时排行榜：每答完一题就用当前累计分刷新排名，
  // 否则排行榜要等到交卷才有数据，答题过程中看不到任何变化 (project.md 8.2)。
  try {
    await refreshLiveRank(stageId, user, cfg);
  } catch (err) {
    // 排行榜失败不应影响答题主流程
    logger.warn('实时排行榜更新失败: ' + err.message);
  }

  const payload = {
    questionId: Number(questionId),
    isCorrect: result.isCorrect,
    scoreDelta: result.scoreDelta,
    reason: result.reason
  };
  // 管理员开启"允许查看答案"后回传答案与解析 (project.md 9.1)
  if (cfg.allowViewAnswer) {
    payload.correctAnswer = paper.mapAnswer(item.question.answer, item.optionMap || {});
    payload.analysis = item.question.analysis;
  }
  return payload;
}


/**
 * 依据当前已作答记录，实时刷新该队/该选手的排行榜分数。
 * 个人赛制按学号建榜，团队赛制按队伍建榜。
 */
async function refreshLiveRank(stageId, user, cfg) {
  const isTeam = cfg.mode === 'team';
  const scoreStudentId = isTeam ? null : user.studentId;

  const agg = await db.queryOne(
    'SELECT COALESCE(SUM(score_delta), 0) AS total_score, COALESCE(SUM(time_spent), 0) AS total_time, ' +
    '       COUNT(*) AS answered ' +
    'FROM answers WHERE stage_id = ? AND team_id = ? AND student_id <=> ?',
    [stageId, user.teamId, scoreStudentId]
  );
  if (!agg) return;

  const totalScore = Number(agg.total_score);
  const totalTime = Number(agg.total_time);

  if (isTeam) {
    await rankService.updateRank(stageId, user.teamId, totalScore, totalTime, 'common');
  } else {
    await rankService.updateRank(stageId, user.teamId, totalScore, totalTime, user.studentId);
    // 团队榜取该队所有队员中的最好成绩
    const best = await db.queryOne(
      'SELECT COALESCE(SUM(score_delta), 0) AS total_score, COALESCE(SUM(time_spent), 0) AS total_time ' +
      'FROM answers WHERE stage_id = ? AND team_id = ? GROUP BY student_id ' +
      'ORDER BY total_score DESC, total_time ASC LIMIT 1',
      [stageId, user.teamId]
    );
    if (best) {
      await rankService.updateRank(stageId, user.teamId, Number(best.total_score), Number(best.total_time), 'common');
    }
  }
}

/**
 * 交卷：汇总分数、写入 stage_scores、更新排行榜。
 * 接力模式下"交卷并接力"同时计算节余时间 (project.md 7.2)。
 */
async function submitStage(stageId, user, { totalTime } = {}) {
  const stage = await stageService.getRow(stageId);
  const cfg = cfgMod.normalizeConfig(stage.config);
  await assertVisible(stage, cfg, user);

  const relay = await paper.resolveRelayContext(stage, cfg, { teamId: user.teamId, studentId: user.studentId });

  // 团队模式：分数归属队伍（student_id = NULL）；个人模式：归属个人
  const scoreStudentId = cfg.mode === 'team' ? null : user.studentId;

  const rows = await db.query(
    'SELECT question_id, user_answer, is_correct, score_delta, time_spent FROM answers WHERE stage_id = ? AND team_id = ? AND student_id = ?',
    [stageId, user.teamId, user.studentId]
  );

  const totalScore = rows.reduce((sum, r) => sum + Number(r.score_delta || 0), 0);
  const usedTime = rows.reduce((sum, r) => sum + Number(r.time_spent || 0), 0);
  const finalTime = totalTime !== undefined && totalTime !== null ? Math.max(0, Number(totalTime)) : usedTime;

  // 已打开但从未提交的题目扣分（未答扣分在提交时无法感知，交卷时统一补齐）
  const ctx = { studentId: user.studentId, teamId: user.teamId, playerIndex: relay.active ? relay.playerIndex : 1 };
  const { items } = await paper.ensurePaper(stage, cfg, ctx);
  const answeredIds = new Set(rows.map((r) => Number(r.question_id)));
  let extraDeduction = 0;
  const deductionDetail = [];

  for (const item of items) {
    if (answeredIds.has(item.question.id)) continue;
    const res = scoring.scoreQuestion(cfg, item.question, null, {
      opened: false,
      isLastPlayer: relay.active ? relay.isLastPlayer : true
    });
    if (res.scoreDelta !== 0) {
      extraDeduction += res.scoreDelta;
      deductionDetail.push({ questionId: item.question.id, delta: res.scoreDelta, reason: res.reason });
      await db.execute(
        'INSERT INTO answers (stage_id, team_id, student_id, question_id, user_answer, is_correct, score_delta, time_spent, submit_order) VALUES (?,?,?,?,NULL,2,?,0,0)',
        [stageId, user.teamId, user.studentId, item.question.id, res.scoreDelta]
      );
    }
  }

  const finalScore = totalScore + extraDeduction;

  await db.execute(
    'INSERT INTO stage_scores (stage_id, team_id, student_id, total_score, total_time) VALUES (?,?,?,?,?) ' +
    'ON DUPLICATE KEY UPDATE total_score = VALUES(total_score), total_time = VALUES(total_time)',
    [stageId, user.teamId, scoreStudentId, finalScore, finalTime]
  );

  // 更新排行榜
  if (cfg.mode === 'team') {
    await rankService.updateRank(stageId, user.teamId, finalScore, finalTime, 'common');
  } else {
    await rankService.updateRank(stageId, user.teamId, finalScore, finalTime, user.studentId);
    // 个人环节的总榜取队伍最佳成绩
    const best = await db.queryOne(
      'SELECT total_score, total_time FROM stage_scores WHERE stage_id = ? AND team_id = ? AND student_id IS NOT NULL ORDER BY total_score DESC, total_time ASC LIMIT 1',
      [stageId, user.teamId]
    );
    if (best) await rankService.updateRank(stageId, user.teamId, best.total_score, best.total_time, 'common');
  }

  // 接力：计算节余时间并告知下一位队员
  let relayInfo = null;
  if (relay.active) {
    const remaining = Math.max(0, relay.availableTime - finalTime);
    const nextIndex = relay.playerIndex + 1;
    const nextMember = relay.members ? relay.members.find((m) => m.index === nextIndex) : null;
    relayInfo = {
      playerIndex: relay.playerIndex,
      usedTime: finalTime,
      remaining,
      carried: relay.carried + remaining,
      nextPlayer: nextMember ? { index: nextMember.index, name: nextMember.name, studentId: nextMember.studentId } : null,
      isLastPlayer: relay.isLastPlayer
    };
  }

  // 全员完成则标记环节结束
  await maybeFinishStage(stage, cfg);

  return {
    stageId: Number(stageId),
    totalScore: finalScore,
    baseScore: totalScore,
    extraDeduction,
    deductionDetail,
    totalTime: finalTime,
    answeredCount: rows.filter((r) => r.user_answer !== null && r.user_answer !== '').length,
    questionCount: items.length,
    relay: relayInfo,
    rank: await myRank(stageId, user, cfg)
  };
}

/** 查询本队伍/个人当前排名 */
async function myRank(stageId, user, cfg) {
  const list = cfg.mode === 'team'
    ? await rankService.getRanking(stageId, { limit: 500 })
    : await rankService.getIndividualRanking(stageId, { limit: 500 });

  if (cfg.mode === 'team') {
    const row = list.find((r) => r.teamId === Number(user.teamId));
    return row ? row.rank : null;
  }
  const row = list.find((r) => r.studentId === user.studentId);
  return row ? row.rank : null;
}

/** 所有参赛队伍都提交后，把环节置为已结束 */
async function maybeFinishStage(stage, cfg) {
  const totalRow = await db.queryOne('SELECT COUNT(*) AS c FROM teams WHERE status = 1');
  const totalTeams = totalRow ? Number(totalRow.c) : 0;
  if (!totalTeams) return;

  if (cfg.mode === 'team') {
    const doneRow = await db.queryOne(
      'SELECT COUNT(DISTINCT team_id) AS c FROM stage_scores WHERE stage_id = ? AND student_id IS NULL',
      [stage.id]
    );
    if (doneRow && Number(doneRow.c) >= totalTeams) {
      await db.execute('UPDATE stages SET status = 2 WHERE id = ? AND status = 1', [stage.id]);
    }
  }
}

/** 成绩页 (project.md 12.1 /stage/:id/result) */
async function getResult(stageId, user) {
  const stage = await stageService.getRow(stageId);
  const cfg = cfgMod.normalizeConfig(stage.config);

  const score = await db.queryOne(
    'SELECT * FROM stage_scores WHERE stage_id = ? AND team_id = ? AND student_id <=> ?',
    [stageId, user.teamId, cfg.mode === 'team' ? null : user.studentId]
  );

  const rank = await myRank(stageId, user, cfg);
  const relay = await paper.resolveRelayContext(stage, cfg, { teamId: user.teamId, studentId: user.studentId });

  return {
    stage: cfgMod.summarize(stage),
    finished: !!score,
    score: score
      ? { totalScore: Number(score.total_score), totalTime: Number(score.total_time), rank }
      : null,
    allowViewAnswer: cfg.allowViewAnswer,
    relay
  };
}

/**
 * 错题本 (project.md 9)
 * 未开启"允许查看答案"时只返回总分与排名。
 */
async function getWrongBook(stageId, user) {
  const stage = await stageService.getRow(stageId);
  const cfg = cfgMod.normalizeConfig(stage.config);

  const score = await db.queryOne(
    'SELECT * FROM stage_scores WHERE stage_id = ? AND team_id = ? AND student_id <=> ?',
    [stageId, user.teamId, cfg.mode === 'team' ? null : user.studentId]
  );
  if (!score) throw new AppError('请先完成本环节答题', 403, 403);

  if (!cfg.allowViewAnswer) {
    return {
      allowed: false,
      message: '管理员未开启查看答案，仅显示成绩',
      totalScore: Number(score.total_score),
      totalTime: Number(score.total_time),
      rank: await myRank(stageId, user, cfg),
      wrong: []
    };
  }

  const rows = await db.query(
    'SELECT a.question_id, a.user_answer, a.is_correct, a.score_delta, ' +
    'q.type, q.content, q.option_a, q.option_b, q.option_c, q.option_d, q.option_e, q.option_f, ' +
    'q.answer, q.analysis, q.module ' +
    'FROM answers a JOIN questions q ON q.id = a.question_id ' +
    'WHERE a.stage_id = ? AND a.team_id = ? AND a.student_id = ? AND a.is_correct <> 1 ' +
    'ORDER BY a.id ASC',
    [stageId, user.teamId, user.studentId]
  );

  // 应用选项乱序映射，保证展示字母与答题时一致
  const scopeKey = paper.scopeKeyFor(cfg, { studentId: user.studentId, teamId: user.teamId, playerIndex: 1 });
  const papers = await db.query(
    'SELECT question_id, option_map FROM stage_papers WHERE stage_id = ? AND scope_key = ?',
    [stageId, scopeKey]
  );
  const mapByQuestion = new Map(papers.map((p) => [p.question_id, p.option_map || {}]));

  const wrong = rows.map((r) => {
    const map = mapByQuestion.get(r.question_id) || {};
    const letters = paper.optionLetters(r);
    const options = letters
      .map((orig) => ({ letter: map[orig] || orig, text: r['option_' + orig.toLowerCase()] }))
      .sort((a, b) => a.letter.localeCompare(b.letter));
    return {
      questionId: r.question_id,
      type: r.type,
      content: r.content,
      options,
      userAnswer: r.user_answer ? paper.mapAnswer(r.user_answer, map) : null,
      correctAnswer: paper.mapAnswer(r.answer, map),
      analysis: r.analysis,
      module: r.module,
      scoreDelta: Number(r.score_delta),
      isCorrect: r.is_correct
    };
  });

  return {
    allowed: true,
    totalScore: Number(score.total_score),
    totalTime: Number(score.total_time),
    rank: await myRank(stageId, user, cfg),
    wrong
  };
}

module.exports = { assertVisible, getReadyInfo, startExam, submitAnswer, submitStage, getResult, getWrongBook, myRank };
