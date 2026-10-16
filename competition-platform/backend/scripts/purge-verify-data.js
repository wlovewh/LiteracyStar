'use strict';
/** 清理验证用赛事与残留环节（名称含「验证」「多赛事」「R9」等前缀） */
const db = require('../src/config/db');
(async () => {
  const evs = await db.query(
    "SELECT id, name FROM events WHERE name LIKE '%验证%' OR name LIKE 'R9%' OR name LIKE 'DBG%'"
  );
  for (const e of evs) {
    const stages = await db.query('SELECT id FROM stages WHERE event_id = ?', [e.id]);
    for (const s of stages) {
      await db.execute('DELETE FROM answers WHERE stage_id = ?', [s.id]);
      await db.execute('DELETE FROM stage_scores WHERE stage_id = ?', [s.id]);
      await db.execute('DELETE FROM stage_papers WHERE stage_id = ?', [s.id]);
      await db.execute('DELETE FROM stage_attempts WHERE stage_id = ?', [s.id]);
    }
    await db.execute('DELETE FROM event_teams WHERE event_id = ?', [e.id]);
    await db.execute('DELETE FROM stages WHERE event_id = ?', [e.id]);
    await db.execute('DELETE FROM events WHERE id = ?', [e.id]);
    console.log('已删除赛事 ' + e.id + ' ' + e.name);
  }
  if (!evs.length) console.log('无残留赛事');

  // 清理验证用环节
  const st = await db.query("SELECT id, name, event_id FROM stages WHERE name LIKE '%验证%' OR name LIKE '【多赛事】%' OR name LIKE '【验证】%'");
  for (const s of st) {
    await db.execute('DELETE FROM answers WHERE stage_id = ?', [s.id]);
    await db.execute('DELETE FROM stage_scores WHERE stage_id = ?', [s.id]);
    await db.execute('DELETE FROM stage_papers WHERE stage_id = ?', [s.id]);
    await db.execute('DELETE FROM stage_attempts WHERE stage_id = ?', [s.id]);
    await db.execute('DELETE FROM stages WHERE id = ?', [s.id]);
    console.log('已删除环节 ' + s.id + ' ' + s.name);
  }
  if (!st.length) console.log('无残留环节');

  const left = await db.query('SELECT id, name FROM events');
  console.log('剩余赛事:', JSON.stringify(left));
  const ls = await db.query('SELECT id, name FROM stages ORDER BY id');
  console.log('剩余环节数:', ls.length);
  await db.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
