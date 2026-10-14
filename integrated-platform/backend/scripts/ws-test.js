'use strict';
const WebSocket = require('ws');
const BASE = 'http://localhost:3001/platform-api';
let pass = 0, fail = 0;
function check(n, c, x) { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? ' :: ' + JSON.stringify(x).slice(0,200) : '')); } }
async function api(m, p, { token, body } = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(BASE + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined });
  return await r.json().catch(() => null);
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const admin = await api('POST', '/auth/login', { body: { keyValue: 'ADMIN2026KEY' } });
  const at = admin.data.token;
  const room = await api('POST', '/chat/rooms', { body: { teamId: 99, name: 'WS 测试室' } });
  const roomId = room.data.id;
  await api('DELETE', '/chat/rooms/' + roomId + '/messages', { token: at });

  console.log('=== WebSocket 实时聊天 ===');
  const wsA = new WebSocket('ws://localhost:3001/platform-ws?roomId=' + roomId + '&memberKey=A&name=张伟');
  const wsB = new WebSocket('ws://localhost:3001/platform-ws?roomId=' + roomId + '&memberKey=B&name=李四');

  const gotB = [];
  wsB.on('message', (d) => gotB.push(JSON.parse(d.toString())));
  await new Promise((res, rej) => { wsA.on('open', res); wsA.on('error', rej); });
  await new Promise((res, rej) => { wsB.on('open', res); wsB.on('error', rej); });
  check('两个客户端均连接成功', wsA.readyState === 1 && wsB.readyState === 1);
  await sleep(400);

  const ready = gotB.find(m => m.type === 'ready');
  check('收到 ready 帧', !!ready, gotB[0]);
  check('收到在线成员广播', gotB.some(m => m.type === 'online'), gotB.map(m=>m.type));

  // A 发消息，B 应实时收到
  gotB.length = 0;
  wsA.send(JSON.stringify({ type: 'message', content: '第 5 题选 A' }));
  await sleep(700);
  const msg = gotB.find(m => m.type === 'message');
  check('B 实时收到 A 的消息', !!msg && msg.message.content === '第 5 题选 A', msg);
  check('消息带发送者姓名', msg && msg.message.senderName === '张伟', msg && msg.message);

  // 答案冲突：A 选 A，B 选 B
  gotB.length = 0;
  wsA.send(JSON.stringify({ type: 'answer', questionId: 7, answer: 'A' }));
  await sleep(500);
  wsB.send(JSON.stringify({ type: 'answer', questionId: 7, answer: 'B' }));
  await sleep(800);
  const sys = gotB.find(m => m.type === 'message' && m.message.messageType === 'system');
  check('广播答案冲突系统消息', !!sys && /答案冲突/.test(sys.message.content), sys && sys.message.content);
  check('冲突内容含双方答案', sys && /A/.test(sys.message.content) && /B/.test(sys.message.content), sys && sys.message.content);

  // 心跳：响应只回给发起方
  const gotA = [];
  wsA.on('message', (d) => gotA.push(JSON.parse(d.toString())));
  gotA.length = 0;
  wsA.send(JSON.stringify({ type: 'heartbeat' }));
  await sleep(500);
  check('心跳响应回给发起方', gotA.some(m => m.type === 'heartbeat'), gotA.map(m=>m.type));

  // 断线后在线状态更新
  wsB.close();
  await sleep(900);
  const online = await api('GET', '/chat/rooms/' + roomId + '/online');
  check('B 断开后在线列表更新', online.data.every(m => m.key !== 'B'), online.data);

  wsA.close();
  console.log('');
  console.log('RESULT: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
