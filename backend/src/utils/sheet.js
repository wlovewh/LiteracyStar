'use strict';
const XLSX = require('xlsx');
const { AppError } = require('./response');

/**
 * 将上传的 Excel(.xlsx/.xls) 或 CSV 文件缓冲区解析为对象数组。
 * 第一行作为表头，返回 [{ 表头: 值, ... }, ...]
 */
function parseBuffer(buffer, originalName = '') {
  const ext = String(originalName).toLowerCase().split('.').pop();

  let workbook;
  try {
    if (ext === 'csv' || ext === 'txt') {
      // CSV 可能是 GBK 编码（Excel 中文导出常见），先尝试 UTF-8 再回退
      let text = buffer.toString('utf8');
      if (text.includes('\uFFFD')) {
        try {
          const iconv = require('iconv-lite');
          text = iconv.decode(buffer, 'gbk');
        } catch (_) {
          /* 未安装 iconv-lite 时保留 utf8 结果 */
        }
      }
      workbook = XLSX.read(text, { type: 'string', raw: false });
    } else {
      workbook = XLSX.read(buffer, { type: 'buffer', raw: false });
    }
  } catch (err) {
    throw new AppError('文件解析失败：' + err.message);
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new AppError('文件中没有可读取的工作表');

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: false });
  if (!rows.length) throw new AppError('文件中没有数据行');

  // 去除表头首尾空白，避免空格导致取不到值
  return rows.map((row) => {
    const out = {};
    Object.keys(row).forEach((k) => {
      out[String(k).trim()] = typeof row[k] === 'string' ? row[k].trim() : row[k];
    });
    return out;
  });
}

/** 生成 Excel 缓冲区，用于导出 */
function buildWorkbook(rows, sheetName = 'Sheet1') {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/** 导入模板表头 (project.md 5.3 / 6.3) */
const QUESTION_TEMPLATE_HEADERS = ['题型', '题干', '选项A', '选项B', '选项C', '选项D', '选项E', '选项F', '正确答案', '解析', '知识模块', '难度', '来源', '标签'];
const TEAM_TEMPLATE_HEADERS = ['*队伍名称', '*队长姓名', '*队长学号', '*队长联系电话', '队员1姓名', '队员1学号', '队员2姓名', '队员2学号'];

function buildTemplate(headers, sample, sheetName) {
  return buildWorkbook(sample, sheetName);
}

module.exports = { parseBuffer, buildWorkbook, buildTemplate, QUESTION_TEMPLATE_HEADERS, TEAM_TEMPLATE_HEADERS };
