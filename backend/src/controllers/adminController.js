'use strict';
const cheatService = require('../services/cheatService');
const statsService = require('../services/statsService');
const db = require('../config/db');
const redis = require('../config/redis');
const rankService = require('../services/rankService');
const { ok, asyncHandler } = require('../utils/response');

// ---- 仪表盘 ----
exports.dashboard = asyncHandler(async (req, res) => ok(res, await statsService.dashboard()));

// ---- 预警管理 ----
exports.cheatList = asyncHandler(async (req, res) => ok(res, await cheatService.list(req.query)));
exports.cheatSummary = asyncHandler(async (req, res) => ok(res, await cheatService.summary()));
exports.cheatExport = asyncHandler(async (req, res) => {
  const csv = await cheatService.exportCsv(req.query);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="cheat-logs.csv"');
  return res.send(csv);
});

// ---- 数据统计 ----
exports.statsOverview = asyncHandler(async (req, res) => ok(res, await statsService.overview(req.query.stageId ? Number(req.query.stageId) : null)));

// ---- 系统日志 ----
exports.systemLogs = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 20));
  const where = [];
  const params = [];
  if (req.query.level) { where.push('level = ?'); params.push(req.query.level); }
  const whereSql = where.length ? ' WHERE ' + where.join(' AND ') : '';
  const countRow = await db.queryOne('SELECT COUNT(*) AS total FROM system_logs' + whereSql, params);
  const rows = await db.query(
    'SELECT * FROM system_logs' + whereSql + ' ORDER BY id DESC LIMIT ' + pageSize + ' OFFSET ' + ((page - 1) * pageSize),
    params
  );
  return ok(res, { list: rows, total: countRow ? Number(countRow.total) : 0, page, pageSize });
});

// ---- 系统设置 / 健康状态 ----
exports.settings = asyncHandler(async (req, res) => {
  const config = require('../config');
  let dbOk = false;
  let dbError = null;
  try {
    dbOk = await db.ping();
  } catch (err) {
    dbError = err.message;
  }
  return ok(res, {
    env: config.env,
    port: config.port,
    database: { host: config.db.host, port: config.db.port, name: config.db.database, connected: dbOk, error: dbError },
    redis: redis.status(),
    cheat: config.cheat,
    rankPushIntervalMs: config.rankPushIntervalMs
  });
});

/** 重建某环节排行榜（Redis 数据丢失或重启后修复） */
exports.rebuildRank = asyncHandler(async (req, res) => {
  const count = await rankService.rebuild(req.params.id);
  return ok(res, { stageId: Number(req.params.id), teams: count }, '排行榜已重建');
});
