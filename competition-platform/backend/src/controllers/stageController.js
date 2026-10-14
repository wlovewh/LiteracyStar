'use strict';
const service = require('../services/stageService');
const { ok, asyncHandler } = require('../utils/response');

exports.listByEvent = asyncHandler(async (req, res) => ok(res, await service.listByEvent(req.params.eventId)));
exports.get = asyncHandler(async (req, res) => ok(res, await service.getById(req.params.id)));
exports.create = asyncHandler(async (req, res) => ok(res, await service.create(req.params.eventId, req.body || {}), '创建成功'));
exports.update = asyncHandler(async (req, res) => ok(res, await service.update(req.params.id, req.body || {}), '保存成功'));
exports.copy = asyncHandler(async (req, res) => ok(res, await service.copy(req.params.id), '复制成功'));
exports.setStatus = asyncHandler(async (req, res) => ok(res, await service.setStatus(req.params.id, req.body.status), '状态已更新'));
exports.remove = asyncHandler(async (req, res) => ok(res, await service.remove(req.params.id), '删除成功'));
exports.move = asyncHandler(async (req, res) => ok(res, await service.move(req.params.id, req.body.direction), '排序已更新'));
exports.reorder = asyncHandler(async (req, res) => ok(res, await service.reorder(req.params.eventId, req.body.ids), '排序已更新'));
