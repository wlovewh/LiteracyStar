'use strict';
/** 第十四轮线上验收 */
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
  console.log('=== 赛事端：数据统计（多赛事）===');
  const ca = await call(C, 'POST', '/auth/admin/login', { body: { username: 'admin', password: 'admin123' } });
  const cat = ca.json.data.token;
  const evs = await call(C, 'GET', '/events', { token: cat });
  const events = evs.json.data || [];
  check('赛事数 >= 2（线上确实有两个赛事）', events.length >= 2, events.length);

  for (const ev of events) {
    const st = await call(C, 'GET', '/events/' + ev.id + '/stages', { token: cat });
    const list = st.json.data || [];
    const hasScoreField = list.every((x) => x.hasScore !== undefined);
    check('赛事 ' + ev.id + ' 环节带 hasScore', hasScoreField, list.map((x) => x.hasScore));

    // 默认选中逻辑
    const picked =
      list.find((s) => Number(s.status) === 1 && Number(s.hasScore) > 0) ||
      list.find((s) => Number(s.hasScore) > 0) ||
      list.find((s) => Number(s.status) === 1) ||
      list[0];
    check('赛事 ' + ev.id + ' 能选出默认环节', !!picked, picked && picked.id);

    if (picked) {
      const r = await call(C, 'GET', '/admin/stats?stageId=' + picked.id, { token: cat });
      const d = r.json.data || {};
      const b = (d.distribution && d.distribution.buckets) || [];
      const hasAny = b.length || (d.questionAccuracy || []).length || (d.moduleAccuracy || []).length || (d.teamComparison || []).length;
      check('赛事 ' + ev.id + ' 默认环节(' + picked.id + ')有图表数据', !!hasAny,
        { buckets: b.length, q: (d.questionAccuracy||[]).length, m: (d.moduleAccuracy||[]).length, t: (d.teamComparison||[]).length });
    }

    // 空环节也必须 code=0 且返回空数组（前端画占位图）
    let emptyOk = true;
    for (const stg of list) {
      const r = await call(C, 'GET', '/admin/stats?stageId=' + stg.id, { token: cat });
      if (r.json.code !== 0) { emptyOk = false; break; }
      const d = r.json.data || {};
      if (!Array.isArray(d.questionAccuracy) || !Array.isArray(d.moduleAccuracy) || !Array.isArray(d.teamComparison)) { emptyOk = false; break; }
    }
    check('赛事 ' + ev.id + ' 全部环节统计接口正常', emptyOk, ev.id);
  }

  console.log('');
  console.log('=== 综合平台：资源收录页权限 ===');
  const ia = await call(I, 'POST', '/auth/login', { body: { keyValue: 'ADMIN2026KEY' } });
  const iat = ia.json.data.token;
  check('管理员登录', ia.json.code === 0);
  const cats = await call(I, 'GET', '/resources/categories?all=1', { token: iat });
  check('资源分类可访问', cats.json.code === 0, cats.json.message);
  const sites = await call(I, 'GET', '/resources/sites?page=1&pageSize=5&all=1', { token: iat });
  check('资源网站可访问', sites.json.code === 0, sites.json.message);

  // 批量导入接口仍在
  const tpl = await fetch(I + '/resources/sites/import-template', { headers: { Authorization: 'Bearer ' + iat } });
  check('批量导入模板可下载', tpl.status === 200, tpl.status);

  console.log('');
  console.log('=== 前端产物 ===');
  const p1 = await fetch('http://127.0.0.1/');
  check('赛事端首页 200', p1.status === 200, p1.status);
  const p2 = await fetch('http://127.0.0.1/platform/');
  check('综合平台首页 200', p2.status === 200, p2.status);

  console.log('');
  console.log('RESULT: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
