'use strict';
/** 第十二轮线上全站巡检 */
const C = 'http://127.0.0.1:3000/api';
const I = 'http://127.0.0.1:3001/platform-api';
let pass = 0, fail = 0;
const check = (n, c, x) => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + ' :: ' + JSON.stringify(x)); } };
const call = async (base, m, p, { token, body } = {}) => {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(base + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
};
(async () => {
  console.log('=== 赛事端 ===');
  const ca = await call(C, 'POST', '/auth/admin/login', { body: { username: 'admin', password: 'admin123' } });
  const cat = ca.json.data.token;
  check('管理员登录', ca.json.code === 0);

  for (const [name, path] of [
    ['赛事列表', '/events'], ['队伍列表', '/teams?page=1&pageSize=5'],
    ['题库列表', '/questions?page=1&pageSize=5'], ['统计概览', '/admin/stats'],
    ['环节选项', '/stages/options'], ['预警日志', '/admin/cheat-logs?page=1&pageSize=5']
  ]) {
    const r = await call(C, 'GET', path, { token: cat });
    check(name + ' 可访问', r.json.code === 0, r.json.message);
  }

  // 排行榜接口
  const st = await call(C, 'GET', '/stages/options', { token: cat });
  const sid = (st.json.data || [])[0] && st.json.data[0].id;
  if (sid) {
    const rk = await call(C, 'GET', '/rank/' + sid, { token: cat });
    check('排行榜接口可访问', rk.json.code === 0, rk.json.message);
    check('排行榜返回 board 字段', rk.json.data && rk.json.data.board !== undefined, rk.json.data && rk.json.data.board);
  }

  console.log('');
  console.log('=== 综合平台 ===');
  const ia = await call(I, 'POST', '/auth/login', { body: { keyValue: 'ADMIN2026KEY' } });
  const iat = ia.json.data.token;
  check('管理员登录', ia.json.code === 0);

  for (const [name, path] of [
    ['资源分类', '/resources/categories'], ['资源网站', '/resources/sites?page=1&pageSize=5'],
    ['聊天室列表', '/chat/rooms'], ['题库检索', '/questions/search?page=1&pageSize=5'],
    ['题库分面', '/questions/facets'], ['常用语', '/chat/phrases'], ['访问密钥', '/auth/keys?page=1&pageSize=5']
  ]) {
    const r = await call(I, 'GET', path, { token: iat });
    check(name + ' 可访问', r.json.code === 0, r.json.message);
  }

  // 公开页面
  console.log('');
  console.log('=== 前端页面 ===');
  for (const [name, url] of [
    ['赛事端首页', 'http://127.0.0.1/'],
    ['综合平台首页', 'http://127.0.0.1/platform/']
  ]) {
    const r = await fetch(url);
    const html = await r.text();
    check(name + ' 返回 200', r.status === 200, r.status);
    check(name + ' 含挂载点', html.includes('id="app"'), html.slice(0, 100));
  }

  console.log('');
  console.log('RESULT: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
