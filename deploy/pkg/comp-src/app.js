'use strict';
const express = require('express');
const cors = require('cors');
const config = require('./config');
const logger = require('./utils/logger');
const db = require('./config/db');
const redis = require('./config/redis');
const { notFound, errorHandler } = require('./middlewares/error');

const authRoutes = require('./routes/authRoutes');
const eventRoutes = require('./routes/eventRoutes');
const stageRoutes = require('./routes/stageRoutes');
const questionRoutes = require('./routes/questionRoutes');
const teamRoutes = require('./routes/teamRoutes');
const examRoutes = require('./routes/examRoutes');
const rankRoutes = require('./routes/rankRoutes');
const cheatRoutes = require('./routes/cheatRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();

app.disable('x-powered-by');
app.use(cors({
  origin: config.cors.origin.includes('*') ? true : config.cors.origin,
  credentials: true
}));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// 简易访问日志（跳过 SSE 与健康检查，避免刷屏）
app.use((req, res, next) => {
  if (req.path === '/api/health' || req.path.startsWith('/api/rank/stream')) return next();
  const start = Date.now();
  res.on('finish', () => {
    logger.debug(req.method, req.originalUrl, res.statusCode, (Date.now() - start) + 'ms');
  });
  next();
});

// 健康检查
app.get('/api/health', async (req, res) => {
  let dbOk = false;
  let dbError = null;
  try {
    dbOk = await db.ping();
  } catch (err) {
    dbError = err.message;
  }
  res.json({
    code: 0,
    message: 'ok',
    data: {
      service: 'info-literacy-api',
      env: config.env,
      time: new Date().toISOString(),
      database: { connected: dbOk, error: dbError },
      redis: redis.status()
    }
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/stages', stageRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/stages', examRoutes);
app.use('/api/rank', rankRoutes);
app.use('/api/cheat', cheatRoutes);
app.use('/api/admin', adminRoutes);

app.use(notFound);
app.use(errorHandler);

/** 启动服务 */
async function start() {
  // Redis 不可用时自动降级为内存排行榜，不阻塞启动
  const r = await redis.init();
  if (r.driver === 'redis') {
    logger.info('Redis 已连接，排行榜使用 ZSET');
  } else {
    logger.warn('Redis 不可用（' + redis.status().lastError + '），排行榜降级为内存实现');
  }

  try {
    await db.ping();
    logger.info('MySQL 连接成功:', config.db.host + ':' + config.db.port + '/' + config.db.database);
  } catch (err) {
    logger.error('MySQL 连接失败:', err.message);
    logger.error('请确认数据库已启动，并执行 database/init.sql 与 database/seed.sql');
  }

  return app.listen(config.port, () => {
    logger.info('后端服务已启动: http://localhost:' + config.port);
    logger.info('健康检查: http://localhost:' + config.port + '/api/health');
  });
}

// 直接运行时启动；被测试引用时只导出 app
if (require.main === module) {
  start().catch((err) => {
    logger.error('启动失败:', err);
    process.exit(1);
  });
}

module.exports = { app, start };
