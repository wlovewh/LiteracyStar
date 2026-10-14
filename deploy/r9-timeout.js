'use strict';
const C = 'http://127.0.0.1:3000/api';
const db = require('/var/www/competition-platform/backend/src/config/db');
let pass = 0, fail = 0;
function check(n, c, x) { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + (x !== undefined ? ' :: ' + JSON.stringify(x).slice(0,250) : '')); } }
async function api(m, p, { token, body } = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(C + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
}
(async () => {
  const a = await api('POST', '/auth/admin/login', { body: { username: 'admin', password: 'admin123' } });
  if (a.json.code !== 0) { console.error('登录失败: ' + a.json.message); process.exit(1); }
  const at = a.json.data.token;

  const ev = await api('POST', '/events', { token: at, body: { name: 'R9超时验证', description: 'auto', status: 1 } });
  const eid = ev.json.data.id;
  const st = await api('POST', '/events/' + eid + '/stages', { token: at, body: {
    name: '超时环节', sortOrder: 1,
    config: { mode: 'individual', questionCount: 2, timeConfig: { totalTime: 30, perQuestionTime: 0 },
      selection: { mode: 'random', modules: [], difficulties: [], count: 2 },
      scoring: { correct: 4, wrong: -1, unanswered: 0 },
      examConfig: { allowSkip: true, allowReturn: true, shuffleOptions: false, showAnswer: false } } } });
  const sid = st.json.data.id;
  await api('POST', '/stages/' + sid + '/status', { token: at, body: { status: 1 } });

  const stu = await api('POST', '/auth/student/login', { body: { studentId: '25102011060', password: '25102011060' } });
  if (stu.json.code !== 0) { console.error('学生登录失败: ' + stu.json.message); process.exit(1); }
  const stk = stu.json.data.token;

  const start = await api('POST', '/stages/' + sid + '/start', { token: stk });
  const qs = start.json.data.questions || [];
  check('开考下发题目', qs.length > 0, qs.length);
  check('开考返回 availableTime=30', start.json.data.availableTime === 30, start.json.data.availableTime);

  const q1 = qs.find(q => q.options && q.options.length);
  check('有带选项的题目', !!q1);
  if (q1) {
    const ok = await api('POST', '/stages/' + sid + '/answer', { token: stk, body: { questionId: q1.questionId, answer: q1.options[0].letter, timeSpent: 3 } });
    check('时限内可作答', ok.json.code === 0, ok.json.message);
  }

  await db.execute('UPDATE stage_attempts SET started_at = DATE_SUB(NOW(), INTERVAL 100 SECOND) WHERE stage_id = ?', [sid]);

  if (q1) {
    const late = await api('POST', '/stages/' + sid + '/answer', { token: stk, body: { questionId: q1.questionId, answer: q1.options[1] ? q1.options[1].letter : 'A', timeSpent: 3 } });
    check('超时后拒绝作答 (403)', late.status === 403, { status: late.status, msg: late.json && late.json.message });
  }

  const sub = await api('POST', '/stages/' + sid + '/submit', { token: stk, body: { totalTime: 12 } });
  check('超时后仍可交卷', sub.json.code === 0, sub.json.message);
  if (sub.json.code === 0) {
    check('用时取服务端 ~100s 而非前端传的 12s', Math.abs(sub.json.data.totalTime - 100) <= 3, sub.json.data.totalTime);
  }

  await db.execute('DELETE FROM answers WHERE stage_id = ?', [sid]);
  await db.execute('DELETE FROM stage_scores WHERE stage_id = ?', [sid]);
  await db.execute('DELETE FROM stage_papers WHERE stage_id = ?', [sid]);
  await db.execute('DELETE FROM stage_attempts WHERE stage_id = ?', [sid]);
  await db.execute('DELETE FROM stages WHERE event_id = ?', [eid]);
  await db.execute('DELETE FROM events WHERE id = ?', [eid]);
  console.log('  （已清理测试赛事 ' + eid + '）');

  console.log('');
  console.log('RESULT: ' + pass + ' passed, ' + fail + ' failed');
  await db.close();
  process.exit(fail ? 1 : 0);
})().catch(async e => { console.error('FATAL', e.message); process.exit(1); });
