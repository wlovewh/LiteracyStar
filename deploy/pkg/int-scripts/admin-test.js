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

  // 清理上次残留的测试数据，保证可重复执行
  const stale = await api('GET', '/questions/search?keyword=【测试】&pageSize=50', { token: at });
  if (stale.json.code === 0 && stale.json.data.list.length) {
    await api('POST', '/questions/manage/batch-remove', { token: at, body: { ids: stale.json.data.list.map(q => q.id) } });
  }

  console.log('=== 题库管理 CRUD (8.1) ===');
  const created = await api('POST', '/questions/manage', { token: at, body: {
    type: 1, content: '【测试】信息检索中截词符的作用是什么？',
    options: [{ letter: 'A', text: '扩大检索范围' }, { letter: 'B', text: '精确匹配' }, { letter: 'C', text: '排除词' }, { letter: 'D', text: '限定字段' }],
    answer: 'A', analysis: '截词符用于匹配词根相同的一族词。', module: '信息检索技术', difficulty: 2, source: '测试', tags: '检索'
  }});
  check('新增题目', created.json.code === 0 && created.json.data.id, created.json);
  const qid = created.json.data.id;
  check('返回选项结构', created.json.data.options.length === 4, created.json.data.options);

  const dup = await api('POST', '/questions/manage', { token: at, body: { type: 1, content: '【测试】信息检索中截词符的作用是什么？', answer: 'A' } });
  check('重复题干被拒绝', dup.json.code !== 0 && /相同题干/.test(dup.json.message), dup.json);

  const updated = await api('PUT', '/questions/manage/' + qid, { token: at, body: { difficulty: 4, answer: 'B' } });
  check('更新题目', updated.json.code === 0 && updated.json.data.difficulty === 4 && updated.json.data.answer === 'B', updated.json.data);

  // 题库检索自第十一轮起需要登录（或持有效邀请码的聊天室访客）
  const detail = await api('GET', '/questions/' + qid, { token: at });
  check('详情回显', detail.json.data && detail.json.data.answer === 'B', detail.json.data);

  console.log('=== 批量导入 ===');
  const tpl = await api('GET', '/questions/manage/template', { token: at });
  check('导入模板可用', tpl.json.code === 0 && tpl.json.data.headers.length === 14, tpl.json.data && tpl.json.data.headers);

  const rows = [
    { type: 1, content: '【批量1】布尔逻辑算符 AND 的作用是？', options: [{letter:'A',text:'缩小范围'},{letter:'B',text:'扩大范围'}], answer: 'A', module: '信息检索技术', difficulty: 2, source: '批量测试' },
    { type: 3, content: '【批量2】所有网络信息都是可靠的。', answer: 'B', module: '信息伦理', difficulty: 1, source: '批量测试' },
    { type: 1, content: '', answer: 'A' },
    { type: 1, content: '【批量3】CNKI 是什么类型的数据库？', options: [{letter:'A',text:'全文数据库'}], answer: 'A', module: '学术资源', difficulty: 2, source: '批量测试' }
  ];
  const imp = await api('POST', '/questions/manage/import', { token: at, body: { rows } });
  check('批量导入返回统计', imp.json.code === 0 && imp.json.data.total === 4, imp.json.data);
  check('成功导入 3 条', imp.json.data.inserted === 3, imp.json.data);
  check('失败 1 条（题干为空）', imp.json.data.failed === 1, imp.json.data);
  check('错误明细含行号', imp.json.data.errors.length === 1 && imp.json.data.errors[0].line === 4, imp.json.data.errors);

  const imp2 = await api('POST', '/questions/manage/import', { token: at, body: { rows } });
  check('重复导入被跳过', imp2.json.data.skipped === 3, imp2.json.data);

  console.log('=== 删除 ===');
  const batch = await api('POST', '/questions/manage/batch-remove', { token: at, body: { ids: [qid] } });
  check('批量删除', batch.json.code === 0 && batch.json.data.deleted === 1, batch.json.data);

  // cleanup imported
  const found = await api('GET', '/questions/search?keyword=批量&pageSize=50', { token: at });
  const ids = found.json.data.list.map(q => q.id);
  if (ids.length) await api('POST', '/questions/manage/batch-remove', { token: at, body: { ids } });
  check('清理测试数据', true);

  console.log('=== 图标上传 ===');
  // minimal 1x1 PNG
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const fd = new FormData();
  fd.append('icon', new Blob([png], { type: 'image/png' }), 'test.png');
  const up = await fetch(BASE + '/resources/icons', { method: 'POST', headers: { Authorization: 'Bearer ' + at }, body: fd });
  const upJson = await up.json();
  check('图标上传成功', upJson.code === 0 && upJson.data.iconUrl, upJson);
  if (upJson.data) {
    const fetched = await fetch('http://localhost:3001' + upJson.data.iconUrl);
    check('图标可访问', fetched.status === 200, fetched.status);
    await api('DELETE', '/resources/icons/' + upJson.data.filename, { token: at });
  }

  console.log('');
  console.log('RESULT: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
