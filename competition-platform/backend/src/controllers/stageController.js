'use strict';
const service = require('../services/stageService');
const { ok, asyncHandler } = require('../utils/response');

/**
 * 赛事 ID 兼容取值。
 * 同一控制器同时挂在两条路由上：
 *   /api/events/:id/stages   -> req.params.id
 *   /api/events/:eventId/... -> req.params.eventId
 * 统一用本函数读取，避免某一侧取到 undefined 而报
 * "Bind parameters must not contain undefined"。
 */
function eventIdOf(req) {
  return req.params.eventId !== undefined ? req.params.eventId : req.params.id;
}

exports.listByEvent = asyncHandler(async (req, res) => ok(res, await service.listByEvent(eventIdOf(req))));
exports.get = asyncHandler(async (req, res) => ok(res, await service.getById(req.params.id)));
exports.create = asyncHandler(async (req, res) => ok(res, await service.create(eventIdOf(req), req.body || {}), '创建成功'));
exports.update = asyncHandler(async (req, res) => ok(res, await service.update(req.params.id, req.body || {}), '保存成功'));
exports.copy = asyncHandler(async (req, res) => ok(res, await service.copy(req.params.id), '复制成功'));
exports.setStatus = asyncHandler(async (req, res) => ok(res, await service.setStatus(req.params.id, req.body.status), '状态已更新'));
exports.remove = asyncHandler(async (req, res) => ok(res, await service.remove(req.params.id), '删除成功'));
exports.move = asyncHandler(async (req, res) => ok(res, await service.move(req.params.id, req.body.direction), '排序已更新'));
exports.reorder = asyncHandler(async (req, res) => ok(res, await service.reorder(eventIdOf(req), req.body.ids), '排序已更新'));
