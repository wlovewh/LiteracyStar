'use strict';
const logger = require('../utils/logger');
const { AppError } = require('../utils/response');

/** 404 */
function notFound(req, res, next) {
  next(new AppError('接口不存在: ' + req.method + ' ' + req.originalUrl, 404, 404));
}

/** 统一错误处理 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err instanceof AppError) {
    return res.status(err.httpStatus).json({ code: err.code, message: err.message });
  }
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ code: 1, message: '文件过大，请上传 5MB 以内的文件' });
  }
  logger.error('未处理异常: ' + (err && err.stack ? err.stack : err));
  return res.status(500).json({ code: 1, message: '服务器内部错误' });
}

module.exports = { notFound, errorHandler };
