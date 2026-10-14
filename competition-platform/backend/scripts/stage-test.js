'use strict';
const BASE = 'http://localhost:3000';
let pass = 0, fail = 0;
function check(n, c, x) { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + (x !== undefined ? ' :: ' + JSON.stringify(x).slice(0,240) : '')); } }
async function api(m, p, { token, body } = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(BASE + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
}
(async () => {
  const ca = await api('POST', '/api/auth/admin/login', { body: { username: 'admin', password: 'admin123' } });
  const at = ca.json.data.token;

  const ev = await api('GET', '/api/events', { token: at });
  const list = ev.json.data && (ev.json.data.list || ev.json.data) || [];
  const id = list[0].id;
  console.log('测试赛事 id =', id);

  console.log('=== 新建环节（原来 500） ===');
  const r = await api('POST', '/api/events/' + id + '/stages', { token: at, body: {
    name: '【验证】新建环节', config: { mode: 'individual', duration: 30, questionCount: 5 }
  }});
  check('新建环节返回 200', r.status === 200, r.status);
  check('返回 code=0', r.json.code === 0, r.json);
  check('返回环节 id', r.json.data && r.json.data.id, r.json.data);
  const sid = r.json.data && r.json.data.id;
  check('环节名称正确', r.json.data && r.json.data.name === '【验证】新建环节', r.json.data && r.json.data.name);

  console.log('=== 最小请求体 {name} ===');
  const r2 = await api('POST', '/api/events/' + id + '/stages', { token: at, body: { name: '【验证】最小体' } });
  check('仅传 name 也能创建', r2.status === 200 && r2.json.code === 0, r2.json);
  const sid2 = r2.json.data && r2.json.data.id;

  console.log('=== 环节列表 ===');
  const st = await api('GET', '/api/events/' + id + '/stages', { token: at });
  check('列表包含新环节', st.json.data.some(s => s.id === sid), st.json.data.map(s => s.id));

  console.log('=== 排序（同样使用该控制器） ===');
  const ro = await api('PUT', '/api/events/' + id + '/stages/reorder', { token: at, body: { ids: [sid2, sid] } });
  check('环节排序正常', ro.status === 200 && ro.json.code === 0, ro.json);

  console.log('=== 异常入参 ===');
  const bad = await api('POST', '/api/events/' + id + '/stages', { token: at, body: { name: '' } });
  check('空名称返回业务错误而非 500', bad.status === 400 || bad.json.code === 1, bad.json);
  const noEvent = await api('POST', '/api/events/999999/stages', { token: at, body: { name: 'x' } });
  check('不存在的赛事返回 404', noEvent.status === 404, noEvent.json);

  console.log('=== 清理 ===');
  for (const s of [sid, sid2]) if (s) await api('DELETE', '/api/stages/' + s, { token: at });
  const after = await api('GET', '/api/events/' + id + '/stages', { token: at });
  check('测试环节已清理', !after.json.data.some(s => s.id === sid || s.id === sid2), after.json.data.map(s => s.id));

  console.log('');
  console.log('RESULT: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
