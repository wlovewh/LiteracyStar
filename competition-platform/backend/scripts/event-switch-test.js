'use strict';
const BASE = 'http://localhost:3000';
let pass = 0, fail = 0;
function check(n, c, x) { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + (x !== undefined ? ' :: ' + JSON.stringify(x).slice(0,300) : '')); } }
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

  // 临时新建第二个赛事，构造多赛事场景
  const created = await api('POST', '/api/events', { token: at, body: { name: '【验证】第二赛事', description: '用于多赛事切换测试', status: 1 } });
  const evB = created.json.data;
  check('临时赛事创建成功', !!evB.id, created.json);
  const evA = (await api('GET', '/api/events', { token: at })).json.data.find(e => e.id !== evB.id);

  const av = await api('GET', '/api/events/available', { token: st });
  console.log('学生可见赛事:', JSON.stringify(av.json.data.map(e => ({ id: e.id, name: e.name.slice(0, 18), active: e.active_stage_count }))));
  check('多赛事场景成立（>=2）', av.json.data.length >= 2, av.json.data.length);

  const mk = async (eventId, name) => {
    const r = await api('POST', '/api/events/' + eventId + '/stages', { token: at, body: { name, config: { mode: 'individual', duration: 20, questionCount: 3 } } });
    await api('POST', '/api/stages/' + r.json.data.id + '/status', { token: at, body: { status: 1 } });
    return r.json.data.id;
  };
  const sA = await mk(evA.id, '【多赛事】A环节');
  const sB = await mk(evB.id, '【多赛事】B环节');

  console.log('');
  console.log('=== 赛事切换 ===');
  const dA = await api('GET', '/api/events/current?eventId=' + evA.id, { token: st });
  check('选中A -> 返回A', dA.json.data.event.id === evA.id, dA.json.data.event.id);
  check('A 环节含 A环节、不含 B环节', dA.json.data.stages.some(s => s.id === sA) && !dA.json.data.stages.some(s => s.id === sB), dA.json.data.stages.map(s => s.id));

  const dB = await api('GET', '/api/events/current?eventId=' + evB.id, { token: st });
  check('切换到B -> 返回B', dB.json.data.event.id === evB.id, dB.json.data.event.id);
  check('B 环节含 B环节、不含 A环节', dB.json.data.stages.some(s => s.id === sB) && !dB.json.data.stages.some(s => s.id === sA), dB.json.data.stages.map(s => s.id));
  check('两次都返回完整 events 列表', dA.json.data.events.length >= 2 && dB.json.data.events.length >= 2);

  console.log('');
  console.log('=== 默认（不传 eventId） ===');
  const dDef = await api('GET', '/api/events/current', { token: st });
  // 第八轮起默认进入"序号最小"的启用赛事（不再跳最新建的）
check('默认进入序号最小的启用赛事', dDef.json.data.event.id === Math.min(...av.json.data.map(e => e.id)), dDef.json.data.event.id);

  console.log('');
  console.log('=== 停用后不再可选 ===');
  await api('PUT', '/api/events/' + evB.id, { token: at, body: { status: 0 } });
  const av2 = await api('GET', '/api/events/available', { token: st });
  check('停用赛事从列表消失', !av2.json.data.some(e => e.id === evB.id), av2.json.data.map(e => e.id));
  const dStale = await api('GET', '/api/events/current?eventId=' + evB.id, { token: st });
  check('指定已停用赛事返回空 event（前端会纠错回退）', dStale.json.data.event === null, dStale.json.data.event);

  console.log('');
  console.log('=== 清理 ===');
  await api('DELETE', '/api/stages/' + sA, { token: at });
  await api('DELETE', '/api/events/' + evB.id, { token: at });
  const fin = await api('GET', '/api/events', { token: at });
  check('临时赛事已删除', !fin.json.data.some(e => e.id === evB.id), fin.json.data.map(e => e.id));

  console.log('');
  console.log('RESULT: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
