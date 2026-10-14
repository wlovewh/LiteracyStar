'use strict';
const router = require('express').Router();
const ctrl = require('../controllers/examController');
const { optionalAuth } = require('../middlewares/auth');

// SSE 实时排行榜 (project.md 8.2)
// EventSource 无法自定义请求头，因此通过 query.token 传递令牌
router.get('/stream', optionalAuth, (req, res, next) => {
  req.params.id = req.query.stageId;
  return ctrl.stream(req, res, next);
});
router.get('/:id', optionalAuth, ctrl.rank);

module.exports = router;
