'use strict';
const stats = require('../services/statsService');
const questionService = require('../services/questionService');
const chatService = require('../services/chatService');
const { ok, asyncHandler } = require('../utils/response');

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
  return ok(res, { searchEnabled: await questionService.isSearchEnabled() });
});
