'use strict';
/**
 * 第九轮修复验证。
 * 覆盖：①不可返回赛制、②会话校验、④赛事可见范围、⑤补交与超时、⑥服务端用时。
 */
const BASE = 'http://127.0.0.1:3000/api';
let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; fails.push(name); console.log('  FAIL ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra).slice(0, 300) : '')); }
}
const db = require('../src/config/db');

/** 彻底删除测试赛事：先清依赖数据，再删环节与赛事本身 */
async function purgeEvent(eid) {
  try {
    const stages = await db.query('SELECT id FROM stages WHERE event_id = ?', [eid]);
    for (const s of stages) {
      await db.execute('DELETE FROM answers WHERE stage_id = ?', [s.id]);
      await db.execute('DELETE FROM stage_scores WHERE stage_id = ?', [s.id]);
      await db.execute('DELETE FROM stage_papers WHERE stage_id = ?', [s.id]);
      await db.execute('DELETE FROM stage_attempts WHERE stage_id = ?', [s.id]);
    }
    await db.execute('DELETE FROM event_teams WHERE event_id = ?', [eid]);
    await db.execute('DELETE FROM stages WHERE event_id = ?', [eid]);
    await db.execute('DELETE FROM events WHERE id = ?', [eid]);
  } catch (e) {
    console.log('  （清理赛事 ' + eid + ' 失败: ' + e.message + '）');
  }
}

async function api(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch (_) {}
  return { status: res.status, json };
}

