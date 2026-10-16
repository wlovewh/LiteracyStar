'use strict';
const jwt = require('jsonwebtoken');
const config = require('../config');

/**
 * 令牌载荷
 *   role: 'admin' | 'leader' | 'member'
 *   学生: { role, studentId, teamId, name, isLeader }
 *   管理员: { role: 'admin', adminId, username }
 */
function sign(payload) {
  return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
}

function verify(token) {
  return jwt.verify(token, config.jwt.secret);
}

module.exports = { sign, verify };
