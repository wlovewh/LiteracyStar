
const path = require('path');
// 使用相对路径，保证脚本在任意目录（含 Linux 服务器）均可运行
const base = path.resolve(__dirname, '..', 'src');
const sc = require(path.join(base, 'services', 'scoringService'));
const cfgMod = require(path.join(base, 'config', 'stageConfig'));

let pass = 0, fail = 0;
function eq(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n    expected: ' + e + '\n    actual:   ' + a); }
}

console.log('--- stageConfig ---');
const cfg = cfgMod.normalizeConfig({});
eq('default mode', cfg.mode, 'individual');
eq('default total questions', cfgMod.totalQuestionCount(cfg), 10);
eq('default total score (6*2+2*4+2*1)', cfgMod.totalPossibleScore(cfg), 22);

const relayCfg = cfgMod.normalizeConfig({
  questionConfig: { relay: true, relayPlan: [
    { index:1, single:3, multiple:1, judge:1 },
    { index:2, single:3, multiple:1, judge:1 },
    { index:3, single:4, multiple:3, judge:3 }
  ]},
  scoreConfig: { singleScore:2.5, multipleScore:4, judgeScore:1 },
  specialConfig: { timeAccumulate:true, firstPlayersNoDeduct:true }
});
eq('relay total questions (5+5+10)', cfgMod.totalQuestionCount(relayCfg), 20);
// single 3+3+4=10, multiple 1+1+3=5, judge 1+1+3=5 -> 10*2.5 + 5*4 + 5*1 = 50
eq('relay total score (10*2.5 + 5*4 + 5*1)', cfgMod.totalPossibleScore(relayCfg), 50);

console.log('--- scoring: 单选 ---');
const q1 = { type:1, answer:'A' };
eq('correct', sc.scoreQuestion(cfg, q1, 'A'), { isCorrect:1, scoreDelta:2, reason:'答对' });
eq('wrong deduct', sc.scoreQuestion(cfg, q1, 'B'), { isCorrect:0, scoreDelta:-1, reason:'答错扣分' });
eq('unanswered no deduct', sc.scoreQuestion(cfg, q1, null), { isCorrect:2, scoreDelta:0, reason:'未答不扣分' });

console.log('--- scoring: 多选必须完全一致 ---');
const q2 = { type:2, answer:'ABC' };
eq('ABC correct', sc.scoreQuestion(cfg, q2, 'ABC').isCorrect, 1);
eq('CBA correct (order-insensitive)', sc.scoreQuestion(cfg, q2, 'CBA').isCorrect, 1);
eq('AB partial is wrong', sc.scoreQuestion(cfg, q2, 'AB').isCorrect, 0);
eq('ABCD superset is wrong', sc.scoreQuestion(cfg, q2, 'ABCD').isCorrect, 0);

console.log('--- scoring: 扣对应分值 (null) ---');
const cfgNull = cfgMod.normalizeConfig({ scoreConfig: { singleScore:2.5, multipleScore:4, judgeScore:1, wrongDeduct:true, wrongDeductScore:null, unansweredDeduct:true, unansweredDeductScore:null, openedNotSubmitDeduct:true, openedNotSubmitDeductScore:null } });
eq('wrong deducts full (single 2.5)', sc.scoreQuestion(cfgNull, q1, 'B').scoreDelta, -2.5);
eq('unanswered deducts full', sc.scoreQuestion(cfgNull, q1, null).scoreDelta, -2.5);
eq('opened-not-submit takes precedence', sc.scoreQuestion(cfgNull, q1, null, {opened:true}).reason, '已打开未提交扣分');

console.log('--- scoring: 接力前段不扣分 ---');
const relayPlayer1 = sc.scoreQuestion(relayCfg, q1, 'B', { isLastPlayer:false });
eq('player1 wrong -> no deduct', relayPlayer1.scoreDelta, 0);
const relayPlayer3 = sc.scoreQuestion(relayCfg, q1, 'B', { isLastPlayer:true });
eq('player3 wrong -> deduct', relayPlayer3.scoreDelta, -1);

console.log('--- speedRankingBonus ---');
eq('50% of 6 round', sc.speedRankingBonus([{teamId:1},{teamId:2},{teamId:3},{teamId:4},{teamId:5},{teamId:6}], 50, false, 4).size, 3);
eq('50% of 5 round (2.5 -> 3)', sc.speedRankingBonus([{teamId:1},{teamId:2},{teamId:3},{teamId:4},{teamId:5}], 50, false, 4).size, 3);
eq('50% of 5 roundUp (2.5 -> 3)', sc.speedRankingBonus([{teamId:1},{teamId:2},{teamId:3},{teamId:4},{teamId:5}], 50, true, 4).size, 3);
eq('50% of 3 round (1.5 -> 2)', sc.speedRankingBonus([{teamId:1},{teamId:2},{teamId:3}], 50, false, 4).size, 2);
eq('bonus value = full score', sc.speedRankingBonus([{teamId:1},{teamId:2}], 50, false, 4).get(1), 4);
eq('empty -> empty', sc.speedRankingBonus([], 50, false, 4).size, 0);

console.log('--- compositeScore: 同分按用时排序 ---');
eq('higher score wins', sc.compositeScore(10, 100) > sc.compositeScore(9, 10), true);
eq('same score, less time wins', sc.compositeScore(10, 50) > sc.compositeScore(10, 100), true);

console.log('--- relayTimePool ---');
const rp = sc.relayTimePool(360, [300, 240]);
eq('remaining', rp.remaining, [60, 120]);
eq('carried', rp.carried, 180);
eq('pool = 360 + 180', rp.pool, 540);

console.log('');
console.log('RESULT: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