(async () => {
  const admin = await api('POST', '/auth/admin/login', { body: { username: 'admin', password: 'admin123' } });
  const at = admin.json.data.token;

  // ============ ⑥ 服务端用时 ============
  console.log('');
  console.log('=== ⑥ 交卷用时以服务端记录为准 ===');
  {
    const ev = await api('POST', '/events', { token: at, body: { name: 'R9用时测试', description: 'auto', status: 1 } });
    const eid = ev.json.data.id;
    const st = await api('POST', '/events/' + eid + '/stages', {
      token: at,
      body: {
        name: '用时环节', sortOrder: 1,
        config: { mode: 'individual', questionCount: 2, timeConfig: { totalTime: 600, perQuestionTime: 60 },
                  selection: { mode: 'random', modules: [], difficulties: [], count: 2 },
                  scoring: { correct: 4, wrong: -1, unanswered: 0 },
                  examConfig: { allowSkip: true, allowReturn: true, shuffleOptions: false, showAnswer: false } }
      }
    });
    const sid = st.json.data.id;
    await api('POST', '/stages/' + sid + '/status', { token: at, body: { status: 1 } });

    const stu = await api('POST', '/auth/student/login', { body: { studentId: '2026001', password: '2026001' } });
    const stk = stu.json.data.token;

    const start = await api('POST', '/stages/' + sid + '/start', { token: stk });
    check('开考返回 availableTime', start.json.data.availableTime > 0, start.json.data.availableTime);

    // 模拟"进入后经过一段时间"：直接把 stage_attempts.started_at 往前拨 125 秒
    const db = require('../src/config/db');
    await db.execute('UPDATE stage_attempts SET started_at = DATE_SUB(NOW(), INTERVAL 125 SECOND) WHERE stage_id = ?', [sid]);

    // 前端故意传一个错误的、偏小的 totalTime，服务端应忽略它
    const sub = await api('POST', '/stages/' + sid + '/submit', { token: stk, body: { totalTime: 489 } });
    check('交卷成功', sub.json.code === 0, sub.json.message);
    check('用时取服务端值(~125s)，忽略前端传的 489', Math.abs(sub.json.data.totalTime - 125) <= 3, sub.json.data.totalTime);

    await purgeEvent(eid);
    console.log('  （已清理测试赛事 ' + eid + '）');
  }

  // ============ ⑤ 交卷补记已选未提交的答案 ============
  console.log('');
  console.log('=== ⑤ 已选未提交的答案随交卷补记 ===');
  {
    const ev = await api('POST', '/events', { token: at, body: { name: 'R9补交测试', description: 'auto', status: 1 } });
    const eid = ev.json.data.id;
    const st = await api('POST', '/events/' + eid + '/stages', {
      token: at,
      body: {
        name: '补交环节', sortOrder: 1,
        config: { mode: 'individual', questionCount: 2, timeConfig: { totalTime: 600, perQuestionTime: 0 },
                  selection: { mode: 'random', modules: [], difficulties: [], count: 2 },
                  scoring: { correct: 4, wrong: -1, unanswered: 0 },
                  examConfig: { allowSkip: true, allowReturn: true, shuffleOptions: false, showAnswer: false } }
      }
    });
    const sid = st.json.data.id;
    await api('POST', '/stages/' + sid + '/status', { token: at, body: { status: 1 } });

    const stu = await api('POST', '/auth/student/login', { body: { studentId: '2026001', password: '2026001' } });
    const stk = stu.json.data.token;
    const start = await api('POST', '/stages/' + sid + '/start', { token: stk });
    const all = start.json.data.questions || [];
    const qs = all.filter((q) => q.options && q.options.length);
    check('下发题目含选项', qs.length >= 2, { total: all.length, withOptions: qs.length });

    // 按学生卷面还原正确答案的展示字母。
    // 选项乱序映射语义为 { 原始字母: 展示字母 }，直接查表即可。
    const displayOf = async (q) => {
      const d = await api('GET', '/questions/' + q.questionId, { token: at });
      const map = q.optionMap || {};
      return String(d.json.data.answer).split('').map((L) => map[L] || map[L.toUpperCase()] || L).sort().join('');
    };

    const a0 = await displayOf(qs[0]);
    const a1 = await displayOf(qs[1]);

    // 只提交第一题；第二题"选了但没提交"，随交卷请求一起发送
    await api('POST', '/stages/' + sid + '/answer', { token: stk, body: { questionId: qs[0].questionId, answer: a0, timeSpent: 5 } });

    const sub = await api('POST', '/stages/' + sid + '/submit', {
      token: stk,
      body: { pendingAnswers: [{ questionId: qs[1].questionId, answer: a1, timeSpent: 5 }] }
    });
    check('带 pendingAnswers 交卷成功', sub.json.code === 0, sub.json.message);
    check('已作答数 +1（补记生效）', Number(sub.json.data.answeredCount) === 2, sub.json.data.answeredCount);

    // 落库校验：第二题确实写进了 answers 表，且被判定为正确
    const db = require('../src/config/db');
    const saved = await db.query(
      'SELECT user_answer, is_correct, score_delta FROM answers WHERE stage_id = ? AND question_id = ?',
      [sid, qs[1].questionId]
    );
    check('第二题已落库', saved.length === 1, saved);
    check('第二题判定为正确', saved.length === 1 && Number(saved[0].is_correct) === 1, saved);
    const allRows = await db.query('SELECT score_delta FROM answers WHERE stage_id = ?', [sid]);
    const sumDelta = allRows.reduce((s, r) => s + Number(r.score_delta || 0), 0);
    check('总分 = 各题得分之和', Number(sub.json.data.totalScore) === sumDelta, {
      total: sub.json.data.totalScore, sum: sumDelta
    });

    await purgeEvent(eid);
    console.log('  （已清理测试赛事 ' + eid + '）');
  }

  // ============ ④ 赛事可见范围 ============
  console.log('');
  console.log('=== ④ 赛事可见范围 ===');
  {
    const evA = await api('POST', '/events', { token: at, body: { name: 'R9可见A', description: 'auto', status: 1 } });
    const evB = await api('POST', '/events', { token: at, body: { name: 'R9可见B', description: 'auto', status: 1 } });
    const idA = evA.json.data.id, idB = evB.json.data.id;

    const teams = await api('GET', '/teams', { token: at });
    const tlist = teams.json.data.list || teams.json.data;
    const team1 = tlist[0].id, team2 = tlist[1] ? tlist[1].id : tlist[0].id;

    // 未配置白名单 -> 全部可见
    const before = await api('GET', '/events/available', { token: at });
    check('未配置白名单时赛事对全体可见',
      (before.json.data || []).some((e) => e.id === idA), (before.json.data || []).map((e) => e.id));

    // 给 A 配置只对 team1 可见
    const setv = await api('PUT', '/events/' + idA + '/teams', { token: at, body: { teamIds: [team1] } });
    check('保存可见范围成功', setv.json.code === 0, setv.json.message);
    check('返回 restricted=true', setv.json.data.restricted === true, setv.json.data);

    const got = await api('GET', '/events/' + idA + '/teams', { token: at });
    check('读回白名单', (got.json.data || []).length === 1 && got.json.data[0].teamId === team1, got.json.data);

    const ov = await api('GET', '/events/visibility/overview', { token: at });
    check('总览包含该赛事', (ov.json.data[String(idA)] || []).includes(team1), ov.json.data[String(idA)]);

    // 队伍侧入口读到同样的数据
    const te = await api('GET', '/teams/' + team1 + '/events', { token: at });
    check('队伍侧读到同一份可见赛事', (te.json.data || []).includes(idA), te.json.data);

    // 取消限制 -> 恢复全员可见
    await api('PUT', '/events/' + idA + '/teams', { token: at, body: { teamIds: [] } });
    const cleared = await api('GET', '/events/' + idA + '/teams', { token: at });
    check('清空白名单后恢复对全体开放', (cleared.json.data || []).length === 0, cleared.json.data);

    await purgeEvent(idA);
    await purgeEvent(idB);
    console.log('  （已清理测试赛事 ' + idA + '、' + idB + '）');
  }

  // ============ ① 不可返回赛制的服务端约束 ============
  console.log('');
  console.log('=== ① 不允许返回的赛制 ===');
  {
    const ev = await api('POST', '/events', { token: at, body: { name: 'R9不可返回', description: 'auto', status: 1 } });
    const eid = ev.json.data.id;
    const st = await api('POST', '/events/' + eid + '/stages', {
      token: at,
      body: {
        name: '不可返回环节', sortOrder: 1,
        config: { mode: 'individual', questionCount: 2, timeConfig: { totalTime: 600, perQuestionTime: 60 },
                  selection: { mode: 'random', modules: [], difficulties: [], count: 2 },
                  scoring: { correct: 4, wrong: -1, unanswered: 0 },
                  examConfig: { allowSkip: true, allowReturn: false, shuffleOptions: false, showAnswer: false } }
      }
    });
    const sid = st.json.data.id;
    await api('POST', '/stages/' + sid + '/status', { token: at, body: { status: 1 } });

    const detail = await api('GET', '/stages/' + sid, { token: at });
    const cfg = detail.json.data.config || {};
    const sp = cfg.specialConfig || {};
    check('配置中 allowReturn=false 已保存', sp.allowReturn === false, sp);
    check('配置中 allowSkip=true 已保存', sp.allowSkip === true, sp);

    await purgeEvent(eid);
    console.log('  （已清理测试赛事 ' + eid + '）');
  }

  // ============ ② 会话校验 ============
  console.log('');
  console.log('=== ② 会话有效性校验 ===');
  {
    const me = await api('GET', '/auth/me', { token: at });
    const who = me.json.data && (me.json.data.user || me.json.data);
    check('/auth/me 返回当前身份', me.json.code === 0 && who.role === 'admin', who);
    const bad = await api('GET', '/auth/me', { token: 'invalid.token.here' });
    check('无效令牌返回 401', bad.status === 401, bad.status);
  }

  console.log('');
  console.log('RESULT: ' + pass + ' passed, ' + fail + ' failed');
  if (fails.length) console.log('FAILED: ' + fails.join(' | '));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
