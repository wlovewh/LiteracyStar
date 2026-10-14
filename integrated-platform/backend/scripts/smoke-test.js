'use strict';
const BASE = 'http://localhost:3001/platform-api';
let pass = 0, fail = 0;
function check(n, c, x) { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? ' :: ' + JSON.stringify(x).slice(0,300) : '')); } }
async function api(m, p, { token, body } = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(BASE + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
}
(async () => {
  console.log('=== 健康检查 ===');
  const h = await api('GET', '/health');
  check('health ok', h.json.code === 0, h.json);
  check('MySQL 已连接', h.json.data.database.connected === true);

  console.log('=== 密钥登录 (4.3) ===');
  const bad = await api('POST', '/auth/login', { body: { keyValue: 'WRONGKEY' } });
  check('无效密钥被拒绝', bad.json.code !== 0 && /无效/.test(bad.json.message), bad.json);
  const admin = await api('POST', '/auth/login', { body: { keyValue: 'ADMIN2026KEY' } });
  check('管理员密钥登录成功', admin.json.code === 0 && admin.json.data.user.role === 'admin', admin.json);
  const user = await api('POST', '/auth/login', { body: { keyValue: 'USER2026KEY' } });
  check('用户密钥登录成功', user.json.code === 0 && user.json.data.user.role === 'user', user.json);
  const at = admin.json.data.token;
  const ut = user.json.data.token;

  console.log('=== 权限隔离 ===');
  const forbidden = await api('GET', '/auth/keys', { token: ut });
  check('用户密钥不能访问密钥管理', forbidden.status === 403, forbidden.json);
  const keysList = await api('GET', '/auth/keys', { token: at });
  check('管理员可列出密钥', keysList.json.code === 0 && keysList.json.data.total >= 3, keysList.json.data);

  console.log('=== 资源收录 (5) ===');
  const cats = await api('GET', '/resources/categories?withSites=1');
  check('九大分类', cats.json.data.length === 9, cats.json.data.length);
  check('分类含网站', cats.json.data[0].sites.length > 0, cats.json.data[0]);
  check('网站总数 32', cats.json.data.reduce((s,c)=>s+c.sites.length,0) === 32);
  const sites = await api('GET', '/resources/sites?keyword=知网');
  check('关键词搜索网站', sites.json.data.total >= 1, sites.json.data.total);

  console.log('=== 题库检索 (6) — 跨库共用 questions 表 ===');
  const qs = await api('GET', '/questions/search?pageSize=5', { token: ut });
  check('检索到题目（来自模拟平台库）', qs.json.code === 0 && qs.json.data.total > 0, qs.json.data);
  check('题目含选项', qs.json.data.list[0].options.length > 0, qs.json.data.list[0]);
  check('题目含答案', !!qs.json.data.list[0].answer);
  const facets = await api('GET', '/questions/facets');
  check('筛选项可用', facets.json.code === 0 && facets.json.data.modules.length > 0, facets.json.data);

  console.log('=== 关键词提取 (7.5) ===');
  const kw = await api('POST', '/questions/extract-keywords', { body: { content: '请检索关于人工智能技术发展现状的学术文献资料' } });
  check('提取关键词非空', kw.json.data.keywords.length > 0, kw.json.data);
  check('关键词长度 > 4', kw.json.data.keywords.every(k => k.length > 4), kw.json.data);
  check('关键词不超过 3 个', kw.json.data.keywords.length <= 3, kw.json.data);

  console.log('=== 聊天室 (7) ===');
  const room = await api('POST', '/chat/rooms', { body: { teamId: 1, name: '星海队聊天室' } });
  check('创建/获取聊天室', room.json.code === 0 && room.json.data.invite_code, room.json);
  const roomId = room.json.data.id;
  const byInvite = await api('GET', '/chat/rooms/by-invite?code=' + room.json.data.invite_code);
  check('邀请码可查到聊天室', byInvite.json.data.id === roomId, byInvite.json);
  const badInvite = await api('GET', '/chat/rooms/by-invite?code=000000');
  check('无效邀请码被拒绝', badInvite.json.code !== 0, badInvite.json);

  const sent = await api('POST', '/chat/rooms/' + roomId + '/messages', { body: { senderName: '张伟', senderRole: 'leader', content: '大家好' } });
  check('发送消息', sent.json.code === 0 && sent.json.data.id, sent.json);
  const msgs = await api('GET', '/chat/rooms/' + roomId + '/messages');
  check('拉取消息', msgs.json.data.length >= 1, msgs.json.data.length);

  console.log('=== 答案冲突提示 (7.4) ===');
  await api('POST', '/chat/rooms/' + roomId + '/answer', { body: { questionId: 1, answer: 'A', senderName: '张伟', senderRole: 'leader' } });
  const conflict = await api('POST', '/chat/rooms/' + roomId + '/answer', { body: { questionId: 1, answer: 'B', senderName: '李四', senderRole: 'member1' } });
  check('检测到答案冲突', conflict.json.data.conflict === true, conflict.json.data);
  check('冲突系统消息内容正确', conflict.json.data.conflictMessage && /答案冲突/.test(conflict.json.data.conflictMessage.content), conflict.json.data.conflictMessage);

  console.log('=== 快速短语 (7.6) ===');
  const phrases = await api('GET', '/chat/phrases');
  check('10 条预置短语', phrases.json.data.length === 10, phrases.json.data.length);
  const np = await api('POST', '/chat/phrases', { token: at, body: { content: '测试短语', sortOrder: 99 } });
  check('管理员可新增短语', np.json.code === 0, np.json);
  const del = await api('DELETE', '/chat/phrases/' + np.json.data.id, { token: at });
  check('管理员可删除短语', del.json.code === 0, del.json);

  console.log('=== 数据统计 (8.1) ===');
  const dash = await api('GET', '/admin/dashboard', { token: at });
  check('仪表盘数据', dash.json.code === 0 && dash.json.data.siteCount === 32, dash.json.data);
  check('含题库总数（跨库）', dash.json.data.questionCount > 0, dash.json.data);
  const stats = await api('GET', '/admin/stats', { token: at });
  check('统计数据完整', stats.json.code === 0 && stats.json.data.categories.length === 9, stats.json.data && stats.json.data.categories.length);

  console.log('');
  console.log('RESULT: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
