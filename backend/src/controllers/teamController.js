'use strict';
const service = require('../services/teamService');
const { parseBuffer, buildWorkbook, TEAM_TEMPLATE_HEADERS } = require('../utils/sheet');
const { ok, asyncHandler, AppError } = require('../utils/response');

exports.list = asyncHandler(async (req, res) => ok(res, await service.list(req.query)));
exports.get = asyncHandler(async (req, res) => ok(res, await service.getById(req.params.id)));
exports.create = asyncHandler(async (req, res) => ok(res, await service.create(req.body || {}), '创建成功'));
exports.update = asyncHandler(async (req, res) => ok(res, await service.update(req.params.id, req.body || {}), '保存成功'));
exports.remove = asyncHandler(async (req, res) => ok(res, await service.remove(req.params.id), '删除成功'));
exports.removeMany = asyncHandler(async (req, res) => ok(res, await service.removeMany(req.body.ids), '删除完成'));

// 清空答题数据，允许队伍重新作答（stageId 可选，缺省清空全部环节）
exports.clearAnswers = asyncHandler(async (req, res) => {
  const stageId = req.body?.stageId ?? req.query?.stageId ?? null;
  const result = await service.clearAnswerData(req.params.id, stageId);
  return ok(res, result, '答题数据已清空，该队伍可重新作答');
});

exports.import = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError('请选择要导入的文件');
  const rows = parseBuffer(req.file.buffer, req.file.originalname);
  const result = await service.importRows(rows);
  return ok(res, result, '导入完成');
});

exports.template = asyncHandler(async (req, res) => {
  const sample = [{
    '*队伍名称': '示例队', '*队长姓名': '张三', '*队长学号': '2026001', '*队长联系电话': '13800000000',
    '队员1姓名': '李四', '队员1学号': '2026002', '队员2姓名': '王五', '队员2学号': '2026003'
  }];
  const buf = buildWorkbook(sample, '队伍导入模板');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="team-import-template.xlsx"');
  return res.send(buf);
});

exports.exportExcel = asyncHandler(async (req, res) => {
  const rows = await service.exportRows(req.query);
  const buf = buildWorkbook(rows.length ? rows : [{ 队伍名称: '' }], '队伍');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="teams.xlsx"');
  return res.send(buf);
});

exports.headers = TEAM_TEMPLATE_HEADERS;
