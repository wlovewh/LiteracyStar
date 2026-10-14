'use strict';
const router = require('express').Router();
const ctrl = require('../controllers/examController');
const { requireStudent, requireAuth } = require('../middlewares/auth');

router.get('/:id/ready', requireStudent, ctrl.ready);
router.post('/:id/start', requireStudent, ctrl.start);
router.post('/:id/answer', requireStudent, ctrl.submitAnswer);
router.post('/:id/submit', requireStudent, ctrl.submit);
router.get('/:id/result', requireStudent, ctrl.result);
router.get('/:id/wrong', requireStudent, ctrl.wrong);
// 排行榜：学生与管理员均可查看
router.get('/:id/rank', requireAuth, ctrl.rank);

module.exports = router;
