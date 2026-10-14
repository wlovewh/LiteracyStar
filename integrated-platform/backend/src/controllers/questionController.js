'use strict';
const service = require('../services/questionService');
const { ok, asyncHandler, AppError } = require('../utils/response');

exports.search = asyncHandler(async (req, res) => {
  // 无密钥访客仅在管理员开启检索功能时可用 (6.3)
  if (!req.auth && !(await service.isSearchEnabled())) {
    throw new AppError('题库检索功能当前未开放', 403, 403);
  }
  await service.trackSearch();
  return ok(res, await service.search(req.query));
});

exports.facets = asyncHandler(async (req, res) => ok(res, await service.facets()));

exports.detail = asyncHandler(async (req, res) => {
  const result = await service.search({ id: req.params.id, pageSize: 1 });
  if (!result.list.length) throw new AppError('题目不存在', 404, 404);
  return ok(res, result.list[0]);
});

exports.extractKeywords = asyncHandler(async (req, res) => {
  const content = (req.body && req.body.content) || req.query.content || '';
  return ok(res, { keywords: service.extractKeywords(content) });
});

exports.checkDuplicate = asyncHandler(async (req, res) => {
  const { roomId, content } = req.body || {};
  if (!roomId || !content) throw new AppError('缺少 roomId 或 content');
  return ok(res, await service.checkDuplicate(roomId, content));
});

exports.exportCsv = asyncHandler(async (req, res) => {
  const csv = await service.exportCsv(req.query);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="questions-export.csv"');
  return res.send(csv);
});

exports.getSettings = asyncHandler(async (req, res) => ok(res, { searchEnabled: await service.isSearchEnabled() }));
exports.setSettings = asyncHandler(async (req, res) => {
  const enabled = !!(req.body && req.body.searchEnabled);
  return ok(res, await service.setSearchEnabled(enabled), '设置已保存');
});
