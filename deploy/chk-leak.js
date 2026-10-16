'use strict';
(async () => {
  const s = await (await fetch('http://47.88.49.160/platform-api/questions/settings')).json();
  console.log('当前「开放题库检索」开关:', s.data.searchEnabled);
  const anon = await (await fetch('http://47.88.49.160/platform-api/questions/search?keyword=' + encodeURIComponent('信息'))).json();
  console.log('未登录检索:', anon.code, '| 可检索总数:', anon.data && anon.data.total);
  const q = anon.data && anon.data.list && anon.data.list[0];
  if (q) console.log('未登录可读到:', JSON.stringify({ content: String(q.content).slice(0,36), answer: q.answer, analysis: q.analysis ? String(q.analysis).slice(0,30) : null }));
  const d = await (await fetch('http://47.88.49.160/platform-api/questions/2077')).json();
  console.log('未登录按 id 取详情:', d.code, d.data ? '可读' : d.message);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
