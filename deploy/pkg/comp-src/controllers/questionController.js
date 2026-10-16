'use strict';
const service = require('../services/questionService');
const { parseBuffer, buildWorkbook, QUESTION_TEMPLATE_HEADERS } = require('../utils/sheet');
const { ok, asyncHandler, AppError } = require('../utils/response');

exports.list = asyncHandler(async (req, res) => ok(res, await service.list(req.query)));
exports.facets = asyncHandler(async (req, res) => ok(res, await service.facets()));
exports.get = asyncHandler(async (req, res) => ok(res, await service.getById(req.params.id)));
exports.create = asyncHandler(async (req, res) => ok(res, await service.create(req.body || {}), '创建成功'));
exports.update = asyncHandler(async (req, res) => ok(res, await service.update(req.params.id, req.body || {}), '保存成功'));
exports.remove = asyncHandler(async (req, res) => ok(res, await service.remove(req.params.id), '删除成功'));
exports.removeMany = asyncHandler(async (req, res) => ok(res, await service.removeMany(req.body.ids), '删除完成'));

/** POST /api/questions/import  上传 Excel/CSV */
exports.import = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError('请选择要导入的文件');
  const rows = parseBuffer(req.file.buffer, req.file.originalname);
  const result = await service.importRows(rows);
  return ok(res, result, '导入完成');
});

/** GET /api/questions/import/template  下载导入模板 */
exports.template = asyncHandler(async (req, res) => {
  const sample = [{
    题型: '单选', 题干: '示例：信息素养的核心能力不包括以下哪一项？',
    选项A: '信息意识', 选项B: '信息能力', 选项C: '信息伦理', 选项D: '信息垄断',
    选项E: '', 选项F: '', 正确答案: 'D', 解析: '信息素养包含信息意识、信息能力、信息伦理。',
    知识模块: '信息素养基础', 难度: 1, 来源: '示例题库', 标签: '概念'
  }];
  const buf = buildWorkbook(sample, '题目导入模板');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="question-import-template.xlsx"');
  return res.send(buf);
});

/** GET /api/questions/export  导出为 Excel */
exports.exportExcel = asyncHandler(async (req, res) => {
  const rows = await service.exportRows(req.query);
  const buf = buildWorkbook(rows.length ? rows : [{ 题型: '', 题干: '' }], '题库');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="questions.xlsx"');
  return res.send(buf);
});

exports.headers = QUESTION_TEMPLATE_HEADERS;
