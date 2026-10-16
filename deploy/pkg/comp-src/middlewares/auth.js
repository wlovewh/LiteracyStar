'use strict';
const { verify } = require('../utils/jwt');
const { fail } = require('../utils/response');

function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  if (req.query && req.query.token) return String(req.query.token);
  return null;
}

/** 必须登录 */
function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return fail(res, '未登录或登录已过期', 401, 401);
  try {
    req.user = verify(token);
    return next();
  } catch (_) {
    return fail(res, '登录状态无效，请重新登录', 401, 401);
  }
}

/** 必须是管理员 */
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (!req.user || req.user.role !== 'admin') {
      return fail(res, '需要管理员权限', 403, 403);
    }
    return next();
  });
}

/** 必须是学生（队长或队员） */
function requireStudent(req, res, next) {
  requireAuth(req, res, () => {
    if (!req.user || (req.user.role !== 'leader' && req.user.role !== 'member')) {
      return fail(res, '需要学生身份', 403, 403);
    }
    return next();
  });
}

/** 可选登录：有令牌则解析，无令牌也放行 */
function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (token) {
    try {
      req.user = verify(token);
    } catch (_) {
      req.user = null;
    }
  }
  return next();
}

module.exports = { requireAuth, requireAdmin, requireStudent, optionalAuth, extractToken };
