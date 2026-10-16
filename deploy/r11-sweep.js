'use strict';
/** ⑧ 线上全功能巡检：覆盖两个平台的主要功能面 */
const C = 'http://47.88.49.160/api';
const I = 'http://47.88.49.160/platform-api';
let pass = 0, fail = 0;
const fails = [];
const check = (n, c, x) => { if (c) { pass++; } else { fail++; fails.push(n + (x !== undefined ? ' :: ' + JSON.stringify(x).slice(0,200) : '')); } };
const sec = (n) => console.log('\n=== ' + n + ' ===');
const api = async (base, m, p, { token, body } = {}) => {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(base + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
};

(async () => {
  sec('站点可访问性');
  for (const [p, label] of [['/', '竞赛首页'], ['/login', '学生登录'], ['/admin/login', '管理员登录'], ['/platform/', '综合平台']]) {
    const r = await fetch('http://47.88.49.160' + p);
    check(label + ' 可访问', r.status === 200, r.status);
  }

  sec('竞赛平台 · 认证');
  const ca = await api(C, 'POST', '/auth/admin/login', { body: { username: 'admin', password: 'admin123' } });
  const at = ca.json.data.token;
  check('管理员登录', ca.json.code === 0 && !!at, ca.json.message);
  const st1 = await api(C, 'POST', '/auth/student/login', { body: { studentId: '25102011060', password: '25102011060' } });
  const stu = st1.json.data.token;
  check('学生登录（队长）', st1.json.code === 0 && !!stu, st1.json.message);
  check('登录返回完整身份', !!(st1.json.data.user.teamName && st1.json.data.user.teamId), st1.json.data.user);
  const badPw = await api(C, 'POST', '/auth/student/login', { body: { studentId: '25102011060', password: 'wrong' } });
  check('错误密码被拒绝', badPw.json.code !== 0, badPw.json.message);

  sec('竞赛平台 · 赛事与环节');
  const evs = await api(C, 'GET', '/events', { token: at });
  check('赛事列表', evs.json.code === 0 && evs.json.data.length >= 1, evs.json.data && evs.json.data.length);
  const av = await api(C, 'GET', '/events/available', { token: stu });
  check('学生可见赛事（授权后）', (av.json.data || []).length >= 1, av.json.data && av.json.data.length);
  const eid = av.json.data[0].id;
  const cur = await api(C, 'GET', '/events/current?eventId=' + eid, { token: stu });
  check('首页环节列表', cur.json.code === 0 && !!cur.json.data.event, cur.json.message);
  check('环节带开启状态', (cur.json.data.stages || []).every(s => s.status !== undefined));
  const vis = await api(C, 'GET', '/events/' + eid + '/teams', { token: at });
  check('可见范围可读', vis.json.code === 0 && Array.isArray(vis.json.data), vis.json.message);
  const ov = await api(C, 'GET', '/events/visibility/overview', { token: at });
  check('可见范围总览', ov.json.code === 0, ov.json.message);

  sec('竞赛平台 · 答题链路');
  const stage = (cur.json.data.stages || []).find(s => s.status === 1);
  check('存在已开启环节', !!stage, stage && stage.name);
  if (stage) {
    const start = await api(C, 'POST', '/stages/' + stage.id + '/start', { token: stu });
    check('开考成功', start.json.code === 0, start.json.message);
    check('下发题目', (start.json.data.questions || []).length > 0, (start.json.data.questions || []).length);
    check('题目带选项', (start.json.data.questions || []).some(q => (q.options || []).length > 0));
    check('返回服务端时间锚点', !!start.json.data.serverTime && !!start.json.data.startedAt);
    const q = (start.json.data.questions || [])[0];
    if (q) {
      const ans = await api(C, 'POST', '/stages/' + stage.id + '/answer', {
        token: stu, body: { questionId: q.questionId, answer: (q.options[0] || {}).letter || 'A', timeSpent: 3 }
      });
      check('提交单题答案（或已提交）', ans.json.code === 0 || /不允许修改/.test(ans.json.message || ''), ans.json.message);
    }
    const rank = await api(C, 'GET', '/stages/' + stage.id + '/rank', { token: stu });
    check('排行榜可读', rank.json.code === 0, rank.json.message);
  }

  sec('竞赛平台 · 题库与队伍');
  const qs = await api(C, 'GET', '/questions?page=1&pageSize=5', { token: at });
  check('题库列表', qs.json.code === 0, qs.json.message);
  const teams = await api(C, 'GET', '/teams', { token: at });
  check('队伍列表', teams.json.code === 0, teams.json.message);
  const stats = await api(C, 'GET', '/admin/stats', { token: at });
  check('数据统计', stats.json.code === 0, stats.json.message);
  const cheat = await api(C, 'GET', '/admin/cheat-logs', { token: at });
  check('预警日志', cheat.json.code === 0, cheat.json.message);

  sec('综合平台 · 认证与权限');
  const ia = await api(I, 'POST', '/auth/login', { body: { keyValue: 'ADMIN2026KEY' } });
  const iat = ia.json.data.token;
  check('管理员密钥登录', ia.json.code === 0, ia.json.message);
  const iu = await api(I, 'POST', '/auth/login', { body: { keyValue: 'USER2026KEY' } });
  const iut = iu.json.data.token;
  check('用户密钥登录', iu.json.code === 0, iu.json.message);
  const noPerm = await api(I, 'GET', '/auth/keys', { token: iut });
  check('用户密钥不能访问密钥管理', noPerm.json.code !== 0, noPerm.json.message);
  const keys = await api(I, 'GET', '/auth/keys', { token: iat });
  check('管理员可列密钥', keys.json.code === 0, keys.json.message);

  sec('综合平台 · 资源与题库');
  const cats = await api(I, 'GET', '/resources/categories');
  check('资源九大分类', cats.json.code === 0 && (cats.json.data || []).length >= 9, (cats.json.data || []).length);
  const sites = await api(I, 'GET', '/resources/sites');
  check('资源网站列表', sites.json.code === 0, sites.json.message);
  const qset = await api(I, 'GET', '/questions/settings');
  check('题库检索开关可读', qset.json.code === 0, qset.json.message);
  const searchOn = !(qset.json.data && qset.json.data.searchEnabled === false);
  // 题库检索需登录（第十一轮起）：用管理员令牌访问
  const iq = await api(I, 'GET', '/questions/search?keyword=信息', { token: iat });
  check('跨库题库检索', iq.json.code === 0 && iq.json.data.total > 0, iq.json.message);
  // 未登录必须被拒绝
  const anonQ = await api(I, 'GET', '/questions/search?keyword=信息');
  check('未登录检索题库被拒绝', anonQ.status === 401, anonQ.status);
  const kw = await api(I, 'POST', '/questions/extract-keywords', { body: { content: '请检索关于人工智能技术发展现状的学术文献资料' } });
  check('关键词提取', kw.json.code === 0 && (kw.json.data.keywords || []).length > 0, kw.json.message);

  sec('综合平台 · 聊天室');
  const room = await api(I, 'POST', '/chat/rooms', { token: iat, body: { teamId: 97, name: 'R11 巡检室' } });
  const rid = room.json.data.id;
  check('创建聊天室', room.json.code === 0, room.json.message);
  await api(I, 'DELETE', '/chat/rooms/' + rid + '/messages', { token: iat });
  const msg = await api(I, 'POST', '/chat/rooms/' + rid + '/messages', { token: iat, body: { senderName: '巡检', senderRole: 'leader', content: '巡检消息ABC' } });
  check('发送消息', msg.json.code === 0 && msg.json.data.id, msg.json.message);
  const list = await api(I, 'GET', '/chat/rooms/' + rid + '/messages', { token: iat });
  check('拉取消息', (list.json.data || []).length >= 1, (list.json.data || []).length);
  const search = await api(I, 'GET', '/chat/rooms/' + rid + '/search?keyword=巡检消息', { token: iat });
  check('搜索消息', (search.json.data || []).length >= 1, (search.json.data || []).length);
  const online = await api(I, 'GET', '/chat/rooms/' + rid + '/online');
  check('在线列表', online.json.code === 0, online.json.message);
  const phrases = await api(I, 'GET', '/chat/phrases', { token: iat });
  check('快速短语', phrases.json.code === 0, phrases.json.message);
  const invite = await api(I, 'POST', '/chat/rooms/' + rid + '/invite', { token: iat });
  check('刷新邀请码', invite.json.code === 0 && !!invite.json.data.inviteCode, invite.json.message);
  const byInv = await api(I, 'GET', '/chat/rooms/by-invite?code=' + invite.json.data.inviteCode);
  check('邀请码可查聊天室', byInv.json.code === 0 && byInv.json.data.id === rid, byInv.json.message);

  sec('综合平台 · 备份与统计');
  const bk = await api(I, 'GET', '/admin/backup', { token: iat });
  check('备份总览', bk.json.code === 0 && !!bk.json.data.config && Array.isArray(bk.json.data.list), bk.json.message);
  const cfg = await api(I, 'PUT', '/admin/backup/config', { token: iat, body: { enabled: false, hour: 3, minute: 0, keep: 7 } });
  check('备份配置可写', cfg.json.code === 0, cfg.json.message);
  const run = await api(I, 'POST', '/admin/backup/run', { token: iat });
  check('手动备份成功', run.json.code === 0 && run.json.data.fileSize > 0, run.json.message);
  if (run.json.data && run.json.data.id) {
    const del = await api(I, 'DELETE', '/admin/backup/' + run.json.data.id, { token: iat });
    check('删除备份', del.json.code === 0, del.json.message);
  }
  const dash = await api(I, 'GET', '/admin/stats', { token: iat });
  check('仪表盘统计', dash.json.code === 0, dash.json.message);

  console.log('\n\n========== 巡检结果 ==========');
  console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  if (fails.length) { console.log('失败明细：'); fails.forEach(f => console.log('  - ' + f)); }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
