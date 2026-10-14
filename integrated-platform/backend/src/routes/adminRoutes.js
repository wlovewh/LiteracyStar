'use strict';
const router = require('express').Router();
const ctrl = require('../controllers/adminController');
const { requireAdmin } = require('../middlewares/auth');

router.get('/dashboard', requireAdmin, ctrl.dashboard);
router.get('/stats', requireAdmin, ctrl.stats);
router.get('/settings', requireAdmin, ctrl.settings);
router.post('/purge-messages', requireAdmin, ctrl.purgeMessages);

// 数据库备份：设置、立即执行、查看、下载、删除
router.get('/backup', requireAdmin, ctrl.backupOverview);
router.put('/backup/config', requireAdmin, ctrl.saveBackupConfig);
router.post('/backup/run', requireAdmin, ctrl.runBackup);
router.post('/backup/batch-delete', requireAdmin, ctrl.removeBackups);
router.get('/backup/download/:filename', requireAdmin, ctrl.downloadBackup);
router.delete('/backup/:id', requireAdmin, ctrl.removeBackup);

module.exports = router;
