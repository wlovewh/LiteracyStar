'use strict';
/** 统一响应体: 成功 { code:0, message:'ok', data }，失败 { code:<非0>, message } */

class AppError extends Error {
  constructor(message, code = 1, httpStatus = 400) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function ok(res, data = null, message = 'ok') {
  return res.json({ code: 0, message, data });
}

function fail(res, message = '请求失败', code = 1, httpStatus = 400) {
  return res.status(httpStatus).json({ code, message });
}

/** 包装异步路由，异常统一交给错误中间件 */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = { ok, fail, AppError, asyncHandler };
