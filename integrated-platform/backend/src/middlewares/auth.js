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

/**
 * 题库检索准入：密钥登录用户，或持有效邀请码进入聊天室的访客。
 *
 * 设计依据 project.md 6.3：通过邀请码进入聊天室的用户也可以使用题库检索，
 * 由管理员开关控制。注意这里的"访客"必须是**持有有效邀请码**的聊天室成员，
 * 而不是任意匿名访问者——否则题库连同答案会对全网公开。
 *
 * 邀请码通过请求头 X-Invite-Code 传入。
 */
async function requireQuestionAccess(req, res, next) {
  // 1) 已登录（管理员或普通密钥用户）：始终放行
  const token = extractToken(req);
  if (token) {
    try {
      req.auth = jwtUtil.verify(token);
      return next();
    } catch (_) {
      /* 令牌无效则继续按访客判定 */
    }
  }

  // 2) 访客：必须开启开关，且提供有效邀请码
  const { AppError } = require('../utils/response');
  try {
    const questionService = require('../services/questionService');
    if (!(await questionService.isSearchEnabled())) {
      throw new AppError('题库检索功能当前未开放', 403, 403);
    }

    const code = req.headers['x-invite-code'] || req.query.inviteCode;
    if (!code) {
      throw new AppError('请先使用访问密钥登录，或通过邀请码进入聊天室后再检索题库', 401, 401);
    }

    const chatService = require('../services/chatService');
    const room = await chatService.findByInviteCode(code);
    req.auth = null;
    req.inviteRoom = room;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { requireAuth, requireAdmin, optionalAuth, requireQuestionAccess, extractToken };
