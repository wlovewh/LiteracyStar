'use strict';
/** 线上关键修复验证：队伍总榜、抢答不误判超时 */
const C = 'http://127.0.0.1:3000/api';
const db = require('./src/config/db');
const redis = require('./src/config/redis');
const rankService = require('./src/services/rankService');
let pass = 0, fail = 0;
const check = (n, c, x) => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + ' :: ' + JSON.stringify(x)); } };
const call = async (m, p, { token, body } = {}) => {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(C + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
};
(async () => {
  await redis.init().catch(() => {});

  // ---- 队伍总榜：真实数据 ----
  console.log('=== 队伍总榜（真实数据） ===');
  const rows = await db.query(
    'SELECT stage_id, team_id, COUNT(*) c, SUM(total_score) s FROM stage_scores GROUP BY stage_id, team_id ORDER BY s DESC LIMIT 5'
  );
  console.log('  stage_scores 分组:', JSON.stringify(rows));
  if (rows.length) {
    const sid = rows[0].stage_id;
    const expect = Number(rows[0].s);
    const list = await rankService.getRanking(sid, { limit: 50 });
    const got = list.find((r) => Number(r.teamId) === Number(rows[0].team_id));
    check('队伍总榜与数据库 SUM 一致', got && Number(got.totalScore) === expect, { got: got && got.totalScore, expect });
    console.log('  环节', sid, '队伍', rows[0].team_id, '=> 榜单', got && got.totalScore, '| DB SUM', expect);
  } else {
    console.log('  （线上暂无已交卷成绩，跳过）');
  }

  // ---- 抢答环节：进入不报超时 ----
  console.log('');
  console.log('=== 抢答环节进入不误判超时 ===');
  const ca = await call('POST', '/auth/admin/login', { body: { username: 'admin', password: 'admin123' } });
  const cat = ca.json.data.token;

  // 找抢答环节及其已授权的队伍
  const buzz = await db.queryOne(
    "SELECT id FROM stages WHERE status = 1 AND JSON_EXTRACT(config, '$.timeConfig.totalTime') = 0 AND JSON_EXTRACT(config, '$.timeConfig.perQuestionTime') > 0 LIMIT 1"
  );
  if (buzz) {
    const et = await db.queryOne(
      'SELECT t.id, t.leader_id FROM event_teams et JOIN teams t ON t.id = et.team_id WHERE et.event_id = (SELECT event_id FROM stages WHERE id = ?) AND t.status = 1 LIMIT 1',
      [buzz.id]
    );
    if (et && et.leader_id) {
      const lg = await call('POST', '/auth/student/login', { body: { studentId: et.leader_id, password: et.leader_id } });
      if (lg.json.code === 0) {
        const st = await call('POST', '/stages/' + buzz.id + '/start', { token: lg.json.data.token });
        check('start 成功', st.json.code === 0, st.json.message);
        check('expired = false（不再一进考场就超时）', st.json.data && st.json.data.expired === false, st.json.data && st.json.data.expired);
        check('timeLimit = 0（无整体时限）', st.json.data && Number(st.json.data.timeLimit) === 0, st.json.data && st.json.data.timeLimit);
        check('perQuestionTime > 0（按单题计时）', st.json.data && Number(st.json.data.perQuestionTime) > 0, st.json.data && st.json.data.perQuestionTime);
        console.log('  环节', buzz.id, '| 队伍', et.id, '| 单题时限', st.json.data && st.json.data.perQuestionTime, '秒');
      } else {
        console.log('  （该队伍成员登录失败，跳过）');
      }
    } else {
      console.log('  （未找到已授权队伍，跳过）');
    }
  } else {
    console.log('  （未找到抢答环节）');
  }

  console.log('');
  console.log('RESULT: ' + pass + ' passed, ' + fail + ' failed');
  await db.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
