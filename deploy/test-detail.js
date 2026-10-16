'use strict';
const I = 'http://localhost:3001/platform-api';
(async () => {
  const user = await (await fetch(I + '/auth/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ keyValue: 'USER2026KEY' }) })).json();
  const ut = user.data.token;
  const s = await (await fetch(I + '/questions/search?keyword=' + encodeURIComponent('信息'), { headers: { Authorization: 'Bearer ' + ut } })).json();
  const realId = s.data.list[0].id;
  console.log('真实题目 id:', realId);
  const d = await (await fetch(I + '/questions/' + realId, { headers: { Authorization: 'Bearer ' + ut } })).json();
  console.log('已登录取详情:', d.code, d.code === 0 ? '成功' : d.message);
  const anonD = await fetch(I + '/questions/' + realId);
  console.log('匿名取详情:', anonD.status, (await anonD.json()).message);
  const fac = await fetch(I + '/questions/facets');
  console.log('匿名取 facets:', fac.status);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
