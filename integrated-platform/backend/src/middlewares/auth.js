'use strict';
const jwtUtil = require('../utils/jwt');
const { AppError } = require('../utils/response');

/** 从请求中提取令牌：Authorization 头或 ?token= */
function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  if (req.query && req.query.token) return String(req.query.token);
  return null;
}

/** 解析令牌并挂载 req.auth，未登录则 401 */
function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return next(new AppError('未登录或登录已过期', 401, 401));
  try {
    req.auth = jwtUtil.verify(token);
    return next();
  } catch (err) {
    return next(new AppError('未登录或登录已过期', 401, 401));
  }
}

/** 仅管理员密钥可用 */
function requireAdmin(req, res, next) {
  return requireAuth(req, res, (err) => {
    if (err) return next(err);
    if (req.auth.role !== 'admin') return next(new AppError('需要管理员权限', 403, 403));
    return next();
  });
}

/** 可选登录：有令牌则解析，无令牌也放行（用于邀请码访客） */
function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (token) {
    try {
      req.auth = jwtUtil.verify(token);
    } catch (_) {
      req.auth = null;
    }
  }
  return next();
}

module.exports = { requireAuth, requireAdmin, optionalAuth, extractToken };
