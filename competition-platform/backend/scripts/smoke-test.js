'use strict';
/**
 * 端到端接口冒烟测试
 * 覆盖: 登录 -> 赛事/环节 -> 题库 -> 队伍 -> 答题全流程 -> 交卷 -> 排行榜 -> 错题本 -> 统计
 * 用法: node scripts/smoke-test.js   (需先启动后端服务)
 */
const BASE = process.env.BASE_URL || 'http://localhost:3000';
let pass = 0, fail = 0;
const failures = [];

function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; failures.push(name); console.log('  FAIL ' + name + (extra ? ' :: ' + JSON.stringify(extra).slice(0, 400) : '')); }
}

async function api(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) { json = { raw: text.slice(0, 300) }; }
  return { status: res.status, json };
}

/**
 * 重置第 1 个环节的测试状态，保证冒烟测试可重复执行。
 * 清理: 答题记录、成绩、抽题快照、排行榜、预警记录，并关闭"允许查看答案"。
 */
async function resetStageState(stageId) {
  const db = require('../src/config/db');
  const redis = require('../src/config/redis');
  await redis.init();
  await db.execute('DELETE FROM answers WHERE stage_id = ?', [stageId]);
  await db.execute('DELETE FROM stage_scores WHERE stage_id = ?', [stageId]);
  await db.execute('DELETE FROM stage_papers WHERE stage_id = ?', [stageId]);
  await db.execute('UPDATE stages SET status = 0 WHERE id = ?', [stageId]);
  await db.execute("UPDATE stages SET config = JSON_SET(config, '$.allowViewAnswer', false) WHERE id = ?", [stageId]);
  await db.execute('DELETE FROM cheat_logs');
  await redis.del(redis.rankKey(stageId, 'common'));
  await redis.del(redis.rankKey(stageId, '2026001'));
  await db.close();
}

