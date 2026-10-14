'use strict';
require('dotenv').config();

const toInt = (v, d) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};

module.exports = {
  port: toInt(process.env.PORT, 3001),
  env: process.env.NODE_ENV || 'development',

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: toInt(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'integrated_platform',
    connectionLimit: toInt(process.env.DB_POOL_LIMIT, 8)
  },

  // 模拟竞赛平台库名（共用 questions 表，双向同步）
  competitionDb: process.env.COMPETITION_DB_NAME || 'info_literacy',

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: toInt(process.env.REDIS_PORT, 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: toInt(process.env.REDIS_DB, 1)
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'integrated_platform_dev_secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '12h'
  },

  corsOrigin: process.env.CORS_ORIGIN || '*',

  // 业务参数（project.md 追加文档）
  chat: {
    defaultMaxMembers: 3,
    defaultRetentionDays: 30,
    inviteCodeTtlHours: 24,
    heartbeatIntervalMs: 30000,
    offlineThresholdMs: 60000,
    recentMessageLimit: 50
  },
  question: {
    duplicateSimilarity: 0.8,
    keywordMinLength: 4,
    keywordMaxCount: 3
  }
};
