'use strict';
/** 第九轮公网验收 */
const C = 'http://47.88.49.160/api';
const I = 'http://47.88.49.160/platform-api';
let pass = 0, fail = 0;
const fails = [];
function check(n, c, x) {
  if (c) { pass++; console.log('  PASS ' + n); }
  else { fail++; fails.push(n); console.log('  FAIL ' + n + (x !== undefined ? ' :: ' + JSON.stringify(x).slice(0, 250) : '')); }
}
async function api(base, m, p, { token, body } = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(base + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
}
(async () => {
  const a = await api(C, 'POST', '/auth/admin/login', { body: { username: 'admin', password: 'admin123' } });
  const at = a.json.data.token;

  console.log('=== 站点可访问 ===');
  for (const p of ['/', '/login', '/admin/login', '/platform/']) {
    const r = await fetch('http://47.88.49.160' + p);
    check('页面 ' + p, r.status === 200, r.status);
  }

  console.log('');
  console.log('=== ④ 赛事可见范围（线上） ===');
  {
    const ov = await api(C, 'GET', '/events/visibility/overview', { token: at });
    check('可见范围总览接口可用', ov.json.code === 0, ov.json.message);
    const teams = await api(C, 'GET', '/teams', { token: at });
    const tl = teams.json.data.list || teams.json.data;
    check('队伍列表可读', Array.isArray(tl) && tl.length > 0, tl && tl.length);

    const evs = await api(C, 'GET', '/events', { token: at });
    const ev = (evs.json.data.list || evs.json.data)[0];
    const before = await api(C, 'GET', '/events/' + ev.id + '/teams', { token: at });
    check('读取赛事可见队伍', before.json.code === 0, before.json.message);

    // 设一次再清空，确保线上表可写
    const setv = await api(C, 'PUT', '/events/' + ev.id + '/teams', { token: at, body: { teamIds: [tl[0].id] } });
    check('写入可见范围成功', setv.json.code === 0, setv.json.message);
    const after = await api(C, 'GET', '/events/' + ev.id + '/teams', { token: at });
    check('读回写入结果', (after.json.data || []).length === 1, after.json.data);
    await api(C, 'PUT', '/events/' + ev.id + '/teams', { token: at, body: { teamIds: [] } });
    const cleared = await api(C, 'GET', '/events/' + ev.id + '/teams', { token: at });
    check('恢复全部可见', (cleared.json.data || []).length === 0, cleared.json.data);
  }

  console.log('');
  console.log('=== ② 会话校验（线上） ===');
  {
    const me = await api(C, 'GET', '/auth/me', { token: at });
    const who = me.json.data && (me.json.data.user || me.json.data);
    check('/auth/me 返回身份', me.json.code === 0 && who.role === 'admin', who);
    const bad = await api(C, 'GET', '/auth/me', { token: 'bad.token.x' });
    check('无效令牌 401', bad.status === 401, bad.status);
  }

  console.log('');
  console.log('=== 备份功能（线上） ===');
  {
    const lg = await api(I, 'POST', '/auth/login', { body: { keyValue: 'ADMIN2026KEY' } });
    const tk = lg.json.data.token;
    const ov = await api(I, 'GET', '/admin/backup', { token: tk });
    check('备份总览可读', ov.json.code === 0, ov.json.message);
    check('返回 config 与 list', ov.json.data.config !== undefined && Array.isArray(ov.json.data.list), Object.keys(ov.json.data || {}));

    const run = await api(I, 'POST', '/admin/backup/run', { token: tk });
    check('线上手动备份成功', run.json.code === 0 && run.json.data.status === 'ok', run.json.message || run.json.data);
    if (run.json.code === 0) {
      check('备份文件非空', run.json.data.fileSize > 1000, run.json.data.fileSize);
      const dl = await fetch(I + '/admin/backup/download/' + run.json.data.filename, { headers: { Authorization: 'Bearer ' + tk } });
      check('可下载备份', dl.status === 200, dl.status);
      const body = await dl.text();
      check('内容是 SQL 转储', body.includes('CREATE TABLE'), body.slice(0, 60));
      const rm = await api(I, 'DELETE', '/admin/backup/' + run.json.data.id, { token: tk });
      check('可删除备份', rm.json.code === 0, rm.json.message);
    }
  }

  console.log('');
  console.log('=== 数据完好性 ===');
  {
    const tb = await api(C, 'GET', '/rank/2?board=team', { token: at });
    const rows = (tb.json.data && tb.json.data.list) || [];
    check('环节2 队伍榜仍有数据', rows.length === 2, rows.length);
    check('17 队 36 分', rows.some(r => Number(r.teamId) === 17 && r.totalScore === 36), rows);
  }

  console.log('');
  console.log('RESULT: ' + pass + ' passed, ' + fail + ' failed');
  if (fails.length) console.log('FAILED: ' + fails.join(' | '));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
