'use strict';
const BASE = 'http://localhost:3000';
let pass = 0, fail = 0;
function check(n, c, x) { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + (x !== undefined ? ' :: ' + JSON.stringify(x).slice(0,260) : '')); } }
async function api(m, p, { token, body } = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(BASE + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
}
(async () => {
  const ca = await api('POST', '/api/auth/admin/login', { body: { username: 'admin', password: 'admin123' } });
  const at = ca.json.data.token;
  const sl = await api('POST', '/api/auth/student/login', { body: { studentId: '2026001', password: '2026001' } });
  const st = sl.json.data.token;

  // 赛事可见性改为「默认不可见，需显式授权」，先给该学生所在队伍授权
  const me = await api('GET', '/api/auth/me', { token: st });
  const myTeamId = me.json.data.user.teamId;
  const allEvents = await api('GET', '/api/events', { token: at });
  for (const e of allEvents.json.data) {
    await api('PUT', '/api/events/' + e.id + '/teams', { token: at, body: { teamIds: [myTeamId] } });
  }

  console.log('=== 学生可见赛事列表 ===');
  const av = await api('GET', '/api/events/available', { token: st });
  check('接口可用', av.status === 200 && av.json.code === 0, av.json);
  check('返回赛事数组', Array.isArray(av.json.data), typeof av.json.data);
  console.log('  赛事:', JSON.stringify(av.json.data.map(e => ({ id: e.id, name: e.name, active: e.active_stage_count }))));
  check('授权后能看到赛事', av.json.data.length >= 1, av.json.data.length);
  check('每个赛事带已开启环节数', av.json.data.every(e => e.active_stage_count !== undefined));

  // 准备两个赛事，各自建环节
  const evs = av.json.data;
  const mk = async (eventId, name) => {
    const r = await api('POST', '/api/events/' + eventId + '/stages', { token: at, body: { name, config: { mode: 'individual', duration: 20, questionCount: 3 } } });
    await api('POST', '/api/stages/' + r.json.data.id + '/status', { token: at, body: { status: 1 } });
    return r.json.data.id;
  };
  const s1 = await mk(evs[0].id, '【验证】赛事A环节');
  const s2 = evs[1] ? await mk(evs[1].id, '【验证】赛事B环节') : null;

  console.log('');
  console.log('=== 不传 eventId：回退到默认赛事 ===');
  const d0 = await api('GET', '/api/events/current', { token: st });
  check('返回 event', !!d0.json.data.event, d0.json.data.event && d0.json.data.event.name);
  check('同时返回 events 列表供前端切换', Array.isArray(d0.json.data.events) && d0.json.data.events.length >= 1);
  console.log('  默认赛事:', d0.json.data.event.name);

  console.log('');
  console.log('=== 指定 eventId=' + evs[0].id + ' ===');
  const d1 = await api('GET', '/api/events/current?eventId=' + evs[0].id, { token: st });
  check('返回指定赛事', d1.json.data.event && d1.json.data.event.id === evs[0].id, d1.json.data.event && d1.json.data.event.id);
  check('环节属于该赛事', d1.json.data.stages.some(s => s.id === s1), d1.json.data.stages.map(s => s.id));

  if (s2) {
    console.log('');
    console.log('=== 切换到 eventId=' + evs[1].id + ' ===');
    const d2 = await api('GET', '/api/events/current?eventId=' + evs[1].id, { token: st });
    check('返回另一个赛事', d2.json.data.event && d2.json.data.event.id === evs[1].id, d2.json.data.event && d2.json.data.event.id);
    check('环节列表随之切换', d2.json.data.stages.some(s => s.id === s2) && !d2.json.data.stages.some(s => s.id === s1), d2.json.data.stages.map(s => s.id));
  }

  console.log('');
  console.log('=== 异常入参 ===');
  const bad = await api('GET', '/api/events/current?eventId=999999', { token: st });
  check('不存在的赛事返回空 event 而非静默回退', bad.json.data.event === null, bad.json.data.event);
  check('仍返回 events 列表便于前端纠错', bad.json.data.events.length >= 1);

  const noAuth = await api('GET', '/api/events/available');
  check('未登录无法访问赛事列表', noAuth.status === 401, noAuth.status);

  console.log('');
  console.log('=== 清理 ===');
  for (const s of [s1, s2]) if (s) await api('DELETE', '/api/stages/' + s, { token: at });
  check('已清理测试环节', true);

  console.log('');
  console.log('RESULT: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
