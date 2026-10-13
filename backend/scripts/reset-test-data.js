'use strict';
const db = require('../src/config/db');
(async () => {
  await db.execute('DELETE FROM answers WHERE stage_id = 1');
  await db.execute('DELETE FROM stage_scores WHERE stage_id = 1');
  await db.execute('DELETE FROM stage_papers WHERE stage_id = 1');
  await db.execute('UPDATE stages SET status = 0 WHERE id = 1');
  await db.execute('UPDATE stages SET config = JSON_SET(config, ' + "'$.allowViewAnswer'" + ', false) WHERE id = 1');
  const redis = require('../src/config/redis');
  await redis.init();
  await redis.del('stage:1:rank');
  await redis.del('stage:1:rank:2026001');
  await db.execute('DELETE FROM cheat_logs');
  console.log('reset done');
  await db.close();
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
