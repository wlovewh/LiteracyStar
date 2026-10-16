'use strict';
const { QUESTION_TYPES, questionScore } = require('../config/stageConfig');

/** 判断答案是否正确。多选题必须完全一致（无分隔符，如 "ABC"）。 */
function isCorrect(question, userAnswer) {
  if (userAnswer === null || userAnswer === undefined || userAnswer === '') return null;
  const normalize = (v) => String(v).replace(/[^A-Fa-f]/g, '').toUpperCase().split('').sort().join('');
  return normalize(userAnswer) === normalize(question.answer);
}

/**
 * 计算单题得分。
 *
 * @param {object} cfg      归一化后的环节配置
 * @param {object} question 题目行
 * @param {string|null} userAnswer 学生答案，null/'' 表示未答
 * @param {object} opts     { opened: boolean 是否已打开, playerIndex: number 第几位队员, isLastPlayer: boolean }
 * @returns {{ isCorrect: 0|1|2, scoreDelta: number, reason: string }}
 */
function scoreQuestion(cfg, question, userAnswer, opts = {}) {
  const full = questionScore(cfg, question.type);
  const s = cfg.scoreConfig;
  const answered = userAnswer !== null && userAnswer !== undefined && userAnswer !== '';

  // 接力模式下，前段队员不扣分 (project.md 4.2 环节5)
  const deductExempt =
    cfg.specialConfig.timeAccumulate &&
    cfg.specialConfig.firstPlayersNoDeduct &&
    opts.isLastPlayer === false;

  if (!answered) {
    // 已打开但未提交，与完全未答是两种不同扣分项
    const isOpenedNotSubmit = !!opts.opened && s.openedNotSubmitDeduct;
    const isUnanswered = s.unansweredDeduct;

    if (isOpenedNotSubmit) {
      const d = s.openedNotSubmitDeductScore === null ? full : s.openedNotSubmitDeductScore;
      return { isCorrect: 2, scoreDelta: deductExempt ? 0 : -Math.abs(d), reason: '已打开未提交扣分' };
    }
    if (isUnanswered) {
      const d = s.unansweredDeductScore === null ? full : s.unansweredDeductScore;
      return { isCorrect: 2, scoreDelta: deductExempt ? 0 : -Math.abs(d), reason: '未答扣分' };
    }
    return { isCorrect: 2, scoreDelta: 0, reason: '未答不扣分' };
  }

  const correct = isCorrect(question, userAnswer);
  if (correct) {
    return { isCorrect: 1, scoreDelta: full, reason: '答对' };
  }

  if (!s.wrongDeduct) {
    return { isCorrect: 0, scoreDelta: 0, reason: '答错不扣分' };
  }
  const d = s.wrongDeductScore === null ? full : s.wrongDeductScore;
  return { isCorrect: 0, scoreDelta: deductExempt ? 0 : -Math.abs(d), reason: '答错扣分' };
}

/**
 * 速度排名加分 (project.md 8.2 / 环节4、环节6)。
 *
 * 规则：按答对队伍的提交时间排序，前 speedRankingPercent% 的队伍获得加分。
 *  - 加分基数为该题满分；
 *  - speedRankingRoundUp=true 时，名额数向上取整（奇数进位），否则四舍五入。
 *
 * @param {Array<{teamId:number, submitOrder:number}>} correctTeams 已按提交顺序排序的答对队伍
 * @param {number} percent 前百分之多少
 * @param {boolean} roundUp  是否奇数进位
 * @param {number} fullScore 该题满分
 * @returns {Map<number, number>} teamId -> 额外加分
 */
function speedRankingBonus(correctTeams, percent, roundUp, fullScore) {
  const map = new Map();
  const total = correctTeams.length;
  if (total === 0) return map;

  const raw = (total * percent) / 100;
  let quota = roundUp ? Math.ceil(raw) : Math.round(raw);
  if (quota < 1) quota = 1;
  if (quota > total) quota = total;

  for (let i = 0; i < quota; i += 1) {
    map.set(correctTeams[i].teamId, fullScore);
  }
  return map;
}

/**
 * 复合排行榜 score (project.md 8.2)
 *   分数高在前，同分用时少在前  =>  score * 1000000 - timeSpent
 */
function compositeScore(totalScore, totalTime) {
  return Number(totalScore) * 1000000 - Number(totalTime || 0);
}

/**
 * 个人接力时间池计算 (project.md 7.2)
 *   第3名队员可用时间 = 基础时间 + 第1、2名节余时间之和
 *
 * @param {number} baseTime 每人基础时间（秒）
 * @param {Array<number>} usedTimes 前段队员各自实际用时
 * @returns {{ pool: number, remaining: number[], carried: number }}
 */
function relayTimePool(baseTime, usedTimes) {
  const remaining = usedTimes.map((used) => Math.max(0, baseTime - Number(used || 0)));
  const carried = remaining.reduce((a, b) => a + b, 0);
  return { pool: baseTime + carried, remaining, carried };
}

module.exports = {
  isCorrect,
  scoreQuestion,
  speedRankingBonus,
  compositeScore,
  relayTimePool,
  QUESTION_TYPES
};
