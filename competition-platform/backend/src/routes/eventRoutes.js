'use strict';
const router = require('express').Router();
const ctrl = require('../controllers/eventController');
const stageCtrl = require('../controllers/stageController');
const { requireAdmin, requireAuth } = require('../middlewares/auth');

// 前台首页：当前启用赛事与环节（登录即可访问）
router.get('/current', requireAuth, ctrl.current);

// 后台赛事管理
router.get('/', requireAdmin, ctrl.list);
router.post('/', requireAdmin, ctrl.create);
router.get('/:id', requireAdmin, ctrl.get);
router.put('/:id', requireAdmin, ctrl.update);
router.delete('/:id', requireAdmin, ctrl.remove);

// 赛事下的环节
router.get('/:id/stages', requireAdmin, ctrl.stages);
router.post('/:id/stages', requireAdmin, stageCtrl.create);
router.put('/:id/stages/reorder', requireAdmin, stageCtrl.reorder);

module.exports = router;
