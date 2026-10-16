'use strict';
(async () => {
  const login = await (await fetch('http://47.88.49.160/platform-api/auth/login', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ keyValue: 'USER2026KEY' })
  })).json();
  const tk = login.data.token;
  console.log('登录成功:', !!tk);

  const withAuth = await (await fetch('http://47.88.49.160/platform-api/questions/search?keyword=' + encodeURIComponent('信息'),
    { headers: { Authorization: 'Bearer ' + tk } })).json();
  console.log('已登录检索:', withAuth.code, withAuth.message, '| 命中', (withAuth.data && withAuth.data.total));

  const anon = await (await fetch('http://47.88.49.160/platform-api/questions/search?keyword=' + encodeURIComponent('信息'))).json();
  console.log('未登录检索:', anon.code, anon.message);

  const set = await (await fetch('http://47.88.49.160/platform-api/questions/settings')).json();
  console.log('当前开关:', JSON.stringify(set.data));
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
