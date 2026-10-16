'use strict';
const router = require('express').Router();
const ctrl = require('../controllers/chatController');
const { requireAdmin, optionalAuth } = require('../middlewares/auth');
const upload = require('../middlewares/upload');

// 快速短语（访客可读，管理员可写）
router.get('/phrases', optionalAuth, ctrl.listPhrases);
router.post('/phrases', requireAdmin, ctrl.createPhrase);
router.put('/phrases/:id', requireAdmin, ctrl.updatePhrase);
router.delete('/phrases/:id', requireAdmin, ctrl.removePhrase);

// 聊天室
router.post('/rooms', ctrl.ensureRoom);
router.get('/rooms/by-invite', ctrl.byInvite);
router.get('/rooms', requireAdmin, ctrl.listRooms);
router.get('/rooms/:id', ctrl.getRoom);
router.put('/rooms/:id', requireAdmin, ctrl.updateRoom);
router.post('/rooms/:id/invite', ctrl.refreshInvite);
router.get('/rooms/:id/messages', ctrl.messages);
router.post('/rooms/:id/messages', ctrl.send);
// 图片上传：先传文件拿到 URL，再作为 messageType='image' 的消息发送
router.post('/rooms/:id/image', upload.chatImage, ctrl.uploadImage);
router.get('/rooms/:id/search', ctrl.searchMessages);
router.post('/rooms/:id/answer', ctrl.submitAnswer);
router.get('/rooms/:id/online', ctrl.online);
router.post('/rooms/:id/heartbeat', ctrl.heartbeat);
router.delete('/rooms/:id/messages', requireAdmin, ctrl.clearRoom);
// 删除整个聊天室（连同消息与在线状态），仅管理员
router.delete('/rooms/:id', requireAdmin, ctrl.removeRoom);
router.delete('/messages/:messageId', requireAdmin, ctrl.deleteMessage);

module.exports = router;
