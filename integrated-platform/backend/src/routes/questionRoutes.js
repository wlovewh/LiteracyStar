'use strict';
const router = require('express').Router();
const ctrl = require('../controllers/questionController');
const { requireAdmin, optionalAuth } = require('../middlewares/auth');
const upload = require('../middlewares/upload');

// 检索（登录用户与开放状态下的访客可用）
router.get('/search', optionalAuth, ctrl.search);
router.get('/facets', optionalAuth, ctrl.facets);
router.get('/export', optionalAuth, ctrl.exportCsv);
router.post('/extract-keywords', ctrl.extractKeywords);
router.post('/check-duplicate', ctrl.checkDuplicate);

// 设置
router.get('/settings', ctrl.getSettings);
router.put('/settings', requireAdmin, ctrl.setSettings);

// 题库管理（管理端，project.md 追加文档 8.1）
router.get('/manage/template', requireAdmin, ctrl.template);
router.post('/manage/import', requireAdmin, upload.singleSheet, ctrl.importQuestions);
router.post('/manage/batch-remove', requireAdmin, ctrl.batchRemove);
router.post('/manage', requireAdmin, ctrl.create);
router.put('/manage/:id', requireAdmin, ctrl.update);
router.delete('/manage/:id', requireAdmin, ctrl.remove);

// 单题详情（放在最后，避免吞掉上面的具名路由）
router.get('/:id', optionalAuth, ctrl.detail);

module.exports = router;
