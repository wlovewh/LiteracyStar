'use strict';
const router = require('express').Router();
const ctrl = require('../controllers/resourceController');
const { requireAdmin, optionalAuth } = require('../middlewares/auth');
const upload = require('../middlewares/upload');

// 分类
router.get('/categories', optionalAuth, ctrl.listCategories);
router.post('/categories', requireAdmin, ctrl.createCategory);
router.post('/categories/reorder', requireAdmin, ctrl.reorderCategories);
router.put('/categories/:id', requireAdmin, ctrl.updateCategory);
router.delete('/categories/:id', requireAdmin, ctrl.removeCategory);

// 网站
// 批量导入相关路由必须放在 '/sites/:id' 之前，避免被当成 id
router.get('/sites/import-template', requireAdmin, ctrl.downloadTemplate);
router.post('/sites/import', requireAdmin, upload.singleSheet, ctrl.importSites);
router.get('/sites', optionalAuth, ctrl.listSites);
router.post('/sites', requireAdmin, ctrl.createSite);
router.put('/sites/:id', requireAdmin, ctrl.updateSite);
router.delete('/sites/:id', requireAdmin, ctrl.removeSite);
router.post('/sites/:id/visit', ctrl.trackVisit);

// 图标上传 / 删除
router.post('/icons', requireAdmin, upload.singleImage, ctrl.uploadIcon);
router.delete('/icons/:filename', requireAdmin, ctrl.removeIcon);

module.exports = router;
