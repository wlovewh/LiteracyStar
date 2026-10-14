'use strict';
const service = require('../services/eventService');
const stageService = require('../services/stageService');
const { ok, asyncHandler } = require('../utils/response');

exports.list = asyncHandler(async (req, res) => ok(res, await service.list(req.query)));
exports.get = asyncHandler(async (req, res) => ok(res, await service.getById(req.params.id)));
exports.create = asyncHandler(async (req, res) => ok(res, await service.create(req.body || {}), '创建成功'));
exports.update = asyncHandler(async (req, res) => ok(res, await service.update(req.params.id, req.body || {}), '保存成功'));
exports.remove = asyncHandler(async (req, res) => ok(res, await service.remove(req.params.id), '删除成功'));

/** 赛事下的环节列表 */
exports.stages = asyncHandler(async (req, res) => {
  await service.getById(req.params.id);
  return ok(res, await stageService.listByEvent(req.params.id));
});

/** 前台：可参与的赛事列表（学生端选择用） */
exports.forStudent = asyncHandler(async (req, res) => ok(res, await service.listForStudent()));

/** 前台首页数据；可选 eventId 指定赛事 */
exports.current = asyncHandler(async (req, res) => ok(res, await service.currentForStudent(req.query.eventId)));
