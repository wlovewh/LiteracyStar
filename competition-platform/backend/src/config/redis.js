'use strict';
const config = require('./index');

/**
 * Redis 客户端封装。
 *
 * project.md 8.2 要求使用 Redis ZSET 存储排行榜。当本机未安装 Redis 时，
 * 该模块自动降级为内存实现（同一套 ZSET 语义），保证本地开发可立即运行；
 * 一旦 Redis 可用，无需改代码即自动启用真实 ZSET。
 */

let client = null;
let driver = 'memory';
let ready = false;
let lastError = null;

// ---------------- 内存降级实现（模拟 ZSET） ----------------
const memory = new Map(); // key -> Map(member -> score)

function memMap(key) {
  if (!memory.has(key)) memory.set(key, new Map());
  return memory.get(key);
}

function globToRegExp(pattern) {
  let out = '^';
  for (const ch of String(pattern)) {
    if (ch === '*') out += '.*';
    else out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(out + '$');
}

const memoryDriver = {
  zadd: async (key, score, member) => {
    const m = memMap(key);
    const existed = m.has(member) ? 0 : 1;
    m.set(member, Number(score));
    return existed;
  },
  zrem: async (key, member) => (memMap(key).delete(member) ? 1 : 0),
  zscore: async (key, member) => {
    const m = memMap(key);
    return m.has(member) ? m.get(member) : null;
  },
  zcard: async (key) => memMap(key).size,
  /** 按 score 升序返回；withScores 时返回 {member, score} */
  zrange: async (key, start, stop, withScores = false) => {
    const m = memMap(key);
    const sorted = [...m.entries()]
      .map(([member, score]) => ({ member, score }))
      .sort((a, b) => a.score - b.score || String(a.member).localeCompare(String(b.member)));
    const end = stop < 0 ? sorted.length + stop + 1 : stop + 1;
    const slice = sorted.slice(start, end);
    return withScores ? slice : slice.map((x) => x.member);
  },
  del: async (key) => (memory.delete(key) ? 1 : 0),
  keys: async (pattern) => {
    const re = globToRegExp(pattern);
    return [...memory.keys()].filter((k) => re.test(k));
  },
  flush: async () => { memory.clear(); }
};

// ---------------- 真实 Redis 实现 ----------------
function wrapIoredis(c) {
  return {
    zadd: (key, score, member) => c.zadd(key, String(score), String(member)),
    zrem: (key, member) => c.zrem(key, String(member)),
    zscore: (key, member) => c.zscore(key, String(member)).then((v) => (v === null || v === undefined ? null : Number(v))),
    zcard: (key) => c.zcard(key),
    zrange: async (key, start, stop, withScores = false) => {
      if (!withScores) return c.zrange(key, start, stop);
      const flat = await c.zrange(key, start, stop, 'WITHSCORES');
      const out = [];
      for (let i = 0; i < flat.length; i += 2) out.push({ member: flat[i], score: Number(flat[i + 1]) });
      return out;
    },
    del: (key) => c.del(key),
    keys: (pattern) => c.keys(pattern),
    flush: () => c.flushdb()
  };
}

/** 初始化。Redis 不可用时静默降级，不阻塞后端启动。 */
async function init() {
  if (config.redis.disabled) {
    driver = 'memory';
    ready = true;
    lastError = 'REDIS_DISABLED=true';
    client = memoryDriver;
    return { driver, ready };
  }
  let Redis;
  try {
    Redis = require('ioredis');
  } catch (_) {
    driver = 'memory'; ready = true; lastError = 'ioredis 未安装'; client = memoryDriver;
    return { driver, ready };
  }
  try {
    const c = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null // 首次失败即放弃，避免无限重连刷屏
    });
    c.on('error', (err) => { lastError = err.message; });
    await c.connect();
    await c.ping();
    client = wrapIoredis(c);
    driver = 'redis';
    ready = true;
  } catch (err) {
    lastError = err.message;
    client = memoryDriver;
    driver = 'memory';
    ready = true;
  }
  return { driver, ready };
}

function store() { return client || memoryDriver; }
function status() { return { driver, ready, lastError, connected: driver === 'redis' }; }

/** 排行榜键名: stage:{stageId}:rank (project.md 8.2) */
function rankKey(stageId, scopeKey) {
  const suffix = scopeKey && scopeKey !== 'common' ? ':' + scopeKey : '';
  return config.redis.keyPrefix + stageId + ':rank' + suffix;
}

module.exports = {
  init,
  status,
  rankKey,
  zadd: (...a) => store().zadd(...a),
  zrem: (...a) => store().zrem(...a),
  zscore: (...a) => store().zscore(...a),
  zcard: (...a) => store().zcard(...a),
  zrange: (...a) => store().zrange(...a),
  del: (...a) => store().del(...a),
  keys: (...a) => store().keys(...a),
  _memory: memoryDriver
};
