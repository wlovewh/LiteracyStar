'use strict';
const router = require('express').Router();
const ctrl = require('../controllers/adminController');
const { requireAdmin, requireAuth } = require('../middlewares/auth');

router.get('/dashboard', requireAdmin, ctrl.dashboard);
router.get('/stats', requireAdmin, ctrl.statsOverview);
router.get('/cheat-logs', requireAdmin, ctrl.cheatList);
router.get('/cheat-logs/summary', requireAdmin, ctrl.cheatSummary);
router.get('/cheat-logs/export', requireAdmin, ctrl.cheatExport);
router.get('/system-logs', requireAdmin, ctrl.systemLogs);
router.get('/settings', requireAdmin, ctrl.settings);
router.post('/stages/:id/rebuild-rank', requireAdmin, ctrl.rebuildRank);

module.exports = router;
