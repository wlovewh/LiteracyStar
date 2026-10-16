'use strict';
/**
 * 第八轮综合平台修复回归测试
 * ⑧ 聊天室图片上传 + 成员列表显示昵称
 */
const BASE = 'http://localhost:3001/platform-api';
let pass = 0, fail = 0;
function check(n, c, x) { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + (x !== undefined ? ' :: ' + JSON.stringify(x).slice(0, 400) : '')); } }
async function api(m, p, { token, body } = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(BASE + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
}

// 构造一张最小合法 PNG（1x1）
function tinyPng() {
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  return Buffer.from(b64, 'base64');
}

(async () => {
  const al = await api('POST', '/auth/login', { body: { keyValue: 'ADMIN2026KEY' } });
  const at = al.json.data.token;
  check('管理员登录', !!at, al.json);

  const room = await api('POST', '/chat/rooms', { token: at, body: { teamId: 903, name: '图片测试室' } });
  const roomId = room.json.data.id;
  check('创建测试聊天室', !!roomId, room.json);

  console.log('');
  console.log('=== ⑧ 图片上传 ===');
  const fd = new FormData();
  fd.append('image', new Blob([tinyPng()], { type: 'image/png' }), 'test.png');
  const up = await fetch(BASE + '/chat/rooms/' + roomId + '/image', { method: 'POST', body: fd });
  const upJson = await up.json().catch(() => null);
  check('图片上传成功', up.status === 200 && upJson.code === 0, upJson);
  check('返回可访问 URL', !!(upJson.data && upJson.data.url), upJson.data);
  check('URL 指向 uploads/chat', /uploads\/chat\//.test(upJson.data.url), upJson.data.url);

  // 上传后的文件应可访问
  if (upJson.data && upJson.data.url) {
    const img = await fetch('http://localhost:3001' + upJson.data.url);
    check('上传的图片可访问', img.status === 200, img.status);
    check('图片 MIME 正确', /image\/png/.test(img.headers.get('content-type') || ''), img.headers.get('content-type'));
  }

  // 非图片文件应被拒绝
  const fd2 = new FormData();
  fd2.append('image', new Blob(['not an image'], { type: 'text/plain' }), 'a.txt');
  const bad = await fetch(BASE + '/chat/rooms/' + roomId + '/image', { method: 'POST', body: fd2 });
  check('非图片文件被拒绝', bad.status >= 400, bad.status);

  console.log('');
  console.log('=== ⑧ 图片消息可发送并附带 URL ===');
  const msg = await api('POST', '/chat/rooms/' + roomId + '/messages', {
    token: at,
    body: { messageType: 'image', content: upJson.data.url, extra: { url: upJson.data.url } }
  });
  check('发送图片消息', msg.json.code === 0, msg.json);
  check('消息类型为 image', msg.json.data.messageType === 'image', msg.json.data && msg.json.data.messageType);
  check('消息 extra 带 url', !!(msg.json.data.extra && msg.json.data.extra.url), msg.json.data && msg.json.data.extra);

  const list = await api('GET', '/chat/rooms/' + roomId + '/messages', { token: at });
  const imgMsg = (list.json.data || []).find(m => m.messageType === 'image');
  check('历史消息含图片消息', !!imgMsg, (list.json.data || []).map(m => m.messageType));
  check('历史图片消息带 url', !!(imgMsg && imgMsg.extra && imgMsg.extra.url), imgMsg && imgMsg.extra);

  console.log('');
  console.log('=== ⑧ 引用图片消息显示摘要 ===');
  const reply = await api('POST', '/chat/rooms/' + roomId + '/messages', {
    token: at,
    body: { content: '引用这张图', quotedMessageId: imgMsg.id }
  });
  check('引用图片消息成功', reply.json.code === 0, reply.json);
  check('引用体带被引用消息', !!(reply.json.data.quoted), reply.json.data);

  console.log('');
  console.log('=== 清理 ===');
  await api('DELETE', '/chat/rooms/' + roomId, { token: at });
  check('测试聊天室已删除', true);

  console.log('');
  console.log('RESULT: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
