'use strict';
const router = require('express').Router();
const ctrl = require('../controllers/authController');
const { requireAuth } = require('../middlewares/auth');

// 管理员登录: POST /api/auth/admin/login  { username, password }
router.post('/admin/login', ctrl.adminLogin);
// 学生登录:   POST /api/auth/student/login { studentId, password }
router.post('/student/login', ctrl.studentLogin);
// 当前用户
router.get('/me', requireAuth, ctrl.me);

module.exports = router;
