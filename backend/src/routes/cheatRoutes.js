'use strict';
const router = require('express').Router();
const ctrl = require('../controllers/adminController');
const { requireStudent, requireAuth } = require('../middlewares/auth');

// 学生端上报切屏/失焦事件 (project.md 7.5)
router.post('/report', requireStudent, async (req, res, next) => {
  try {
    const cheatService = require('../services/cheatService');
    const { stageId, eventType, duration } = req.body || {};
    const result = await cheatService.log(req.user, { stageId, eventType, duration });
    return res.json({ code: 0, message: 'ok', data: result });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
