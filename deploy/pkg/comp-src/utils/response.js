'use strict';

/**
 * 统一响应体
 *   成功: { code: 0, message: 'ok', data: ... }
 *   失败: { code: <非0>, message: '...' }
 */
function ok(res, data = null, message = 'ok') {
  return res.json({ code: 0, message, data });
}

function fail(res, message = '请求失败', httpStatus = 400, code = 1) {
  return res.status(httpStatus).json({ code, message });
}

/** 业务异常，被全局错误中间件捕获并转成统一响应 */
class AppError extends Error {
  constructor(message, httpStatus = 400, code = 1) {
    super(message);
    this.name = 'AppError';
    this.httpStatus = httpStatus;
    this.code = code;
  }
}

/** 包装 async 控制器，异常自动转交 next() */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { ok, fail, AppError, asyncHandler };
