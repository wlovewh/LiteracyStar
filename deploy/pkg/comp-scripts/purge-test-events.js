'use strict';
const db = require('../src/config/db');
(async () => {
  const testEventIds = (await db.query('SELECT id FROM events WHERE id <> 1')).map(r => r.id);
  console.log('测试赛事:', testEventIds.join(', '));
  if (!testEventIds.length) { console.log('无需清理'); process.exit(0); }

  const stages = await db.query(
    'SELECT id FROM stages WHERE event_id IN (' + testEventIds.map(() => '?').join(',') + ')',
    testEventIds
  );
  const sids = stages.map(s => s.id);
  console.log('关联环节:', sids.join(', ') || '(无)');

  if (sids.length) {
    const ph = sids.map(() => '?').join(',');
    const a = await db.execute('DELETE FROM answers WHERE stage_id IN (' + ph + ')', sids);
    const sc = await db.execute('DELETE FROM stage_scores WHERE stage_id IN (' + ph + ')', sids);
    const sp = await db.execute('DELETE FROM stage_papers WHERE stage_id IN (' + ph + ')', sids);
    const at = await db.execute('DELETE FROM stage_attempts WHERE stage_id IN (' + ph + ')', sids);
    console.log('删除 answers=' + a.affectedRows + ' stage_scores=' + sc.affectedRows +
      ' stage_papers=' + sp.affectedRows + ' stage_attempts=' + at.affectedRows);
  }

  const d = await db.execute('DELETE FROM events WHERE id <> 1');
  console.log('删除赛事数=' + d.affectedRows);

  const left = await db.query('SELECT id, name FROM events ORDER BY id');
  console.log('剩余赛事:', left.map(e => e.id + ':' + e.name).join(' | '));
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
