'use strict';
/** 以真实学生账号验证：能看到赛事与已开启环节 */
const BASE = 'http://47.88.49.160/api';
(async () => {
  const login = await fetch(BASE + '/auth/student/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId: '25102011060', password: '25102011060' })
  });
  const lj = await login.json();
  if (lj.code !== 0) { console.log('登录失败:', lj.message); process.exit(1); }
  const token = lj.data.token;
  const me = await (await fetch(BASE + '/auth/me', { headers: { Authorization: 'Bearer ' + token } })).json();
  console.log('身份:', me.data.user.name, '队伍', me.data.user.teamId, me.data.user.teamName || '');

  const av = await (await fetch(BASE + '/events/available', { headers: { Authorization: 'Bearer ' + token } })).json();
  console.log('可见赛事:', JSON.stringify(av.data.map(e => ({ id: e.id, name: e.name.slice(0, 20), active: e.active_stage_count }))));

  for (const e of av.data) {
    const cur = await (await fetch(BASE + '/events/current?eventId=' + e.id, { headers: { Authorization: 'Bearer ' + token } })).json();
    const stages = (cur.data.stages || []).map(s => s.name + '(' + (s.status === 1 ? '开启' : '关闭') + ')');
    console.log('  赛事 ' + e.id + ' 环节:', stages.join(', ') || '(无)');
  }
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
