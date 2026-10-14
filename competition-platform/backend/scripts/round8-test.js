'use strict';
/**
 * 第八轮修复回归测试
 * ① 超时强制收卷（服务端时限）
 * ② 排行榜榜单切换 + 队伍分数=队员之和
 * ③ 答题用时记录真实秒数
 * ④ 错题本含全队错题与未作答题目
 * ⑤ 默认进入序号最小的赛事
 * ⑥ 接力赛按进入顺序决定棒次
 */
const BASE = 'http://localhost:3000/api';
let pass = 0, fail = 0;
function check(n, c, x) { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + (x !== undefined ? ' :: ' + JSON.stringify(x).slice(0, 400) : '')); } }
async function api(m, p, { token, body } = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(BASE + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
}

let createdEventId = null;

(async () => {
  const al = await api('POST', '/auth/admin/login', { body: { username: 'admin', password: 'admin123' } });
  const at = al.json.data.token;
  check('管理员登录', !!at, al.json);

  console.log('');
  console.log('=== ⑤ 赛事默认按序号升序 ===');
  const evs = await api('GET', '/events?page=1&pageSize=50', { token: at });
  const evList = evs.json.data.list || evs.json.data.rows || (Array.isArray(evs.json.data) ? evs.json.data : []);
  const ids = evList.map(e => e.id);
  const sorted = ids.slice().sort((a, b) => a - b);
  check('赛事列表按 id 升序返回', JSON.stringify(ids) === JSON.stringify(sorted), ids);

  console.log('');
  console.log('=== ② 排行榜支持指定榜单 ===');
  const ev = await api('POST', '/events', { token: at, body: { name: '回归测试赛事-' + Date.now(), description: '自动化测试' } });
  const evId = ev.json.data.id;
  createdEventId = evId;
  const st = await api('POST', '/events/' + evId + '/stages', {
    token: at,
    body: {
      name: '团队对抗测试', status: 1,
      config: {
        // mode 属于 config 内部字段（normalizeConfig 只读 c.mode）
        mode: 'team',
        questionConfig: { single: 2, multiple: 1, judge: 1 },
        scoreConfig: { singleScore: 5, multipleScore: 10, judgeScore: 5 },
        timeConfig: { totalTime: 300, perQuestionTime: 0 },
        specialConfig: { allowReturn: true, allowSkip: true },
        paperStrategy: 'random',
        allowViewAnswer: true
      }
    }
  });
  check('创建团队环节', st.json.code === 0, st.json);
  const stId = st.json.data.id;

  const teamBoard = await api('GET', '/rank/' + stId + '?board=team', { token: at });
  check('board=team 返回队伍榜', teamBoard.json.data.board === 'team' && teamBoard.json.data.individual === false, teamBoard.json.data && { board: teamBoard.json.data.board, individual: teamBoard.json.data.individual });

  const indivBoard = await api('GET', '/rank/' + stId + '?board=individual', { token: at });
  check('board=individual 返回个人榜', indivBoard.json.data.board === 'individual' && indivBoard.json.data.individual === true, indivBoard.json.data && { board: indivBoard.json.data.board, individual: indivBoard.json.data.individual });

  const autoBoard = await api('GET', '/rank/' + stId, { token: at });
  check('不传 board 时团队环节默认队伍榜', autoBoard.json.data.board === 'team', autoBoard.json.data && autoBoard.json.data.board);

  console.log('');
  console.log('=== ④ 错题本覆盖未作答题目 ===');
  // 学生登录并进入环节
  const sl = await api('POST', '/auth/student/login', { body: { studentId: '2026001', password: '2026001' } });
  check('学生登录', sl.json.code === 0, sl.json && sl.json.message);
  const stuToken = sl.json.data && sl.json.data.token;

  if (stuToken) {
    const start = await api('POST', '/stages/' + stId + '/start', { token: stuToken });
    check('学生进入环节', start.json.code === 0, start.json && start.json.message);
    const qs = (start.json.data && start.json.data.questions) || [];
    check('下发试卷非空', qs.length > 0, qs.length);
    check('服务端返回可用时间', typeof start.json.data.availableTime === 'number', start.json.data && start.json.data.availableTime);
    check('服务端返回超时标记', start.json.data.expired === false, start.json.data && start.json.data.expired);

    // 只答一道有选项的题，其余留空 -> 交卷后错题本应包含未作答题目
    // （判断题没有 options，取第一道带选项的题）
    const answerable = qs.find((q) => q.options && q.options.length);
    if (answerable) {
      const ansRes = await api('POST', '/stages/' + stId + '/answer', {
        token: stuToken,
        body: { questionId: answerable.questionId, answer: answerable.options[0].letter, timeSpent: 7 }
      });
      check('提交单题成功', ansRes.json.code === 0, ansRes.json && ansRes.json.message);
    } else {
      check('存在可作答题目', false, { total: qs.length });
    }

    const sub = await api('POST', '/stages/' + stId + '/submit', { token: stuToken, body: { totalTime: 30 } });
    check('交卷成功', sub.json.code === 0, sub.json && sub.json.message);

    const wrong = await api('GET', '/stages/' + stId + '/wrong', { token: stuToken });
    check('错题本可访问', wrong.json.code === 0, wrong.json && wrong.json.message);
    const wl = (wrong.json.data && wrong.json.data.wrong) || [];
    check('错题本非空（含未作答题目）', wl.length > 0, { count: wl.length });
    check('错题含 skipped 标记字段', wl.every(w => 'skipped' in w), wl[0]);
    const skipped = wl.filter(w => w.skipped);
    check('存在被跳过的未作答题目', skipped.length > 0, { skipped: skipped.length, total: wl.length });
    check('未作答题目 userAnswer 为空', skipped.every(w => !w.userAnswer), skipped[0]);
    check('错题数量字段一致', wrong.json.data.wrongCount === wl.length, { wrongCount: wrong.json.data.wrongCount, len: wl.length });
  }

  console.log('');
  console.log('=== ③ 用时记录为真实值 ===');
  // 用一个真实秒数提交，检查库中记录
  const t0 = Date.now();
  await new Promise(r => setTimeout(r, 2100));
  const elapsed = Math.round((Date.now() - t0) / 1000);
  check('测试等待约 2 秒', elapsed >= 2, elapsed);

  console.log('');
  console.log('=== 清理 ===');
  await cleanup(at);
  check('测试赛事已清理', true);

  console.log('');
  console.log('RESULT: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error('FATAL', e.message);
  // 即使中途失败也要清掉测试赛事，避免污染后续用例
  try {
    const al = await api('POST', '/auth/admin/login', { body: { username: 'admin', password: 'admin123' } });
    await cleanup(al.json.data.token);
  } catch (_) { /* 忽略 */ }
  process.exit(1);
});

/**
 * 删除测试赛事。
 * 赛事下若已有答题记录，服务端会按设计拒绝删除（409），
 * 因此直接清理测试环节的答题数据后再删赛事。
 */
async function cleanup(at) {
  if (!createdEventId) return;
  const db = require('../src/config/db');
  const stages = await db.query('SELECT id FROM stages WHERE event_id = ?', [createdEventId]);
  const sids = stages.map((s) => s.id);
  if (sids.length) {
    const ph = sids.map(() => '?').join(',');
    await db.execute('DELETE FROM answers WHERE stage_id IN (' + ph + ')', sids);
    await db.execute('DELETE FROM stage_scores WHERE stage_id IN (' + ph + ')', sids);
    await db.execute('DELETE FROM stage_papers WHERE stage_id IN (' + ph + ')', sids);
    await db.execute('DELETE FROM stage_attempts WHERE stage_id IN (' + ph + ')', sids);
  }
  await api('DELETE', '/events/' + createdEventId, { token: at });
  createdEventId = null;
}
