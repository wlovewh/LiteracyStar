'use strict';
const I = 'http://47.88.49.160/platform-api';
let pass = 0, fail = 0;
const check = (n, c, x) => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + ' :: ' + JSON.stringify(x).slice(0,180)); } };
(async () => {
  const admin = await (await fetch(I + '/auth/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ keyValue: 'ADMIN2026KEY' }) })).json();
  const at = admin.data.token;
  const user = await (await fetch(I + '/auth/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ keyValue: 'USER2026KEY' }) })).json();
  const ut = user.data.token;

  console.log('=== 线上准入矩阵 ===');
  // 开关开启
  await fetch(I + '/questions/settings', { method: 'PUT', headers: {'Content-Type':'application/json', Authorization: 'Bearer ' + at}, body: JSON.stringify({ searchEnabled: true }) });

  const anon = await fetch(I + '/questions/search?keyword=' + encodeURIComponent('信息'));
  check('开关开 · 匿名 → 拒绝', anon.status === 401, anon.status);

  const a1 = await (await fetch(I + '/questions/search?keyword=' + encodeURIComponent('信息'), { headers: { Authorization: 'Bearer ' + ut } })).json();
  check('开关开 · 已登录 → 可检索', a1.code === 0 && a1.data.total > 0, a1.message);
  console.log('      已登录命中:', a1.data && a1.data.total);

  // 建房间拿邀请码
  const room = await (await fetch(I + '/chat/rooms', { method: 'POST', headers: {'Content-Type':'application/json', Authorization: 'Bearer ' + at}, body: JSON.stringify({ teamId: 95, name: 'R11 线上准入验证' }) })).json();
  const rid = room.data.id;
  const inv = await (await fetch(I + '/chat/rooms/' + rid + '/invite', { method: 'POST', headers: { Authorization: 'Bearer ' + at } })).json();
  const code = inv.data.inviteCode;
  const g1 = await (await fetch(I + '/questions/search?keyword=' + encodeURIComponent('信息'), { headers: { 'X-Invite-Code': code } })).json();
  check('开关开 · 邀请码访客 → 可检索', g1.code === 0 && g1.data.total > 0, g1.message);

  // 开关关闭
  await fetch(I + '/questions/settings', { method: 'PUT', headers: {'Content-Type':'application/json', Authorization: 'Bearer ' + at}, body: JSON.stringify({ searchEnabled: false }) });
  const a2 = await (await fetch(I + '/questions/search?keyword=' + encodeURIComponent('信息'), { headers: { Authorization: 'Bearer ' + ut } })).json();
  check('开关关 · 已登录 → 仍可检索（关键修复）', a2.code === 0 && a2.data.total > 0, a2.message);
  const anon2 = await fetch(I + '/questions/search?keyword=x');
  check('开关关 · 匿名 → 拒绝', anon2.status === 401 || anon2.status === 403, anon2.status);
  const g2 = await fetch(I + '/questions/search?keyword=x', { headers: { 'X-Invite-Code': code } });
  check('开关关 · 邀请码访客 → 拒绝', g2.status === 403, g2.status);

  // 恢复开关 + 清理
  await fetch(I + '/questions/settings', { method: 'PUT', headers: {'Content-Type':'application/json', Authorization: 'Bearer ' + at}, body: JSON.stringify({ searchEnabled: true }) });
  await fetch(I + '/chat/rooms/' + rid + '/messages', { method: 'DELETE', headers: { Authorization: 'Bearer ' + at } });

  console.log('');
  console.log('RESULT: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
