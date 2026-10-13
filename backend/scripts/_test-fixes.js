'use strict';
const BASE = 'http://localhost:3000';
let pass = 0, fail = 0;
function check(n, c, x) { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? ' :: ' + JSON.stringify(x).slice(0,300) : '')); } }

(async () => {
  const login = await (await fetch(BASE + '/api/auth/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  })).json();
  const token = login.data.token;
  const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };

  console.log('=== ① 模板下载接口 (带 token 应成功) ===');
  for (const [name, url] of [['题目模板', '/api/questions/import/template'], ['队伍模板', '/api/teams/import/template']]) {
    const r = await fetch(BASE + url, { headers: H });
    check(name + ' 200', r.status === 200, r.status);
    check(name + ' xlsx Content-Type', (r.headers.get('content-type') || '').includes('spreadsheetml'), r.headers.get('content-type'));
    check(name + ' 有 Content-Disposition', !!r.headers.get('content-disposition'), r.headers.get('content-disposition'));
    const buf = Buffer.from(await r.arrayBuffer());
    check(name + ' 非空且为 zip 结构', buf.length > 1000 && buf[0] === 0x50 && buf[1] === 0x4b, { len: buf.length, sig: buf.slice(0,2).toString('hex') });
  }

  console.log('=== ①b 登录失败返回正确原因 (不是"登录已过期") ===');
  const badStu = await (await fetch(BASE + '/api/auth/student/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId: '9999999', password: '9999999' })
  })).json();
  check('学号不存在提示准确', badStu.message === '学号不存在，请联系管理员', badStu);

  const badPwd = await (await fetch(BASE + '/api/auth/student/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId: '2026001', password: 'wrong' })
  })).json();
  check('密码错误提示准确', badPwd.message === '账号或密码错误', badPwd);

  const badAdmin = await (await fetch(BASE + '/api/auth/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'nope' })
  })).json();
  check('管理员密码错误提示准确', badAdmin.message === '账号或密码错误', badAdmin);

  console.log('=== ⑤ 队伍成绩对比 (个人/团队赛制) ===');
  const stages = await (await fetch(BASE + '/api/events/current', { headers: H })).json();
  for (const st of stages.data.stages) {
    const s = await (await fetch(BASE + '/api/admin/stats?stageId=' + st.id, { headers: H })).json();
    const tc = s.data.teamComparison || [];
    console.log('    环节 ' + st.id + ' (' + s.data.stageId + ') ' + st.name + ' [' + (st.mode||'?') + '] -> ' + tc.length + ' 条');
  }
  const s1 = await (await fetch(BASE + '/api/admin/stats?stageId=1', { headers: H })).json();
  check('个人赛制(环节1)有对比数据', (s1.data.teamComparison || []).length > 0, s1.data.teamComparison);

  console.log('=== ⑦ 清空队伍答题数据 ===');
  const teams = await (await fetch(BASE + '/api/teams', { headers: H })).json();
  const t = teams.data.list ? teams.data.list[0] : teams.data[0];
  check('获取到队伍', !!t, teams.data);
  const clr = await (await fetch(BASE + '/api/teams/' + t.id + '/clear-answers', { method: 'POST', headers: H, body: JSON.stringify({}) })).json();
  check('清空接口成功', clr.code === 0, clr);
  check('返回清空统计', clr.data && typeof clr.data.answers === 'number', clr.data);

  console.log('');
  console.log('RESULT: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
