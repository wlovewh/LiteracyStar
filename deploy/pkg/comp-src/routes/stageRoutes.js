'use strict';
const router = require('express').Router();
const ctrl = require('../controllers/stageController');
const { requireAdmin } = require('../middlewares/auth');

router.get('/:id', requireAdmin, ctrl.get);
router.put('/:id', requireAdmin, ctrl.update);
router.delete('/:id', requireAdmin, ctrl.remove);
router.post('/:id/copy', requireAdmin, ctrl.copy);
router.post('/:id/status', requireAdmin, ctrl.setStatus);
router.post('/:id/move', requireAdmin, ctrl.move);

module.exports = router;
