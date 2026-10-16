'use strict';
const router = require('express').Router();
const ctrl = require('../controllers/stageController');
const { requireAdmin } = require('../middlewares/auth');

// 全部环节的简要列表（含所属赛事名），供下拉选择使用。
// 必须放在 '/:id' 之前，否则 'options' 会被当成 id。
router.get('/options', requireAdmin, ctrl.options);
router.get('/:id', requireAdmin, ctrl.get);
router.put('/:id', requireAdmin, ctrl.update);
router.delete('/:id', requireAdmin, ctrl.remove);
router.post('/:id/copy', requireAdmin, ctrl.copy);
router.post('/:id/status', requireAdmin, ctrl.setStatus);
router.post('/:id/move', requireAdmin, ctrl.move);

module.exports = router;