(async () => {
  console.log('=== 0. 重置测试状态 ===');
  const db = require('../src/config/db');
  const firstStage = await db.queryOne('SELECT id FROM stages ORDER BY sort_order ASC LIMIT 1');
  if (firstStage) {
    await resetStageState(firstStage.id);
    console.log('  已重置环节 #' + firstStage.id + ' 的答题与成绩数据');
  }

  console.log('=== 1. 健康检查 ===');
  const health = await api('GET', '/api/health');
  check('health 200', health.status === 200, health.json);
  check('db connected', health.json?.data?.database?.connected === true, health.json?.data?.database);

  console.log('=== 2. 鉴权 ===');
  const badLogin = await api('POST', '/api/auth/admin/login', { body: { username: 'admin', password: 'wrong' } });
  check('错误密码被拒绝', badLogin.status === 401, badLogin.json);

  const adminLogin = await api('POST', '/api/auth/admin/login', { body: { username: 'admin', password: 'admin123' } });
  check('管理员登录成功', adminLogin.json?.code === 0 && !!adminLogin.json?.data?.token, adminLogin.json);
  const adminToken = adminLogin.json?.data?.token;

  const studentLogin = await api('POST', '/api/auth/student/login', { body: { studentId: '2026001', password: '2026001' } });
  check('队长登录成功 (密码=学号)', studentLogin.json?.code === 0 && studentLogin.json?.data?.user?.role === 'leader', studentLogin.json);
  const leaderToken = studentLogin.json?.data?.token;

  const memberLogin = await api('POST', '/api/auth/student/login', { body: { studentId: '2026002', password: '2026002' } });
  check('队员登录成功', memberLogin.json?.data?.user?.role === 'member', memberLogin.json);
  const memberToken = memberLogin.json?.data?.token;

  const wrongPwd = await api('POST', '/api/auth/student/login', { body: { studentId: '2026001', password: 'xxx' } });
  check('学生错误密码被拒绝', wrongPwd.status === 401, wrongPwd.json);

  const noAuth = await api('GET', '/api/questions');
  check('未登录访问后台被拒绝', noAuth.status === 401, noAuth.json);

  const memberAdmin = await api('GET', '/api/questions', { token: memberToken });
  check('学生访问后台被拒绝 (403)', memberAdmin.status === 403, memberAdmin.json);

  console.log('=== 3. 赛事与环节 ===');
  const events = await api('GET', '/api/events', { token: adminToken });
  check('赛事列表返回 1 条', events.json?.data?.length === 1, events.json);
  const eventId = events.json?.data?.[0]?.id;

  const stages = await api('GET', '/api/events/' + eventId + '/stages', { token: adminToken });
  check('环节列表返回 7 条', stages.json?.data?.length === 7, stages.json?.data?.length);
  check('环节1 题目数=10 总分=20', stages.json?.data?.[0]?.questionCount === 10 && stages.json?.data?.[0]?.totalScore === 20, stages.json?.data?.[0]);
  check('环节5 接力题目数=20', stages.json?.data?.[4]?.questionCount === 20, stages.json?.data?.[4]);

  // 复制环节
  const copyRes = await api('POST', '/api/stages/' + stages.json.data[0].id + '/copy', { token: adminToken });
  check('复制环节成功', copyRes.json?.code === 0 && copyRes.json?.data?.name?.includes('副本'), copyRes.json);
  const copiedId = copyRes.json?.data?.id;
  const delCopy = await api('DELETE', '/api/stages/' + copiedId, { token: adminToken });
  check('删除副本成功', delCopy.json?.code === 0, delCopy.json);

  console.log('=== 4. 题库 ===');
  const qList = await api('GET', '/api/questions?pageSize=5', { token: adminToken });
  check('题库列表分页', qList.json?.data?.total >= 20 && qList.json?.data?.list?.length === 5, qList.json?.data);
  const facets = await api('GET', '/api/questions/facets', { token: adminToken });
  check('题库筛选项', Array.isArray(facets.json?.data?.modules) && facets.json.data.modules.length > 0, facets.json?.data);

  const newQ = await api('POST', '/api/questions', { token: adminToken, body: {
    type: 1, content: '冒烟测试题目：以下哪个是正确的信息检索逻辑算符？',
    option_a: 'AND', option_b: 'IF', option_c: 'ELSE', option_d: 'LOOP', answer: 'A',
    analysis: 'AND 是布尔逻辑算符。', module: '信息检索', difficulty: 2, source: '冒烟测试', tags: 'test'
  }});
  check('新增题目成功', newQ.json?.code === 0, newQ.json);
  const newQId = newQ.json?.data?.id;

  const badQ = await api('POST', '/api/questions', { token: adminToken, body: { type: 1, content: '答案与选项不匹配', option_a: 'A1', option_b: 'B1', answer: 'D' } });
  check('答案与选项不匹配被拒绝', badQ.status === 400, badQ.json);

  const judgeQ = await api('POST', '/api/questions', { token: adminToken, body: { type: 3, content: '冒烟测试判断题：信息素养是终身学习的基础。', answer: 'A' } });
  check('判断题自动生成正确/错误选项', judgeQ.json?.data?.option_a === '正确' && judgeQ.json?.data?.option_b === '错误', judgeQ.json?.data);
  const judgeQId = judgeQ.json?.data?.id;

  console.log('=== 5. 队伍 ===');
  const teams = await api('GET', '/api/teams', { token: adminToken });
  check('队伍列表返回 3 条', teams.json?.data?.total === 3, teams.json?.data);

  const dupTeam = await api('POST', '/api/teams', { token: adminToken, body: {
    name: '重复队', leader_name: '测试', leader_id: '2026001', leader_phone: '13800000000'
  }});
  check('学号重复被拒绝', dupTeam.status === 400, dupTeam.json);

  const newTeam = await api('POST', '/api/teams', { token: adminToken, body: {
    name: '冒烟测试队', leader_name: '测试队长', leader_id: '9999001', leader_phone: '13900000001',
    member1_name: '测试队员1', member1_id: '9999002', member2_name: '测试队员2', member2_id: '9999003'
  }});
  check('新增队伍成功', newTeam.json?.code === 0, newTeam.json);
  const newTeamId = newTeam.json?.data?.id;

  console.log('=== 6. 开启环节1 并答题 ===');
  const stage1 = stages.json.data[0];
  const enable = await api('POST', '/api/stages/' + stage1.id + '/status', { token: adminToken, body: { status: 1 } });
  check('开启环节1', enable.json?.data?.status === 1, enable.json);

  const ready = await api('GET', '/api/stages/' + stage1.id + '/ready', { token: leaderToken });
  check('答题准备页', ready.json?.code === 0 && ready.json?.data?.stage?.questionCount === 10, ready.json?.data?.stage);

  // 队员进入团队环节应被拒绝
  const memberTeamStage = await api('GET', '/api/stages/' + stages.json.data[1].id + '/ready', { token: memberToken });
  check('队员无法进入团队环节', memberTeamStage.status === 403, memberTeamStage.json);

  // 该环节可能在上次运行中已开考并交卷；清理计时记录，保证本次从零开始。
  // （服务端按首次进入时间强制时限，残留记录会让本环节立即判定超时）
  {
    const db = require('../src/config/db');
    await db.execute('DELETE FROM stage_attempts WHERE stage_id = ?', [stage1.id]);
  }

  const start = await api('POST', '/api/stages/' + stage1.id + '/start', { token: leaderToken });
  check('开始答题返回 10 题', start.json?.data?.questions?.length === 10, start.json?.data?.questions?.length);
  const qs = start.json?.data?.questions || [];
  check('题目不含答案 (allowViewAnswer=false)', qs[0] && qs[0].answer === undefined, qs[0]);

  // 全部答对
  const correctAnswers = [];
  for (const q of qs) {
    // 从数据库取正确答案以构造全对场景
    const detail = await api('GET', '/api/questions/' + q.questionId, { token: adminToken });
    const raw = detail.json?.data?.answer;
    // 依据选项乱序映射还原为展示字母
    const reverse = {};
    q.options.forEach((o) => { reverse[o.letter] = o.letter; });
    // 用选项文本匹配原始选项，确定展示字母
    const optTexts = { A: detail.json?.data?.option_a, B: detail.json?.data?.option_b, C: detail.json?.data?.option_c, D: detail.json?.data?.option_d, E: detail.json?.data?.option_e, F: detail.json?.data?.option_f };
    const display = String(raw).split('').map((letter) => {
      const text = optTexts[letter];
      const found = q.options.find((o) => o.text === text);
      return found ? found.letter : letter;
    }).sort().join('');
    correctAnswers.push({ q, display });
  }

  let submitOk = 0;
  for (let i = 0; i < correctAnswers.length; i++) {
    const { q, display } = correctAnswers[i];
    const res = await api('POST', '/api/stages/' + stage1.id + '/answer', { token: leaderToken, body: { questionId: q.questionId, answer: display, timeSpent: 5 } });
    if (res.json?.data?.isCorrect === 1) submitOk++;
  }
  check('全部 10 题判定为正确', submitOk === 10, { submitOk });

  const finish = await api('POST', '/api/stages/' + stage1.id + '/submit', { token: leaderToken, body: { totalTime: 60 } });
  check('交卷成功', finish.json?.code === 0, finish.json);
  check('满分 = 20', finish.json?.data?.totalScore === 20, finish.json?.data);
  check('排名 = 1', finish.json?.data?.rank === 1, finish.json?.data?.rank);

  console.log('=== 7. 排行榜 ===');
  const rank = await api('GET', '/api/stages/' + stage1.id + '/rank', { token: leaderToken });
  check('排行榜含 1 支队伍', rank.json?.data?.list?.length >= 1, rank.json?.data?.list);
  check('排行榜第一名为 20 分', rank.json?.data?.list?.[0]?.totalScore === 20, rank.json?.data?.list?.[0]);

  console.log('=== 8. 错题本 ===');
  const wrong = await api('GET', '/api/stages/' + stage1.id + '/wrong', { token: leaderToken });
  check('未开启查看答案时不允许看错题', wrong.json?.data?.allowed === false, wrong.json?.data);

  // 开启允许查看答案
  await api('PUT', '/api/stages/' + stage1.id, { token: adminToken, body: { config: { allowViewAnswer: true } } });
  const wrong2 = await api('GET', '/api/stages/' + stage1.id + '/wrong', { token: leaderToken });
  check('开启后可查看错题', wrong2.json?.data?.allowed === true, wrong2.json?.data);
  check('错题列表为空 (全对)', wrong2.json?.data?.wrong?.length === 0, wrong2.json?.data?.wrong?.length);

  console.log('=== 9. 统计与预警 ===');
  const dash = await api('GET', '/api/admin/dashboard', { token: adminToken });
  check('仪表盘数据', dash.json?.data?.teamCount === 4 && dash.json?.data?.questionCount >= 22, dash.json?.data);

  const stats = await api('GET', '/api/admin/stats?stageId=' + stage1.id, { token: adminToken });
  check('统计概览', stats.json?.code === 0 && Array.isArray(stats.json?.data?.moduleAccuracy), stats.json?.data);

  const cheatReport = await api('POST', '/api/cheat/report', { token: leaderToken, body: { stageId: stage1.id, eventType: '切屏', duration: 12 } });
  check('上报预警成功', cheatReport.json?.code === 0, cheatReport.json);
  const cheatList = await api('GET', '/api/admin/cheat-logs', { token: adminToken });
  check('预警列表可查询', cheatList.json?.data?.total >= 1, cheatList.json?.data);

  const settings = await api('GET', '/api/admin/settings', { token: adminToken });
  check('系统设置返回 redis 状态', !!settings.json?.data?.redis?.driver, settings.json?.data);

  console.log('=== 10. 清理测试数据 ===');
  const cleanTeam = await api('DELETE', '/api/teams/' + newTeamId, { token: adminToken });
  check('删除测试队伍', cleanTeam.json?.code === 0, cleanTeam.json);
  await api('DELETE', '/api/questions/' + newQId, { token: adminToken });
  await api('DELETE', '/api/questions/' + judgeQId, { token: adminToken });

  console.log('');
  console.log('=========================================');
  console.log('  RESULT: ' + pass + ' passed, ' + fail + ' failed');
  if (failures.length) console.log('  FAILED: ' + failures.join(' | '));
  console.log('=========================================');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
