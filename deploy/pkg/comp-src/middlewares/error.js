'use strict';
const logger = require('../utils/logger');
const { AppError } = require('../utils/response');

/** 404 */
function notFound(req, res) {
  res.status(404).json({ code: 404, message: '接口不存在: ' + req.method + ' ' + req.originalUrl });
}

/** 全局错误处理，统一响应体 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.httpStatus).json({ code: err.code, message: err.message });
  }
  // MySQL 唯一键冲突
  if (err && err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ code: 409, message: '数据重复：' + (err.sqlMessage || err.message) });
  }
  // multer 文件体积限制
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ code: 413, message: '上传文件过大，请控制在 10MB 以内' });
  }
  logger.error('未处理异常:', err && err.stack ? err.stack : err);
  return res.status(500).json({ code: 500, message: '服务器内部错误' });
}

module.exports = { notFound, errorHandler };
