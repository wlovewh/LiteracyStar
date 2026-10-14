'use strict';
require('dotenv').config();

const toInt = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? d : n;
};
const toBool = (v, d) => {
  if (v === undefined || v === '') return d;
  return String(v).toLowerCase() === 'true' || v === '1';
};

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: toInt(process.env.PORT, 3000),

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: toInt(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'info_literacy',
    waitForConnections: true,
    connectionLimit: toInt(process.env.DB_POOL_LIMIT, 10),
    queueLimit: 0,
    charset: 'utf8mb4',
    dateStrings: false,
    timezone: 'local',
    decimalNumbers: true
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: toInt(process.env.REDIS_PORT, 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: toInt(process.env.REDIS_DB, 0),
    disabled: toBool(process.env.REDIS_DISABLED, false),
    // 排行榜 ZSET 键前缀
    keyPrefix: 'stage:'
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'info_literacy_dev_secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '12h'
  },

  cors: {
    origin: (process.env.CORS_ORIGIN || 'http://localhost:5173')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  },

  // 切屏检测阈值 (project.md 7.5)
  cheat: {
    maxSwitchCount: 3,
    maxSwitchSeconds: 30
  },

  // 排行榜推送间隔 (project.md 8.2)
  rankPushIntervalMs: 3000
};
