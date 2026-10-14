'use strict';
const router = require('express').Router();
const ctrl = require('../controllers/authController');
const { requireAdmin, requireAuth } = require('../middlewares/auth');

router.post('/login', ctrl.login);
router.get('/me', requireAuth, ctrl.me);
router.get('/keys', requireAdmin, ctrl.list);
router.get('/keys/generate', requireAdmin, ctrl.generate);
router.post('/keys', requireAdmin, ctrl.create);
router.put('/keys/:id', requireAdmin, ctrl.update);
router.delete('/keys/:id', requireAdmin, ctrl.remove);

module.exports = router;
