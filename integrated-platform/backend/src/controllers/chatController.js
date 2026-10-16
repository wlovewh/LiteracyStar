'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const service = require('../services/chatService');
const { ok, asyncHandler, AppError } = require('../utils/response');

/** 聊天图片目录：backend/uploads/chat */
const CHAT_IMG_DIR = path.resolve(__dirname, '..', '..', 'uploads', 'chat');
const CHAT_EXT_BY_MIME = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp'
};

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

/**
 * 生成 / 自定义房间码。
 * body.code 传入 6 位数字时使用自定义码，否则随机重新生成。
 */
exports.refreshInvite = asyncHandler(async (req, res) => {
  const code = req.body && req.body.code;
  const hasCustom = code !== undefined && code !== null && String(code).trim() !== '';
  const data = hasCustom
    ? await service.setInviteCode(req.params.id, code)
    : await service.refreshInviteCode(req.params.id);
  return ok(res, data, hasCustom ? '房间码已更新' : '邀请码已生成');
});

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
/**
 * 聊天室图片上传 (project.md 追加文档 聊天室增强)
 * 接收 multipart 字段 image，存入 uploads/chat，返回可访问 URL。
 * 前端拿到 URL 后作为 messageType='image' 的消息发送，
 * 因此图片内容不落库、不进 WebSocket 帧，只传一个短 URL。
 */
exports.uploadImage = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError('请选择要发送的图片');

  const ext = CHAT_EXT_BY_MIME[req.file.mimetype];
  if (!ext) throw new AppError('仅支持 PNG / JPG / GIF / WEBP 格式');

  // 限制单张图片 5MB，避免占用过多磁盘与带宽
  if (req.file.size > 5 * 1024 * 1024) throw new AppError('图片不能超过 5MB');

  fs.mkdirSync(CHAT_IMG_DIR, { recursive: true });
  const filename = Date.now().toString(36) + '_' + crypto.randomBytes(6).toString('hex') + ext;
  fs.writeFileSync(path.join(CHAT_IMG_DIR, filename), req.file.buffer);

  return ok(res, { url: '/platform-api/uploads/chat/' + filename, filename }, '上传成功');
});

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
