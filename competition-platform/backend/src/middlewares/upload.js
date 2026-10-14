'use strict';
const multer = require('multer');

/** 内存存储：文件直接进入 buffer，由 xlsx 解析，不落盘 */
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const name = String(file.originalname || '').toLowerCase();
    const allowed = ['.xlsx', '.xls', '.csv', '.txt'];
    if (allowed.some((ext) => name.endsWith(ext))) return cb(null, true);
    return cb(new Error('仅支持 .xlsx / .xls / .csv 文件'));
  }
});

module.exports = { upload, single: upload.single('file') };
