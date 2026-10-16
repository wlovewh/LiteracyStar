'use strict';
(async () => {
  const anon = await (await fetch('http://47.88.49.160/platform-api/questions/search?keyword=' + encodeURIComponent('信息'))).json();
  console.log('未登录检索 code:', anon.code, '| 总数:', anon.data && anon.data.total);
  const first = anon.data && anon.data.list && anon.data.list[0];
  if (first) {
    console.log('未登录能拿到题目内容:', JSON.stringify({
      id: first.id, content: String(first.content).slice(0, 40), answer: first.answer
    }));
  }
  console.log('');
  console.log('结论: 未登录即可检索并看到题干与答案 =', anon.code === 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
