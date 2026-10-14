'use strict';
const router = require('express').Router();
const ctrl = require('../controllers/adminController');
const { requireAdmin } = require('../middlewares/auth');

router.get('/dashboard', requireAdmin, ctrl.dashboard);
router.get('/stats', requireAdmin, ctrl.stats);
router.get('/settings', requireAdmin, ctrl.settings);
router.post('/purge-messages', requireAdmin, ctrl.purgeMessages);

module.exports = router;
