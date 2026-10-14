'use strict';
const service = require('../services/resourceService');
const { ok, asyncHandler } = require('../utils/response');

// 分类
exports.listCategories = asyncHandler(async (req, res) => {
  const onlyEnabled = req.query.all !== '1' || req.auth?.role !== 'admin';
  return ok(res, await service.listCategories({ withSites: req.query.withSites === '1', onlyEnabled }));
});
exports.createCategory = asyncHandler(async (req, res) => ok(res, await service.createCategory(req.body || {}), '创建成功'));
exports.updateCategory = asyncHandler(async (req, res) => ok(res, await service.updateCategory(req.params.id, req.body || {}), '保存成功'));
exports.removeCategory = asyncHandler(async (req, res) => ok(res, await service.removeCategory(req.params.id), '删除成功'));
exports.reorderCategories = asyncHandler(async (req, res) => ok(res, await service.reorderCategories(req.body && req.body.ids), '排序已保存'));

// 网站
exports.listSites = asyncHandler(async (req, res) => {
  const onlyEnabled = req.query.all !== '1' || req.auth?.role !== 'admin';
  return ok(res, await service.listSites({ ...req.query, onlyEnabled }));
});
exports.createSite = asyncHandler(async (req, res) => ok(res, await service.createSite(req.body || {}), '创建成功'));
exports.updateSite = asyncHandler(async (req, res) => ok(res, await service.updateSite(req.params.id, req.body || {}), '保存成功'));
exports.removeSite = asyncHandler(async (req, res) => ok(res, await service.removeSite(req.params.id), '删除成功'));
exports.trackVisit = asyncHandler(async (req, res) => ok(res, await service.trackVisit(req.params.id)));
