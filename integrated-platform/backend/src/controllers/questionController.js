'use strict';
const service = require('../services/questionService');
const { ok, asyncHandler, AppError } = require('../utils/response');

// 准入由 requireQuestionAccess 中间件负责（密钥登录用户，或持有效邀请码的访客）。
exports.search = asyncHandler(async (req, res) => {
  await service.trackSearch();
  return ok(res, await service.search(req.query));
});

exports.facets = asyncHandler(async (req, res) => ok(res, await service.facets()));

exports.detail = asyncHandler(async (req, res) => {
  const result = await service.search({ id: req.params.id, pageSize: 1 });
  if (!result.list.length) throw new AppError('题目不存在', 404, 404);
  return ok(res, result.list[0]);
});

exports.extractKeywords = asyncHandler(async (req, res) => {
  const content = (req.body && req.body.content) || req.query.content || '';
  return ok(res, { keywords: service.extractKeywords(content) });
});

exports.checkDuplicate = asyncHandler(async (req, res) => {
  const { roomId, content } = req.body || {};
  if (!roomId || !content) throw new AppError('缺少 roomId 或 content');
  return ok(res, await service.checkDuplicate(roomId, content));
});

exports.exportCsv = asyncHandler(async (req, res) => {
  const csv = await service.exportCsv(req.query);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="questions-export.csv"');
  return res.send(csv);
});

// ==================== 题库管理（管理端，8.1） ====================
exports.create = asyncHandler(async (req, res) => ok(res, await service.createQuestion(req.body || {}), '创建成功'));
exports.update = asyncHandler(async (req, res) => ok(res, await service.updateQuestion(req.params.id, req.body || {}), '保存成功'));
exports.remove = asyncHandler(async (req, res) => ok(res, await service.removeQuestion(req.params.id), '删除成功'));
exports.batchRemove = asyncHandler(async (req, res) =>
  ok(res, await service.removeQuestions((req.body && req.body.ids) || []), '批量删除完成'));

exports.template = asyncHandler(async (req, res) => ok(res, service.importTemplate()));

/** 批量导入：接收 JSON 行数组或 multipart CSV/XLSX 文件 */
exports.importQuestions = asyncHandler(async (req, res) => {
  let rows = [];

  if (req.file) {
    rows = parseSheet(req.file.buffer, req.file.originalname || '');
  } else if (req.body && Array.isArray(req.body.rows)) {
    rows = req.body.rows;
  } else if (req.body && typeof req.body.csv === 'string') {
    rows = parseCsv(req.body.csv);
  } else {
    throw new AppError('请上传 CSV/Excel 文件或提供 rows 数组');
  }

  const skipDuplicate = !(req.body && (req.body.skipDuplicate === '0' || req.body.skipDuplicate === false));
  return ok(res, await service.importQuestions(rows, { skipDuplicate }), '导入完成');
});

/** CSV 文本 -> 行对象（支持引号包裹） */
function parseCsv(text) {
  const lines = String(text).replace(/^\ufeff/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) return [];

  const split = (line) => {
    const out = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (inQuote) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i += 1; } else inQuote = false;
        } else cur += ch;
      } else if (ch === '"') inQuote = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };

  const header = split(lines[0]);
  return lines.slice(1).map((line) => rowFromCells(header, split(line)));
}

/** XLSX 文件 -> 行对象 */
function parseSheet(buffer, filename) {
  const XLSX = require('xlsx');
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
  if (matrix.length < 2) return [];
  const header = matrix[0].map((h) => String(h === undefined || h === null ? '' : h).trim());
  return matrix.slice(1).map((cells) => rowFromCells(header, cells.map((c) => (c === undefined || c === null ? '' : String(c).trim()))));
}

/** 按表头名映射为标准行对象（兼容中英文表头） */
function rowFromCells(header, cells) {
  const get = (...names) => {
    for (const n of names) {
      const idx = header.findIndex((h) => h === n || h.replace(/\s/g, '') === n);
      if (idx >= 0 && cells[idx] !== undefined) return cells[idx];
    }
    return '';
  };

  const typeRaw = String(get('题型', 'type') || '').trim();
  const typeMap = { 单选: 1, 多选: 2, 判断: 3 };
  const type = typeMap[typeRaw] || Number(typeRaw) || 1;

  const options = [];
  ['A', 'B', 'C', 'D', 'E', 'F'].forEach((letter) => {
    const text = get('选项' + letter, 'option_' + letter.toLowerCase(), letter);
    if (text) options.push({ letter, text: String(text) });
  });

  const difficulty = Number(get('难度', 'difficulty')) || 3;

  return {
    type,
    content: String(get('题干', 'content') || ''),
    options,
    answer: String(get('正确答案', '答案', 'answer') || '').toUpperCase(),
    analysis: String(get('解析', 'analysis') || ''),
    module: String(get('知识模块', '模块', 'module') || ''),
    difficulty,
    source: String(get('来源', 'source') || ''),
    tags: String(get('标签', 'tags') || '')
  };
}

exports.getSettings = asyncHandler(async (req, res) => ok(res, { searchEnabled: await service.isSearchEnabled() }));
exports.setSettings = asyncHandler(async (req, res) => {
  const enabled = !!(req.body && req.body.searchEnabled);
  return ok(res, await service.setSearchEnabled(enabled), '设置已保存');
});
