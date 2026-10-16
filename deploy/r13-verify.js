'use strict';
/** 第十三轮线上验收 */
const C = 'http://127.0.0.1:3000/api';
const I = 'http://127.0.0.1:3001/platform-api';
let pass = 0, fail = 0;
const check = (n, c, x) => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + ' :: ' + JSON.stringify(x)); } };
const call = async (base, m, p, { token, body } = {}) => {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(base + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (_) {}
  return { status: r.status, json: j };
};
(async () => {
  console.log('=== 赛事端 ===');
  const ca = await call(C, 'POST', '/auth/admin/login', { body: { username: 'admin', password: 'admin123' } });
  const cat = ca.json.data.token;
  check('管理员登录', ca.json.code === 0);

  // ① eventName 不再是 undefined
  const opts = await call(C, 'GET', '/stages/options', { token: cat });
  check('GET /stages/options 可用', opts.json.code === 0, opts.json.message);
  const missing = (opts.json.data || []).filter((s) => !s.eventName);
  check('环节均带 eventName（修复 undefined）', missing.length === 0, missing.length);
  check('eventName 为赛事名称', (opts.json.data[0] || {}).eventName === '2026年福建省大学生信息素养大赛（校内模拟）', (opts.json.data[0] || {}).eventName);

  // ② 赛事 + 环节两级筛选
  const evs = await call(C, 'GET', '/events', { token: cat });
  check('赛事列表可访问', evs.json.code === 0, evs.json.message);
  check('赛事数 >= 1', (evs.json.data || []).length >= 1, (evs.json.data || []).length);
  const e0 = (evs.json.data || [])[0];
  if (e0) {
    const st = await call(C, 'GET', '/events/' + e0.id + '/stages', { token: cat });
    check('按赛事取环节可访问', st.json.code === 0, st.json.message);
    check('该赛事下有环节', (st.json.data || []).length > 0, (st.json.data || []).length);
  }

  console.log('');
  console.log('=== 综合平台 ===');
  const ia = await call(I, 'POST', '/auth/login', { body: { keyValue: 'ADMIN2026KEY' } });
  const iat = ia.json.data.token;
  check('管理员登录', ia.json.code === 0);

  // ③ 分类编辑 / 删除
  const tmpName = '线上临时' + Date.now().toString().slice(-6);
  const made = await call(I, 'POST', '/resources/categories', { token: iat, body: { name: tmpName, sortOrder: 99, status: 1 } });
  check('新建分类', made.json.code === 0, made.json.message);
  const tmpId = made.json.data && made.json.data.id;
  if (tmpId) {
    const renamed = tmpName + '改';
    const re = await call(I, 'PUT', '/resources/categories/' + tmpId, { token: iat, body: { name: renamed } });
    check('分类可以改名（已恢复）', re.json.code === 0 && re.json.data.name === renamed, re.json);
    const del = await call(I, 'DELETE', '/resources/categories/' + tmpId, { token: iat });
    check('空分类可以删除（已恢复）', del.json.code === 0, del.json.message);
  }
  const cats = await call(I, 'GET', '/resources/categories?all=1', { token: iat });
  const withSites = (cats.json.data || []).find((c) => Number(c.site_count) > 0);
  if (withSites) {
    const del = await call(I, 'DELETE', '/resources/categories/' + withSites.id, { token: iat });
    check('有网站的分类仍禁止删除', del.status === 409, del.status);
  }

  // ④ 批量导入 + 模板
  const rows = [
    { 所属分类: '线上导入验证', 网站名称: '甲', 网址: 'https://r13-a.example.com', 简介: '', 图标: '', 排序: '1', 状态: '开启' },
    { 所属分类: '线上导入验证', 网站名称: '缺网址', 网址: '', 简介: '', 图标: '', 排序: '', 状态: '' }
  ];
  const im = await call(I, 'POST', '/resources/sites/import', { token: iat, body: { rows } });
  check('批量导入接口可用', im.json.code === 0, im.json.message);
  check('成功 1 条 / 失败 1 条', im.json.data.inserted === 1 && im.json.data.failed === 1, im.json.data);
  check('分类自动创建', (im.json.data.createdCategories || []).includes('线上导入验证'), im.json.data.createdCategories);
  const tpl = await fetch(I + '/resources/sites/import-template', { headers: { Authorization: 'Bearer ' + iat } });
  check('模板下载 200', tpl.status === 200, tpl.status);
  const buf = Buffer.from(await tpl.arrayBuffer());
  check('模板为 xlsx 且非空', buf.length > 500, buf.length);
  // 清理
  const c2 = await call(I, 'GET', '/resources/categories?all=1', { token: iat });
  const impCat = (c2.json.data || []).find((c) => c.name === '线上导入验证');
  if (impCat) {
    const ss = await call(I, 'GET', '/resources/sites?categoryId=' + impCat.id + '&all=1&pageSize=50', { token: iat });
    for (const s of (ss.json.data && ss.json.data.list) || []) await call(I, 'DELETE', '/resources/sites/' + s.id, { token: iat });
    await call(I, 'DELETE', '/resources/categories/' + impCat.id, { token: iat });
  }

  // ⑤ 删除聊天室
  const rooms = await call(I, 'GET', '/chat/rooms', { token: iat });
  const rl = (rooms.json.data && (rooms.json.data.list || rooms.json.data)) || [];
  const someTeam = rl.length && rl[0].team_id ? rl[0].team_id : 1;
  const mk = await call(I, 'POST', '/chat/rooms', { body: { teamId: someTeam, name: '线上删除验证' } });
  check('创建临时聊天室', mk.json.code === 0, mk.json.message);
  const rid = mk.json.data && (mk.json.data.id || (mk.json.data.room && mk.json.data.room.id));
  if (rid) {
    const del = await call(I, 'DELETE', '/chat/rooms/' + rid, { token: iat });
    check('删除聊天室成功', del.json.code === 0, del.json.message);
    const after = await call(I, 'GET', '/chat/rooms/' + rid, { token: iat });
    check('删除后房间不存在', after.json.code !== 0, after.json);
  }

  // ⑥ 前端产物含新功能
  console.log('');
  console.log('=== 前端产物 ===');
  const idx = await fetch('http://127.0.0.1/platform/');
  check('综合平台首页 200', idx.status === 200, idx.status);
  const idx2 = await fetch('http://127.0.0.1/');
  check('赛事端首页 200', idx2.status === 200, idx2.status);

  console.log('');
  console.log('RESULT: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
