'use strict';
(async () => {
  const admin = await (await fetch('http://47.88.49.160/platform-api/auth/login', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ keyValue: 'ADMIN2026KEY' })
  })).json();
  const at = admin.data.token;

  // 关闭访客检索
  const off = await (await fetch('http://47.88.49.160/platform-api/questions/settings', {
    method: 'PUT', headers: {'Content-Type':'application/json', Authorization: 'Bearer ' + at},
    body: JSON.stringify({ searchEnabled: false })
  })).json();
  console.log('关闭开关:', off.code, off.message);

  const anon = await (await fetch('http://47.88.49.160/platform-api/questions/search?keyword=x')).json();
  console.log('  未登录检索:', anon.code, anon.message, '<- 应为 403');

  const user = await (await fetch('http://47.88.49.160/platform-api/auth/login', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ keyValue: 'USER2026KEY' })
  })).json();
  const authed = await (await fetch('http://47.88.49.160/platform-api/questions/search?keyword=' + encodeURIComponent('信息'),
    { headers: { Authorization: 'Bearer ' + user.data.token } })).json();
  console.log('  已登录检索:', authed.code, authed.message, '| 命中', authed.data && authed.data.total, '<- 应为 0 ok');

  // 恢复开关
  const on = await (await fetch('http://47.88.49.160/platform-api/questions/settings', {
    method: 'PUT', headers: {'Content-Type':'application/json', Authorization: 'Bearer ' + at},
    body: JSON.stringify({ searchEnabled: true })
  })).json();
  console.log('恢复开关:', on.code);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
