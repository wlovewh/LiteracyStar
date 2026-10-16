'use strict';
/** 第十二轮线上验收 */
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
  check('管理员登录', ca.json.code === 0, ca.json.message);
  const cat = ca.json.data.token;

  const opts = await call(C, 'GET', '/stages/options', { token: cat });
  check('GET /stages/options 可用', opts.json.code === 0 && Array.isArray(opts.json.data), opts.json.message);
  console.log('  环节数:', opts.json.data ? opts.json.data.length : 0);

  // 抢答环节配置应含 rankBoard 与 perQuestionTime/totalTime=0
  const stages = opts.json.data || [];
  let checked = 0;
  for (const s of stages) {
    const det = await call(C, 'GET', '/stages/' + s.id, { token: cat });
    const cfg = det.json.data.config;
    if (cfg.buzzer) {
      check('抢答环节 ' + s.id + ' rankBoard 已下发', cfg.rankBoard !== undefined, cfg.rankBoard);
      check('抢答环节 ' + s.id + ' totalTime=0', Number(cfg.timeConfig.totalTime) === 0, cfg.timeConfig.totalTime);
      check('抢答环节 ' + s.id + ' speedRanking 开启', cfg.timeConfig.speedRanking === true, cfg.timeConfig.speedRanking);
      checked += 1;
      if (checked >= 2) break;
    }
  }
  check('找到抢答环节', checked > 0, checked);

  // 队伍总榜非 0（线上真实数据）
  const evs = await call(C, 'GET', '/events', { token: cat });
  console.log('  赛事数:', (evs.json.data || []).length);

  console.log('');
  console.log('=== 综合平台 ===');
  const ia = await call(I, 'POST', '/auth/login', { body: { keyValue: 'ADMIN2026KEY' } });
  check('管理员登录', ia.json.code === 0, ia.json.message);
  const iat = ia.json.data.token;

  const cats = await call(I, 'GET', '/resources/categories', { token: iat });
  const first = (cats.json.data || [])[0];
  if (first) {
    const ren = await call(I, 'PUT', '/resources/categories/' + first.id, { token: iat, body: { name: 'X改名' } });
    check('分类改名被拒 403', ren.status === 403, ren.status);
    const del = await call(I, 'DELETE', '/resources/categories/' + first.id, { token: iat });
    check('分类删除被拒 403', del.status === 403, del.status);
  }

  const rooms = await call(I, 'GET', '/chat/rooms', { token: iat });
  const room = (rooms.json.data && (rooms.json.data.list || rooms.json.data))[0];
  if (room) {
    const orig = room.invite_code;
    const set = await call(I, 'POST', '/chat/rooms/' + room.id + '/invite', { token: iat, body: { code: '555666' } });
    check('自定义房间码可用', set.json.code === 0 && set.json.data.inviteCode === '555666', set.json);
    const found = await call(I, 'GET', '/chat/rooms/by-invite?code=555666', { token: iat });
    check('可用新码进入房间', found.json.code === 0 && found.json.data.id === room.id, found.json.message);
    await call(I, 'POST', '/chat/rooms/' + room.id + '/invite', { token: iat, body: { code: orig } });
    const back = await call(I, 'GET', '/chat/rooms/' + room.id, { token: iat });
    check('已还原原房间码', back.json.data.invite_code === orig, back.json.data.invite_code);
  }

  console.log('');
  console.log('RESULT: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
