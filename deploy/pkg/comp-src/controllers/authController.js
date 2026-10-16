'use strict';
const authService = require('../services/authService');
const { ok, asyncHandler } = require('../utils/response');

exports.adminLogin = asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};
  const result = await authService.adminLogin(username, password);
  return ok(res, result);
});

exports.studentLogin = asyncHandler(async (req, res) => {
  const { studentId, password } = req.body || {};
  const result = await authService.studentLogin(studentId, password);
  return ok(res, result);
});

/**
 * 返回当前登录者信息，用于前端刷新后恢复状态。
 * 结构必须与登录接口的 data.user 一致，否则前端刷新后身份会缺字段。
 */
exports.me = asyncHandler(async (req, res) => ok(res, { user: await authService.profileOf(req.user) }));
