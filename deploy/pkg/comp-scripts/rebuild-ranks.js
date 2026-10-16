'use strict';
/**
 * 从 stage_scores 重建 Redis 排行榜 ZSET。
 * 注意：必须先 await redis.init()，否则 redis 模块会静默降级为内存实现，
 * 看起来"重建成功"但真实 Redis 里什么都没有。
 */
const db = require('../src/config/db');
const redis = require('../src/config/redis');
const rankService = require('../src/services/rankService');

(async () => {
  const st = await redis.init();
  console.log('Redis 驱动:', st.driver, '| ready:', st.ready, st.lastError ? '| ' + st.lastError : '');
  if (st.driver !== 'redis') {
    console.error('Redis 不可用，重建无意义，已中止');
    process.exit(1);
  }

  const stages = await db.query('SELECT id, name FROM stages ORDER BY id');
  let total = 0;
  for (const s of stages) {
    const n = await rankService.rebuild(s.id);
    total += n;
    console.log('环节 ' + s.id + ' (' + s.name + ') 重建队伍数=' + n);
  }

  // 校验：统计实际写入的键
  const keys = await redis.keys('stage:*');
  console.log('');
  console.log('共重建 ' + total + ' 个队伍条目，Redis 中 stage:* 键数 = ' + keys.length);
  for (const k of keys.slice(0, 20)) {
    console.log('  ' + k + ' -> ' + (await redis.zcard(k)) + ' 个成员');
  }
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
