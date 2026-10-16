'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const service = require('../services/resourceService');
const { ok, asyncHandler, AppError } = require('../utils/response');

/** 图标上传目录：backend/uploads/icons */
const ICON_DIR = path.resolve(__dirname, '..', '..', 'uploads', 'icons');
const EXT_BY_MIME = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/x-icon': '.ico',
  'image/vnd.microsoft.icon': '.ico'
};

// 分类
exports.listCategories = asyncHandler(async (req, res) => {
  const onlyEnabled = req.query.all !== '1' || req.auth?.role !== 'admin';
  return ok(res, await service.listCategories({ withSites: req.query.withSites === '1', onlyEnabled }));
});
exports.createCategory = asyncHandler(async (req, res) => ok(res, await service.createCategory(req.body || {}), '创建成功'));
exports.updateCategory = asyncHandler(async (req, res) => ok(res, await service.updateCategory(req.params.id, req.body || {}), '保存成功'));
exports.removeCategory = asyncHandler(async (req, res) => ok(res, await service.removeCategory(req.params.id), '删除成功'));
exports.reorderCategories = asyncHandler(async (req, res) => ok(res, await service.reorderCategories(req.body && req.body.ids), '排序已保存'));

// 网站
exports.listSites = asyncHandler(async (req, res) => {
  const onlyEnabled = req.query.all !== '1' || req.auth?.role !== 'admin';
  return ok(res, await service.listSites({ ...req.query, onlyEnabled }));
});
exports.createSite = asyncHandler(async (req, res) => ok(res, await service.createSite(req.body || {}), '创建成功'));
exports.updateSite = asyncHandler(async (req, res) => ok(res, await service.updateSite(req.params.id, req.body || {}), '保存成功'));
exports.removeSite = asyncHandler(async (req, res) => ok(res, await service.removeSite(req.params.id), '删除成功'));
exports.trackVisit = asyncHandler(async (req, res) => ok(res, await service.trackVisit(req.params.id)));

/** 批量导入模板（表头 + 示例行） */
exports.importTemplate = asyncHandler(async (req, res) =>
  ok(res, {
    headers: service.SITE_IMPORT_HEADERS,
    sample: [
      ['学术信息资源', '中国知网', 'https://www.cnki.net', '中文学术文献数据库', '', 1, '开启'],
      ['学术信息资源', '万方数据', 'https://www.wanfangdata.com.cn', '期刊与学位论文', '', 2, '开启']
    ]
  })
);

/**
 * 批量导入资源网站。
 * 支持 multipart 文件（CSV / XLSX / XLS）或直接提交 rows 数组。
 */
exports.importSites = asyncHandler(async (req, res) => {
  let rows = [];

  if (req.file) {
    rows = parseSheet(req.file.buffer, req.file.originalname || '');
  } else if (req.body && Array.isArray(req.body.rows)) {
    rows = req.body.rows;
  } else {
    throw new AppError('请上传 CSV/Excel 文件或提供 rows 数组');
  }

  return ok(res, await service.importSites(rows), '导入完成');
});

/** 下载导入模板（xlsx），与题库导入保持一致的体验 */
exports.downloadTemplate = asyncHandler(async (req, res) => {
  const XLSX = require('xlsx');
  const tpl = {
    headers: service.SITE_IMPORT_HEADERS,
    sample: [
      ['学术信息资源', '中国知网', 'https://www.cnki.net', '中文学术文献数据库', '', 1, '开启'],
      ['学术信息资源', '万方数据', 'https://www.wanfangdata.com.cn', '期刊与学位论文', '', 2, '开启']
    ]
  };
  const aoa = [tpl.headers, ...tpl.sample];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '资源导入模板');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="resource-import-template.xlsx"');
  return res.send(buf);
});

/** CSV / XLSX -> 行对象（按表头名映射） */
function parseSheet(buffer, filename) {
  const XLSX = require('xlsx');
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
  if (matrix.length < 2) return [];
  const header = matrix[0].map((h) => String(h === undefined || h === null ? '' : h).trim());
  return matrix.slice(1).map((cells) => {
    const row = {};
    header.forEach((h, i) => {
      const v = cells[i];
      row[h] = v === undefined || v === null ? '' : String(v).trim();
    });
    return row;
  });
}

/**
 * 上传网站图标 (project.md 追加文档 8.1 资源管理)
 * 接收 multipart 字段 icon，存入 uploads/icons，返回可访问 URL。
 * 若同时带 siteId，则一并写回该网站记录。
 */
exports.uploadIcon = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError('请选择要上传的图标文件');

  const ext = EXT_BY_MIME[req.file.mimetype];
  if (!ext) throw new AppError('仅支持 PNG / JPG / GIF / WEBP / SVG / ICO 格式');

  fs.mkdirSync(ICON_DIR, { recursive: true });
  const filename = crypto.randomBytes(8).toString('hex') + ext;
  fs.writeFileSync(path.join(ICON_DIR, filename), req.file.buffer);

  const url = '/platform-api/uploads/icons/' + filename;

  // 可选：直接绑定到某个网站
  if (req.body && req.body.siteId) {
    await service.updateSite(req.body.siteId, { iconUrl: url });
  }

  return ok(res, { iconUrl: url, filename }, '图标上传成功');
});

/** 删除图标文件（仅限 uploads/icons 目录内） */
exports.removeIcon = asyncHandler(async (req, res) => {
  const name = path.basename(String(req.body && req.body.filename ? req.body.filename : req.params.filename || ''));
  if (!name) throw new AppError('缺少文件名');

  const target = path.join(ICON_DIR, name);
  // 防止路径穿越
  if (!target.startsWith(ICON_DIR)) throw new AppError('非法的文件名');

  if (fs.existsSync(target)) fs.unlinkSync(target);
  return ok(res, { filename: name }, '已删除');
});
