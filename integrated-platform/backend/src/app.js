'use strict';
const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');

const config = require('./config');
const db = require('./config/db');
const redis = require('./config/redis');
const logger = require('./utils/logger');
const { notFound, errorHandler } = require('./middlewares/error');
const { ok } = require('./utils/response');

const app = express();

// ---------------- 基础中间件 ----------------
app.use(cors({
  origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((s) => s.trim()),
  credentials: true
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// 访问日志
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    if (req.originalUrl !== '/platform-api/health') {
      logger.info(req.method + ' ' + req.originalUrl + ' ' + res.statusCode + ' ' + ms + 'ms');
    }
  });
  next();
});

// ---------------- 静态资源（上传的图标） ----------------
app.use('/platform-api/uploads', express.static(path.resolve(__dirname, '..', 'uploads'), {
  maxAge: '7d',
  fallthrough: true
}));

// ---------------- 健康检查 ----------------
app.get('/platform-api/health', async (req, res) => {
  const database = await db.ping();
  return ok(res, {
    service: 'integrated-platform-api',
    env: config.env,
    time: new Date().toISOString(),
    database,
    redis: redis.status()
  });
});

// ---------------- 业务路由 ----------------
app.use('/platform-api/auth', require('./routes/authRoutes'));
app.use('/platform-api/resources', require('./routes/resourceRoutes'));
app.use('/platform-api/questions', require('./routes/questionRoutes'));
app.use('/platform-api/chat', require('./routes/chatRoutes'));
app.use('/platform-api/admin', require('./routes/adminRoutes'));

// ---------------- 错误处理 ----------------
app.use(notFound);
app.use(errorHandler);

// ---------------- 启动 ----------------
async function bootstrap() {
  await redis.init();

  const ping = await db.ping();
  if (ping.connected) logger.info('MySQL 连接成功: ' + config.db.host + ':' + config.db.port + '/' + config.db.database);
  else logger.error('MySQL 连接失败: ' + ping.error);

  const server = http.createServer(app);

  // WebSocket 聊天服务
  require('./ws/chatServer').init(server);

  // 每小时清理一次过期消息
  setInterval(() => {
    require('./services/chatService').purgeExpired()
      .then((n) => { if (n) logger.info('已清理过期消息 ' + n + ' 条'); })
      .catch((err) => logger.warn('清理过期消息失败: ' + err.message));
  }, 3600 * 1000);

  const port = config.port;
  server.listen(port, () => {
    logger.info('综合平台后端已启动: http://localhost:' + port);
    logger.info('健康检查: http://localhost:' + port + '/platform-api/health');
    logger.info('WebSocket: ws://localhost:' + port + '/platform-ws');
  });

  const shutdown = async (signal) => {
    logger.info('收到 ' + signal + '，正在关闭服务...');
    server.close();
    await redis.close();
    await db.close();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

if (require.main === module) {
  bootstrap().catch((err) => {
    logger.error('启动失败: ' + (err && err.stack ? err.stack : err));
    process.exit(1);
  });
}

module.exports = { app, bootstrap };
