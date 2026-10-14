'use strict';
const fs = require('fs');
const stats = require('../services/statsService');
const questionService = require('../services/questionService');
const chatService = require('../services/chatService');
const backupService = require('../services/backupService');
const { ok, asyncHandler, AppError } = require('../utils/response');

exports.dashboard = asyncHandler(async (req, res) => ok(res, await stats.overview()));
exports.stats = asyncHandler(async (req, res) => {
  const [topSites, categories, trend, types] = await Promise.all([
    stats.topSites(10),
    stats.categoryDistribution(),
    stats.messageTrend(req.query.days || 7),
    stats.messageTypeDistribution()
  ]);
  return ok(res, { topSites, categories, trend, messageTypes: types });
});

exports.purgeMessages = asyncHandler(async (req, res) => {
  const deleted = await chatService.purgeExpired();
  return ok(res, { deleted }, '过期消息清理完成');
});

exports.settings = asyncHandler(async (req, res) => {
  return ok(res, {
    searchEnabled: await questionService.isSearchEnabled(),
    backup: await backupService.getConfig()
  });
});

// ---------------- 数据库备份 ----------------

/** 备份配置 + 历史记录 */
exports.backupOverview = asyncHandler(async (req, res) => {
  const [cfg, list] = await Promise.all([
    backupService.getConfig(),
    backupService.listBackups({ limit: Number(req.query.limit) || 100 })
  ]);
  return ok(res, { config: cfg, list });
});

/** 保存备份配置（是否启用、每天几点、保留份数） */
exports.saveBackupConfig = asyncHandler(async (req, res) => {
  const cfg = await backupService.saveConfig(req.body || {});
  return ok(res, cfg, '备份设置已保存');
});

/** 立即执行一次备份 */
exports.runBackup = asyncHandler(async (req, res) => {
  const result = await backupService.createBackup('manual');
  return ok(res, result, '备份完成');
});

/** 删除单条备份 */
exports.removeBackup = asyncHandler(async (req, res) => {
  const result = await backupService.removeBackup(req.params.id);
  if (!result.removed) throw new AppError('备份记录不存在', 404, 404);
  return ok(res, result, '备份已删除');
});

/** 批量删除备份 */
exports.removeBackups = asyncHandler(async (req, res) => {
  const result = await backupService.removeMany((req.body || {}).ids);
  return ok(res, result, '已删除 ' + result.removed + ' 条备份');
});

/** 下载备份文件 */
exports.downloadBackup = asyncHandler(async (req, res) => {
  const file = await backupService.resolveBackupFile(req.params.filename);
  if (!file) throw new AppError('备份文件不存在或已被删除', 404, 404);
  res.setHeader('Content-Type', 'application/sql');
  res.setHeader('Content-Disposition', 'attachment; filename="' + req.params.filename + '"');
  fs.createReadStream(file).pipe(res);
});
