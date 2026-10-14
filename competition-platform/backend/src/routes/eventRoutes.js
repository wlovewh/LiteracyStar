'use strict';
const router = require('express').Router();
const ctrl = require('../controllers/eventController');
const stageCtrl = require('../controllers/stageController');
const { requireAdmin, requireAuth } = require('../middlewares/auth');

// 前台：可参与的赛事列表与首页数据（登录即可访问）
// 注意：必须放在 '/:id' 之前，否则会被 '/:id' 抢先匹配
router.get('/current', requireAuth, ctrl.current);
router.get('/available', requireAuth, ctrl.forStudent);

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
