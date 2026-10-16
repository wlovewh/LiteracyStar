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

/** 前台：可参与的赛事列表（学生端选择用，按队伍可见范围过滤） */
exports.forStudent = asyncHandler(async (req, res) =>
  ok(res, await service.listForStudent(req.user && req.user.teamId))
);

/** 前台首页数据；可选 eventId 指定赛事 */
exports.current = asyncHandler(async (req, res) =>
  ok(res, await service.currentForStudent(req.query.eventId, req.user && req.user.teamId))
);

// ---------------- 赛事可见范围 ----------------

/** 某赛事可见的队伍 */
exports.visibleTeams = asyncHandler(async (req, res) =>
  ok(res, await service.getVisibleTeams(req.params.id))
);

/** 覆盖式设置某赛事可见的队伍；teamIds 为空数组表示对全体开放 */
exports.setVisibleTeams = asyncHandler(async (req, res) =>
  ok(res, await service.setVisibleTeams(req.params.id, (req.body || {}).teamIds), '可见范围已保存')
);

/** 某队伍可见的赛事 */
exports.visibleEvents = asyncHandler(async (req, res) =>
  ok(res, await service.getVisibleEvents(req.params.id))
);

/** 覆盖式设置某队伍可见的赛事 */
exports.setVisibleEvents = asyncHandler(async (req, res) =>
  ok(res, await service.setVisibleEvents(req.params.id, (req.body || {}).eventIds), '可见范围已保存')
);

/** 全部赛事的可见范围总览 */
exports.visibility = asyncHandler(async (req, res) => ok(res, await service.visibilityOverview()));
