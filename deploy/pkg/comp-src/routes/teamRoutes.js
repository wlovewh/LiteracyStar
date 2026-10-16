'use strict';
const router = require('express').Router();
const ctrl = require('../controllers/teamController');
const { requireAdmin } = require('../middlewares/auth');
const { single } = require('../middlewares/upload');

router.get('/', requireAdmin, ctrl.list);
router.get('/export', requireAdmin, ctrl.exportExcel);
router.get('/import/template', requireAdmin, ctrl.template);
router.post('/import', requireAdmin, single, ctrl.import);
router.post('/batch-delete', requireAdmin, ctrl.removeMany);
router.post('/', requireAdmin, ctrl.create);
router.get('/:id', requireAdmin, ctrl.get);
router.put('/:id', requireAdmin, ctrl.update);
// 该队伍可见的赛事（与赛事管理中的设置是同一份数据）
router.get('/:id/events', requireAdmin, ctrl.visibleEvents);
router.put('/:id/events', requireAdmin, ctrl.setVisibleEvents);
router.post('/:id/clear-answers', requireAdmin, ctrl.clearAnswers);
router.delete('/:id', requireAdmin, ctrl.remove);

module.exports = router;
