'use strict';
const multer = require('multer');

// 图标等小文件走内存，避免占用磁盘
const memory = multer.memoryStorage();

const uploadImage = multer({
  storage: memory,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const ok = /^image\/(png|jpe?g|gif|svg\+xml|webp|x-icon|vnd\.microsoft\.icon)$/i.test(file.mimetype);
    cb(ok ? null : new Error('仅支持图片文件'), ok);
  }
});

const uploadSheet = multer({
  storage: memory,
  limits: { fileSize: 5 * 1024 * 1024 }
});

module.exports = {
  singleImage: uploadImage.single('icon'),
  singleSheet: uploadSheet.single('file')
};
