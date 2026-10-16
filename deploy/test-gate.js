'use strict';
const I = 'http://localhost:3001/platform-api';
let pass = 0, fail = 0;
const check = (n, c, x) => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + ' :: ' + JSON.stringify(x).slice(0,180)); } };

(async () => {
  const admin = await (await fetch(I + '/auth/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ keyValue: 'ADMIN2026KEY' }) })).json();
  const at = admin.data.token;
  console.log('=== 开关开启时 ===');
  await fetch(I + '/questions/settings', { method: 'PUT', headers: {'Content-Type':'application/json', Authorization: 'Bearer ' + at}, body: JSON.stringify({ searchEnabled: true }) });

  const anon = await fetch(I + '/questions/search?keyword=' + encodeURIComponent('信息'));
  const anonJ = await anon.json();
  check('匿名无邀请码被拒绝(401)', anon.status === 401, { s: anon.status, m: anonJ.message });
  console.log('    匿名:', anon.status, anonJ.message);

  const user = await (await fetch(I + '/auth/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ keyValue: 'USER2026KEY' }) })).json();
  const ut = user.data.token;
  const authed = await (await fetch(I + '/questions/search?keyword=' + encodeURIComponent('信息'), { headers: { Authorization: 'Bearer ' + ut } })).json();
  check('已登录可检索', authed.code === 0 && authed.data.total > 0, authed.message);
  console.log('    已登录命中:', authed.data && authed.data.total);

  const detail = await (await fetch(I + '/questions/2077', { headers: { Authorization: 'Bearer ' + ut } })).json();
  check('已登录可取详情', detail.code === 0, detail.message);

  // 开关关闭后，已登录仍可用
  await fetch(I + '/questions/settings', { method: 'PUT', headers: {'Content-Type':'application/json', Authorization: 'Bearer ' + at}, body: JSON.stringify({ searchEnabled: false }) });
  const authed2 = await (await fetch(I + '/questions/search?keyword=' + encodeURIComponent('信息'), { headers: { Authorization: 'Bearer ' + ut } })).json();
  check('关闭开关后已登录仍可检索', authed2.code === 0 && authed2.data.total > 0, authed2.message);

  const anon2 = await fetch(I + '/questions/search?keyword=x');
  check('关闭开关后匿名仍被拒绝', anon2.status === 401 || anon2.status === 403, anon2.status);

  // 恢复
  await fetch(I + '/questions/settings', { method: 'PUT', headers: {'Content-Type':'application/json', Authorization: 'Bearer ' + at}, body: JSON.stringify({ searchEnabled: true }) });
  console.log('');
  console.log('RESULT: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
