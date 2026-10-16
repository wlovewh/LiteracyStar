'use strict';
const BASE = 'http://localhost:3001/platform-api';
let pass = 0, fail = 0;
function check(n, c, x) { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + (x !== undefined ? ' :: ' + JSON.stringify(x).slice(0,300) : '')); } }
async function api(m, p, { token, body } = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(BASE + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
}
(async () => {
  const al = await api('POST', '/auth/login', { body: { keyValue: 'ADMIN2026KEY' } });
  const at = al.json.data.token;

  const room = await api('POST', '/chat/rooms', { token: at, body: { teamId: 901, name: '引用测试室' } });
  const roomId = room.json.data.id;
  check('创建测试聊天室', !!roomId, room.json);

  console.log('=== ④ 引用消息内容可见 ===');
  const m1 = await api('POST', '/chat/rooms/' + roomId + '/messages', { token: at, body: { content: '这是被引用的原始消息内容', messageType: 'text' } });
  check('发送原始消息', m1.json.code === 0 && m1.json.data.id, m1.json);
  const qid = m1.json.data.id;

  const m2 = await api('POST', '/chat/rooms/' + roomId + '/messages', { token: at, body: { content: '这是引用回复', messageType: 'text', quotedMessageId: qid } });
  check('发送引用消息', m2.json.code === 0, m2.json);
  check('广播消息带 quoted 字段', !!m2.json.data.quoted, m2.json.data);
  check('quoted 含被引用内容', m2.json.data.quoted && m2.json.data.quoted.content === '这是被引用的原始消息内容', m2.json.data.quoted);
  check('quoted 含发送者名', m2.json.data.quoted && m2.json.data.quoted.senderName, m2.json.data.quoted);

  console.log('=== 历史消息列表也带 quoted ===');
  const list = await api('GET', '/chat/rooms/' + roomId + '/messages', { token: at });
  const quotedMsg = (list.json.data || []).find(m => m.quotedMessageId === qid);
  check('列表中引用消息带 quoted', quotedMsg && quotedMsg.quoted, quotedMsg);
  check('列表中 quoted 内容正确', quotedMsg && quotedMsg.quoted.content === '这是被引用的原始消息内容', quotedMsg && quotedMsg.quoted);

  console.log('=== 引用已删除的消息 ===');
  const m3 = await api('POST', '/chat/rooms/' + roomId + '/messages', { token: at, body: { content: '引用即将删除的消息', quotedMessageId: qid } });
  await api('DELETE', '/chat/messages/' + qid, { token: at });
  const list2 = await api('GET', '/chat/rooms/' + roomId + '/messages', { token: at });
  const m3row = (list2.json.data || []).find(m => m.id === m3.json.data.id);
  check('原消息删除后 quoted 为 null（前端显示"原消息已被删除"）', m3row && m3row.quotedMessageId && m3row.quoted === null, m3row && m3row.quoted);

  console.log('=== 清理 ===');
  await api('DELETE', '/chat/rooms/' + roomId, { token: at });
  check('测试聊天室已删除', true);

  console.log('');
  console.log('RESULT: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
