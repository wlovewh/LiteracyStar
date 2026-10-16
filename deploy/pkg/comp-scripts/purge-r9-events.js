'use strict';
/** 清理第九轮测试残留的赛事（名称以 R9 开头） */
const db = require('../src/config/db');
(async () => {
  const evs = await db.query("SELECT id, name FROM events WHERE name LIKE 'R9%' OR name LIKE 'DBG%'");
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
  const left = await db.query('SELECT id, name FROM events');
  console.log('剩余赛事:', JSON.stringify(left));
  await db.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
