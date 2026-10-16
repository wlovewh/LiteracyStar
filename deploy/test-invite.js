'use strict';
const I = 'http://localhost:3001/platform-api';
let pass = 0, fail = 0;
const check = (n, c, x) => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + ' :: ' + JSON.stringify(x).slice(0,180)); } };
(async () => {
  const admin = await (await fetch(I + '/auth/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ keyValue: 'ADMIN2026KEY' }) })).json();
  const at = admin.data.token;
  await fetch(I + '/questions/settings', { method: 'PUT', headers: {'Content-Type':'application/json', Authorization: 'Bearer ' + at}, body: JSON.stringify({ searchEnabled: true }) });

  // 建一个聊天室拿邀请码
  const room = await (await fetch(I + '/chat/rooms', { method: 'POST', headers: {'Content-Type':'application/json', Authorization: 'Bearer ' + at}, body: JSON.stringify({ teamId: 96, name: 'R11 邀请码门禁测试' }) })).json();
  const rid = room.data.id;
  const inv = await (await fetch(I + '/chat/rooms/' + rid + '/invite', { method: 'POST', headers: { Authorization: 'Bearer ' + at } })).json();
  const code = inv.data.inviteCode;
  console.log('邀请码:', code);

  console.log('');
  console.log('=== 持邀请码的访客 ===');
  const ok = await fetch(I + '/questions/search?keyword=' + encodeURIComponent('信息'), { headers: { 'X-Invite-Code': code } });
  const okJ = await ok.json();
  check('持有效邀请码可检索', okJ.code === 0 && okJ.data.total > 0, okJ.message);
  console.log('    命中:', okJ.data && okJ.data.total);

  const bad = await fetch(I + '/questions/search?keyword=x', { headers: { 'X-Invite-Code': '000000' } });
  const badJ = await bad.json();
  check('无效邀请码被拒绝', bad.status !== 200, { s: bad.status, m: badJ.message });
  console.log('    无效码:', bad.status, badJ.message);

  console.log('');
  console.log('=== 关闭开关后 ===');
  await fetch(I + '/questions/settings', { method: 'PUT', headers: {'Content-Type':'application/json', Authorization: 'Bearer ' + at}, body: JSON.stringify({ searchEnabled: false }) });
  const off = await fetch(I + '/questions/search?keyword=x', { headers: { 'X-Invite-Code': code } });
  const offJ = await off.json();
  check('关闭开关后持邀请码的访客被拒绝', off.status === 403, { s: off.status, m: offJ.message });
  console.log('    访客:', off.status, offJ.message);

  // 恢复 + 清理
  await fetch(I + '/questions/settings', { method: 'PUT', headers: {'Content-Type':'application/json', Authorization: 'Bearer ' + at}, body: JSON.stringify({ searchEnabled: true }) });
  await fetch(I + '/chat/rooms/' + rid + '/messages', { method: 'DELETE', headers: { Authorization: 'Bearer ' + at } });
  console.log('');
  console.log('RESULT: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
