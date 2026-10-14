'use strict';
const service = require('../services/chatService');
const { ok, asyncHandler, AppError } = require('../utils/response');

/** 队长登录后确保本队聊天室存在 */
exports.ensureRoom = asyncHandler(async (req, res) => {
  const { teamId, name, maxMembers, retentionDays } = req.body || {};
  if (!teamId) throw new AppError('缺少队伍ID');
  const room = await service.ensureRoom({ teamId, name, maxMembers, retentionDays });
  return ok(res, room);
});

exports.byInvite = asyncHandler(async (req, res) => {
  const room = await service.findByInviteCode(req.query.code || (req.body && req.body.code));
  return ok(res, room);
});

exports.getRoom = asyncHandler(async (req, res) => ok(res, await service.getRoomById(req.params.id)));

exports.refreshInvite = asyncHandler(async (req, res) =>
  ok(res, await service.refreshInviteCode(req.params.id), '邀请码已生成'));

exports.messages = asyncHandler(async (req, res) =>
  ok(res, await service.recentMessages(req.params.id, req.query.limit)));

exports.send = asyncHandler(async (req, res) => {
  const msg = await service.saveMessage(req.params.id, req.body || {});
  return ok(res, msg, '已发送');
});

exports.submitAnswer = asyncHandler(async (req, res) => {
  const result = await service.submitAnswer(req.params.id, req.body || {});
  return ok(res, result, '答案已提交');
});

exports.searchMessages = asyncHandler(async (req, res) =>
  ok(res, await service.searchMessages(req.params.id, req.query.keyword)));

exports.deleteMessage = asyncHandler(async (req, res) =>
  ok(res, await service.deleteMessage(req.params.messageId), '已删除'));

exports.clearRoom = asyncHandler(async (req, res) =>
  ok(res, await service.clearRoom(req.params.id), '聊天室已清空'));

exports.online = asyncHandler(async (req, res) => ok(res, await service.getOnlineMembers(req.params.id)));

exports.heartbeat = asyncHandler(async (req, res) => {
  const { memberKey, name } = req.body || {};
  if (memberKey) await service.setOnline(req.params.id, memberKey, name || memberKey);
  return ok(res, { ok: true });
});

// 管理端
exports.listRooms = asyncHandler(async (req, res) => ok(res, await service.listRooms()));
exports.updateRoom = asyncHandler(async (req, res) =>
  ok(res, await service.updateRoom(req.params.id, req.body || {}), '保存成功'));

// 快速短语
exports.listPhrases = asyncHandler(async (req, res) => {
  const onlyEnabled = !req.auth || req.auth.role !== 'admin';
  return ok(res, await service.listPhrases({ onlyEnabled }));
});
exports.createPhrase = asyncHandler(async (req, res) => ok(res, await service.createPhrase(req.body || {}), '创建成功'));
exports.updatePhrase = asyncHandler(async (req, res) => ok(res, await service.updatePhrase(req.params.id, req.body || {}), '保存成功'));
exports.removePhrase = asyncHandler(async (req, res) => ok(res, await service.removePhrase(req.params.id), '删除成功'));
