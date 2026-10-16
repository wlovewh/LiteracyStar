'use strict';
/** 线上验收：③ 密钥弹窗 ④ 聊天室在线与搜索 */
const API = 'http://47.88.49.160/platform-api';
let pass = 0, fail = 0;
const check = (n, c, x) => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + (x !== undefined ? ' :: ' + JSON.stringify(x).slice(0,200) : '')); } };

(async () => {
  console.log('=== 站点可访问 ===');
  for (const p of ['/', '/platform/']) {
    const r = await fetch('http://47.88.49.160' + p);
    check('页面 ' + p, r.status === 200, r.status);
  }

  console.log('');
  console.log('=== ③ 密钥登录接口（弹窗依赖的登录链路） ===');
  const bad = await (await fetch(API + '/auth/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ keyValue: 'WRONGKEY' }) })).json();
  check('无效密钥被拒绝', bad.code !== 0, bad.message);
  const good = await (await fetch(API + '/auth/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ keyValue: 'USER2026KEY' }) })).json();
  check('有效密钥可登录', good.code === 0 && good.data.token, good.message);

  console.log('');
  console.log('=== ④ 聊天室在线与搜索 ===');
  const admin = await (await fetch(API + '/auth/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ keyValue: 'ADMIN2026KEY' }) })).json();
  const at = admin.data.token;
  const room = await (await fetch(API + '/chat/rooms', { method: 'POST', headers: {'Content-Type':'application/json', Authorization: 'Bearer ' + at}, body: JSON.stringify({ teamId: 99, name: 'R10 验收室' }) })).json();
  check('创建/获取聊天室', room.code === 0, room.message);
  const roomId = room.data.id;

  const sent = await (await fetch(API + '/chat/rooms/' + roomId + '/messages', {
    method: 'POST', headers: {'Content-Type':'application/json', Authorization: 'Bearer ' + at},
    body: JSON.stringify({ senderName: '验收员', senderRole: 'leader', content: '关键词定位测试消息' })
  })).json();
  check('发送消息', sent.code === 0 && sent.data.id, sent.message);

  const found = await (await fetch(API + '/chat/rooms/' + roomId + '/search?keyword=' + encodeURIComponent('关键词定位'), { headers: { Authorization: 'Bearer ' + at } })).json();
  check('搜索能命中消息', found.code === 0 && found.data.length >= 1, found.data && found.data.length);
  check('命中结果含消息 id（供前端定位）', found.data[0] && found.data[0].id !== undefined, found.data[0]);

  const online = await (await fetch(API + '/chat/rooms/' + roomId + '/online', { headers: { Authorization: 'Bearer ' + at } })).json();
  check('在线列表接口可用', online.code === 0 && Array.isArray(online.data), online.message);

  console.log('');
  console.log('=== ② 抢答题每题时限配置 ===');
  const admin2 = await (await fetch('http://47.88.49.160/api/auth/admin/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ username: 'admin', password: 'admin123' }) })).json();
  const ct = admin2.data.token;
  const stages = await (await fetch('http://47.88.49.160/api/events/1/stages', { headers: { Authorization: 'Bearer ' + ct } })).json();
  const buzzer = (stages.data || []).find(s => /抢答/.test(s.name));
  check('找到抢答环节', !!buzzer, (stages.data || []).map(s => s.name));
  if (buzzer) {
    const d = await (await fetch('http://47.88.49.160/api/stages/' + buzzer.id, { headers: { Authorization: 'Bearer ' + ct } })).json();
    console.log('    抢答环节 perQuestionTime =', d.data.perQuestionTime, ', totalTime =', d.data.totalTime);
    check('环节详情下发 perQuestionTime 字段', d.data.perQuestionTime !== undefined, Object.keys(d.data).slice(0, 12));
  }

  console.log('');
  console.log('RESULT: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
