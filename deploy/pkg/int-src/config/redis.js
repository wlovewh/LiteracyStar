'use strict';
const Redis = require('ioredis');
const config = require('./index');
const logger = require('../utils/logger');

let client = null;
let ready = false;
let lastError = null;

// ---------------- 内存降级实现 ----------------
// Redis 不可用时保证功能不中断，但重启后数据丢失。
const mem = {
  kv: new Map(),                 // 普通键值
  hash: new Map(),               // Map<key, Map<field, value>>
  expiry: new Map()              // Map<key, 过期时间戳>
};

function memAlive(key) {
  const exp = mem.expiry.get(key);
  if (exp && Date.now() > exp) {
    mem.kv.delete(key);
    mem.hash.delete(key);
    mem.expiry.delete(key);
    return false;
  }
  return true;
}

async function init() {
  if (client) return client;
  client = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    db: config.redis.db,
    lazyConnect: false,
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000))
  });

  client.on('ready', () => {
    ready = true;
    lastError = null;
    logger.info('Redis 已连接');
  });
  client.on('error', (err) => {
    if (ready) logger.warn('Redis 连接异常: ' + err.message);
    ready = false;
    lastError = err.message;
  });
  client.on('end', () => {
    ready = false;
  });

  // 首次连接失败时降级
  try {
    await client.ping();
    ready = true;
  } catch (err) {
    ready = false;
    lastError = err.message;
    logger.warn('Redis 不可用（' + err.message + '），使用内存降级实现');
  }
  return client;
}

function status() {
  return { driver: ready ? 'redis' : 'memory', ready, connected: ready, lastError };
}

// ---------------- 通用操作 ----------------
async function set(key, value, ttlSeconds) {
  if (ready) {
    if (ttlSeconds) await client.set(key, value, 'EX', ttlSeconds);
    else await client.set(key, value);
    return true;
  }
  memAlive(key);
  mem.kv.set(key, value);
  if (ttlSeconds) mem.expiry.set(key, Date.now() + ttlSeconds * 1000);
  return true;
}

async function get(key) {
  if (ready) return client.get(key);
  if (!memAlive(key)) return null;
  return mem.kv.has(key) ? mem.kv.get(key) : null;
}

async function del(...keys) {
  if (ready) return client.del(...keys);
  let n = 0;
  for (const k of keys) {
    if (mem.kv.delete(k)) n += 1;
    if (mem.hash.delete(k)) n += 1;
    mem.expiry.delete(k);
  }
  return n;
}

async function exists(key) {
  if (ready) return client.exists(key);
  return memAlive(key) && (mem.kv.has(key) || mem.hash.has(key)) ? 1 : 0;
}

// ---------------- Hash（在线状态等） ----------------
async function hset(key, field, value) {
  if (ready) return client.hset(key, field, value);
  memAlive(key);
  if (!mem.hash.has(key)) mem.hash.set(key, new Map());
  mem.hash.get(key).set(String(field), String(value));
  return 1;
}

async function hget(key, field) {
  if (ready) return client.hget(key, field);
  if (!memAlive(key)) return null;
  const h = mem.hash.get(key);
  return h && h.has(String(field)) ? h.get(String(field)) : null;
}

async function hgetall(key) {
  if (ready) return client.hgetall(key);
  if (!memAlive(key)) return {};
  const h = mem.hash.get(key);
  return h ? Object.fromEntries(h) : {};
}

async function hdel(key, ...fields) {
  if (ready) return client.hdel(key, ...fields);
  const h = mem.hash.get(key);
  if (!h) return 0;
  let n = 0;
  for (const f of fields) if (h.delete(String(f))) n += 1;
  return n;
}

async function hkeys(key) {
  if (ready) return client.hkeys(key);
  if (!memAlive(key)) return [];
  const h = mem.hash.get(key);
  return h ? [...h.keys()] : [];
}

// ---------------- Pub/Sub（聊天室广播） ----------------
const localSubscribers = new Map(); // channel -> Set<handler>

async function publish(channel, message) {
  // 无论是否连上 Redis，都先通知本进程内的订阅者
  const handlers = localSubscribers.get(channel);
  if (handlers) for (const h of handlers) { try { h(message); } catch (_) {} }
  if (ready) {
    try {
      await client.publish(channel, message);
    } catch (_) {
      /* 发布失败不影响本进程投递 */
    }
  }
  return true;
}

async function subscribe(channel, handler) {
  if (!localSubscribers.has(channel)) localSubscribers.set(channel, new Set());
  localSubscribers.get(channel).add(handler);
  return () => {
    const s = localSubscribers.get(channel);
    if (s) s.delete(handler);
  };
}

async function close() {
  if (client) {
    try { await client.quit(); } catch (_) {}
    client = null;
    ready = false;
  }
}

module.exports = {
  init, status, close,
  set, get, del, exists,
  hset, hget, hgetall, hdel, hkeys,
  publish, subscribe
};
