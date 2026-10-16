'use strict';
/** 线上验收：第十一轮修复项 */
const C = 'http://47.88.49.160/api';
const I = 'http://47.88.49.160/platform-api';
let pass = 0, fail = 0;
const check = (n, c, x) => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + (x !== undefined ? ' :: ' + JSON.stringify(x).slice(0,220) : '')); } };
const api = async (base, m, p, { token, body } = {}) => {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(base + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('=== ① /auth/me 身份完整（刷新不掉登录） ===');
  const sl = await api(C, 'POST', '/auth/student/login', { body: { studentId: '25102011060', password: '25102011060' } });
  const st = sl.json.data.token;
  const loginUser = sl.json.data.user;
  const me = await api(C, 'GET', '/auth/me', { token: st });
  const meUser = me.json.data.user;
  console.log('    登录返回:', JSON.stringify(loginUser));
  console.log('    /auth/me :', JSON.stringify(meUser));
  check('/auth/me 含 role', meUser.role === 'leader' || meUser.role === 'member', meUser.role);
  check('/auth/me 含 teamId', Number(meUser.teamId) > 0, meUser.teamId);
  check('/auth/me 含 teamName', !!meUser.teamName, meUser.teamName);
  check('/auth/me 含 name', !!meUser.name, meUser.name);
  check('字段集与登录一致',
    Object.keys(loginUser).every(k => meUser[k] !== undefined),
    { login: Object.keys(loginUser), me: Object.keys(meUser) });

  console.log('');
  console.log('=== ① 刷新不重置倒计时 ===');
  const evs = await api(C, 'GET', '/events/available', { token: st });
  check('学生可见赛事', (evs.json.data || []).length >= 1, evs.json.data && evs.json.data.length);
  const cur = await api(C, 'GET', '/events/current?eventId=' + evs.json.data[0].id, { token: st });
  const stage = (cur.json.data.stages || []).find(s => s.status === 1);
  check('找到已开启环节', !!stage, stage && stage.name);
  if (stage) {
    const r1 = await api(C, 'POST', '/stages/' + stage.id + '/start', { token: st });
    if (r1.json.data.expired) {
      console.log('    （该环节本次尝试已到时，跳过计时断言——非功能缺陷）');
    }
    check('开考返回 startedAt 锚点', !!r1.json.data.startedAt, r1.json.data.startedAt);
    check('开考返回 timeLimit', r1.json.data.timeLimit !== undefined, r1.json.data.timeLimit);
    const a1 = Number(r1.json.data.availableTime);
    await sleep(4000);
    if (r1.json.data.expired) { console.log('    （已到时，跳过刷新递减断言）'); }
    const r2 = await api(C, 'POST', '/stages/' + stage.id + '/start', { token: st });
    const a2 = Number(r2.json.data.availableTime);
    check('刷新后倒计时继续递减', a1 - a2 >= 3 && a1 - a2 <= 7, { a1, a2, delta: a1 - a2 });
    check('刷新不重置为满额', a2 < a1, { a1, a2 });
    check('startedAt 保持不变', String(r1.json.data.startedAt) === String(r2.json.data.startedAt),
      { f: r1.json.data.startedAt, s: r2.json.data.startedAt });
  }

  console.log('');
  console.log('=== ⑤ 综合平台密钥登录接口 ===');
  const bad = await api(I, 'POST', '/auth/login', { body: { keyValue: 'NOPE' } });
  check('无效密钥被拒绝', bad.json.code !== 0, bad.json.message);
  const good = await api(I, 'POST', '/auth/login', { body: { keyValue: 'USER2026KEY' } });
  check('有效密钥可登录', good.json.code === 0 && good.json.data.token, good.json.message);

  console.log('');
  console.log('=== ⑦ 题目发送到聊天室（消息能落库） ===');
  const admin = await api(I, 'POST', '/auth/login', { body: { keyValue: 'ADMIN2026KEY' } });
  const at = admin.json.data.token;
  const room = await api(I, 'POST', '/chat/rooms', { token: at, body: { teamId: 98, name: 'R11 验收室' } });
  const roomId = room.json.data.id;
  await api(I, 'DELETE', '/chat/rooms/' + roomId + '/messages', { token: at });
  const sent = await api(I, 'POST', '/chat/rooms/' + roomId + '/messages', {
    token: at,
    body: { senderName: '验收员', senderRole: 'leader', content: 'R11 题目发送验证', messageType: 'question', extra: { questionId: 1 } }
  });
  check('题目消息成功落库', sent.json.code === 0 && sent.json.data.id, sent.json.message);
  const msgs = await api(I, 'GET', '/chat/rooms/' + roomId + '/messages', { token: at });
  const found = (msgs.json.data || []).find(m => m.content === 'R11 题目发送验证');
  check('消息可被拉取到', !!found, (msgs.json.data || []).length);
  check('消息类型为 question', found && found.messageType === 'question', found && found.messageType);

  console.log('');
  console.log('=== ⑥ 聊天室搜索 ===');
  const sr = await api(I, 'GET', '/chat/rooms/' + roomId + '/search?keyword=' + encodeURIComponent('R11 题目'), { token: at });
  check('搜索命中', sr.json.code === 0 && (sr.json.data || []).length >= 1, (sr.json.data || []).length);
  check('命中结果含 id（供定位）', sr.json.data[0] && sr.json.data[0].id !== undefined, sr.json.data[0]);

  console.log('');
  console.log('RESULT: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
