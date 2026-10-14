'use strict';
const router = require('express').Router();
const ctrl = require('../controllers/questionController');
const { requireAdmin, optionalAuth } = require('../middlewares/auth');

router.get('/search', optionalAuth, ctrl.search);
router.get('/facets', optionalAuth, ctrl.facets);
router.get('/export', optionalAuth, ctrl.exportCsv);
router.post('/extract-keywords', ctrl.extractKeywords);
router.post('/check-duplicate', ctrl.checkDuplicate);
router.get('/settings', ctrl.getSettings);
router.put('/settings', requireAdmin, ctrl.setSettings);
router.get('/:id', optionalAuth, ctrl.detail);

module.exports = router;
