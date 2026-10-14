'use strict';
const db = require('../config/db');
const config = require('../config');
const { AppError } = require('../utils/response');

/**
 * 题库检索 (project.md 追加文档 6)
 * 与模拟竞赛平台共用 questions 表，通过跨库查询实现双向同步。
 */

const QUESTION_TYPE_LABEL = { 1: '单选', 2: '多选', 3: '判断' };

/** 检索开关（管理员可控制无密钥用户是否可用） */
async function isSearchEnabled() {
  const row = await db.queryOne("SELECT value FROM platform_settings WHERE \`key\` = 'question_search_enabled'");
  return !row || String(row.value) !== '0';
}

async function setSearchEnabled(enabled) {
  await db.execute(
    "INSERT INTO platform_settings (\`key\`, value) VALUES ('question_search_enabled', ?) " +
    'ON DUPLICATE KEY UPDATE value = VALUES(value)',
    [enabled ? '1' : '0']
  );
  return { enabled: !!enabled };
}

/** 组装检索条件 */
function buildWhere({ id, exactContent, keyword, module, type, difficulty, source, tag }) {
  const where = [];
  const params = [];

  if (id) { where.push('q.id = ?'); params.push(Number(id)); }
  if (exactContent) { where.push('q.content = ?'); params.push(String(exactContent)); }
  if (keyword) { where.push('q.content LIKE ?'); params.push('%' + String(keyword) + '%'); }
  if (module) { where.push('q.module = ?'); params.push(String(module)); }
  if (type) { where.push('q.type = ?'); params.push(Number(type)); }
  if (difficulty) { where.push('q.difficulty = ?'); params.push(Number(difficulty)); }
  if (source) { where.push('q.source = ?'); params.push(String(source)); }
  if (tag) { where.push('q.tags LIKE ?'); params.push('%' + String(tag) + '%'); }

  return { clause: where.length ? ' WHERE ' + where.join(' AND ') : '', params };
}

/** 分页检索题目（含选项与答案，供检索页展示） */
async function search(query = {}) {
  const { clause, params } = buildWhere(query);
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.max(1, Math.min(100, Number(query.pageSize) || 20));
  const offset = (page - 1) * pageSize;

  const totalRow = await db.queryCompetition('SELECT COUNT(*) AS c FROM questions q' + clause, params);
  const rows = await db.queryCompetition(
    'SELECT q.id, q.type, q.content, q.option_a, q.option_b, q.option_c, q.option_d, q.option_e, q.option_f, ' +
    '       q.answer, q.analysis, q.module, q.difficulty, q.source, q.tags, q.created_at ' +
    'FROM questions q' + clause + ' ORDER BY q.id DESC LIMIT ' + pageSize + ' OFFSET ' + offset,
    params
  );

  const list = rows.map((r) => ({
    id: r.id,
    type: r.type,
    typeLabel: QUESTION_TYPE_LABEL[r.type] || '未知',
    content: r.content,
    options: optionsFromRow(r),
    answer: r.answer,
    analysis: r.analysis || '',
    module: r.module || '',
    difficulty: r.difficulty,
    source: r.source || '',
    tags: r.tags || ''
  }));

  return { list, total: totalRow ? Number(totalRow[0].c) : 0, page, pageSize };
}

/**
 * 把数据库行转为 [{letter,text}]。
 * 共用表的选项以 option_a ~ option_f 六个列存储，空列表示该项不存在。
 */
function optionsFromRow(row) {
  const out = [];
  for (const letter of ['A', 'B', 'C', 'D', 'E', 'F']) {
    const v = row['option_' + letter.toLowerCase()];
    if (v !== null && v !== undefined && String(v) !== '') {
      out.push({ letter, text: String(v) });
    }
  }
  return out;
}

/** 兼容入口：接受行对象或纯选项对象 */
function normalizeOptions(raw) {
  if (raw && typeof raw === 'object' && ('option_a' in raw || 'option_b' in raw)) {
    return optionsFromRow(raw);
  }
  let obj = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(obj); } catch (_) { return []; }
  }
  if (!obj || typeof obj !== 'object') return [];
  return Object.keys(obj).sort().map((k) => ({ letter: k, text: String(obj[k]) }));
}

/** 检索筛选项（模块/题型/难度/来源的可选值） */
async function facets() {
  const rows = await db.queryCompetition(
    'SELECT DISTINCT module FROM questions q WHERE q.module IS NOT NULL AND q.module <> "" ORDER BY module'
  );
  const sources = await db.queryCompetition(
    'SELECT DISTINCT source FROM questions q WHERE q.source IS NOT NULL AND q.source <> "" ORDER BY source'
  );
  return {
    modules: rows.map((r) => r.module),
    sources: sources.map((r) => r.source),
    types: Object.keys(QUESTION_TYPE_LABEL).map((k) => ({ value: Number(k), label: QUESTION_TYPE_LABEL[k] })),
    difficulties: [1, 2, 3, 4, 5]
  };
}

/**
 * 从题干提取检索关键词 (project.md 追加文档 7.5)
 * 规则：连续中文片段，长度 > 4，去重后取前 3 个。
 */
function extractKeywords(content) {
  const text = String(content || '');
  const segments = text.match(/[\u4e00-\u9fa5]{5,}/g) || [];
  const seen = new Set();
  const out = [];
  for (const seg of segments) {
    // 长片段进一步切分为长度合适的候选词
    const candidates = seg.length > 12 ? [seg.slice(0, 8), seg.slice(-8)] : [seg];
    for (const c of candidates) {
      if (c.length <= config.question.keywordMinLength) continue;
      if (seen.has(c)) continue;
      seen.add(c);
      out.push(c);
      if (out.length >= config.question.keywordMaxCount) return out;
    }
  }
  return out;
}

/** 中文分词用的二元组，用于相似度计算 */
function bigrams(text) {
  const s = String(text || '').replace(/\s+/g, '');
  const set = new Set();
  for (let i = 0; i < s.length - 1; i += 1) set.add(s.slice(i, i + 2));
  return set;
}

/** Jaccard 相似度 */
function similarity(a, b) {
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter += 1;
  return inter / (A.size + B.size - inter);
}

/**
 * 题目去重检查 (project.md 追加文档 7.8)
 * 在指定聊天室历史消息中查找相似度 > 80% 的题目。
 */
async function checkDuplicate(roomId, content) {
  const rows = await db.query(
    "SELECT id, content, extra FROM chat_messages WHERE room_id = ? AND message_type = 'question' ORDER BY id DESC LIMIT 200",
    [roomId]
  );
  const threshold = config.question.duplicateSimilarity;
  for (const r of rows) {
    let text = r.content || '';
    try {
      const extra = typeof r.extra === 'string' ? JSON.parse(r.extra) : r.extra;
      if (extra && extra.content) text = extra.content;
    } catch (_) { /* 忽略解析失败 */ }
    const score = similarity(content, text);
    if (score > threshold) {
      return { duplicate: true, similarity: Number(score.toFixed(3)), messageId: r.id, previousContent: text };
    }
  }
  return { duplicate: false, similarity: 0 };
}

/** 导出检索结果为 CSV 文本 */
async function exportCsv(query = {}) {
  const { clause, params } = buildWhere(query);
  const rows = await db.queryCompetition(
    'SELECT q.id, q.type, q.content, q.option_a, q.option_b, q.option_c, q.option_d, q.option_e, q.option_f, ' +
    '       q.answer, q.analysis, q.module, q.difficulty, q.source ' +
    'FROM questions q' + clause + ' ORDER BY q.id DESC LIMIT 5000',
    params
  );

  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };

  const header = ['ID', '题型', '题干', '选项', '正确答案', '解析', '知识模块', '难度', '来源'];
  const lines = [header.join(',')];
  for (const r of rows) {
    const opts = optionsFromRow(r).map((o) => o.letter + '.' + o.text).join(' | ');
    lines.push([
      r.id,
      QUESTION_TYPE_LABEL[r.type] || '',
      r.content,
      opts,
      r.answer,
      r.analysis || '',
      r.module || '',
      r.difficulty,
      r.source || ''
    ].map(esc).join(','));
  }
  // 加 BOM 保证 Excel 正确识别 UTF-8
  return '\ufeff' + lines.join('\r\n');
}

/** 记录检索次数（数据统计用） */
async function trackSearch() {
  await db.execute(
    "INSERT INTO platform_settings (\`key\`, value) VALUES ('question_search_count', '1') " +
    'ON DUPLICATE KEY UPDATE value = CAST(CAST(value AS UNSIGNED) + 1 AS CHAR)'
  );
}

async function getSearchCount() {
  const row = await db.queryOne("SELECT value FROM platform_settings WHERE \`key\` = 'question_search_count'");
  return row ? Number(row.value) : 0;
}


// ==================== 题库管理（管理端，8.1） ====================
// 与模拟竞赛平台共用 questions 表，写操作通过跨库限定名执行，双方即时同步。

/** 把 [{letter,text}] 或 {A:'..'} 转为 option_a..option_f 六个列 */
function optionsToColumns(options) {
  const cols = { option_a: null, option_b: null, option_c: null, option_d: null, option_e: null, option_f: null };
  if (!options) return cols;

  let obj = options;
  if (Array.isArray(options)) {
    obj = {};
    options.forEach((o) => {
      const letter = String(o.letter || '').toUpperCase();
      if (/^[A-F]$/.test(letter)) obj[letter] = o.text;
    });
  }
  for (const letter of ['A', 'B', 'C', 'D', 'E', 'F']) {
    const v = obj[letter] !== undefined ? obj[letter] : obj[letter.toLowerCase()];
    cols['option_' + letter.toLowerCase()] = v === undefined || v === null || String(v) === '' ? null : String(v);
  }
  return cols;
}

/** 归一化可选文本字段，避免 undefined 进入 SQL 绑定参数 */
function orNull(v) {
  if (v === undefined || v === null) return null;
  const s = String(v);
  return s === '' ? null : s;
}

/** 校验题目入参 */
function validateQuestion(payload, { partial = false } = {}) {
  const out = {};

  if (!partial || payload.type !== undefined) {
    const type = Number(payload.type);
    if (![1, 2, 3].includes(type)) throw new AppError('题型必须是 1(单选) / 2(多选) / 3(判断)');
    out.type = type;
  }
  if (!partial || payload.content !== undefined) {
    const content = String(payload.content || '').trim();
    if (!content) throw new AppError('题干不能为空');
    out.content = content;
  }
  if (!partial || payload.answer !== undefined) {
    const answer = String(payload.answer || '').trim().toUpperCase();
    if (!answer) throw new AppError('正确答案不能为空');
    if (!/^[A-F]+$/.test(answer)) throw new AppError('正确答案只能是 A-F 的字母组合');
    out.answer = answer;
  }
  if (payload.difficulty !== undefined && payload.difficulty !== null && payload.difficulty !== '') {
    const d = Number(payload.difficulty);
    if (!Number.isInteger(d) || d < 1 || d > 5) throw new AppError('难度需为 1-5 的整数');
    out.difficulty = d;
  }
  return out;
}

/** 单题详情（含选项与答案，供编辑回显） */
async function detailQuestion(id) {
  const rows = await db.queryCompetition(
    'SELECT q.id, q.type, q.content, q.option_a, q.option_b, q.option_c, q.option_d, q.option_e, q.option_f, ' +
    '       q.answer, q.analysis, q.module, q.difficulty, q.source, q.tags, q.created_at ' +
    'FROM questions q WHERE q.id = ? LIMIT 1',
    [id]
  );
  if (!rows.length) throw new AppError('题目不存在', 404, 404);
  const r = rows[0];
  return {
    id: r.id,
    type: r.type,
    typeLabel: QUESTION_TYPE_LABEL[r.type] || '未知',
    content: r.content,
    options: optionsFromRow(r),
    answer: r.answer,
    analysis: r.analysis || '',
    module: r.module || '',
    difficulty: r.difficulty,
    source: r.source || '',
    tags: r.tags || ''
  };
}

/** 新增题目 */
async function createQuestion(payload = {}) {
  const base = validateQuestion(payload);
  const cols = optionsToColumns(payload.options);

  const dup = await db.queryCompetition('SELECT id FROM questions q WHERE q.content = ? LIMIT 1', [base.content]);
  if (dup.length) throw new AppError('已存在相同题干的题目（#' + dup[0].id + '）');

  const res = await db.executeCompetition(
    'INSERT INTO ' + config.competitionDb + '.questions ' +
    '(type, content, option_a, option_b, option_c, option_d, option_e, option_f, answer, analysis, module, difficulty, source, tags) ' +
    'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [
      base.type, base.content,
      cols.option_a, cols.option_b, cols.option_c, cols.option_d, cols.option_e, cols.option_f,
      base.answer,
      orNull(payload.analysis),
      orNull(payload.module),
      base.difficulty !== undefined ? base.difficulty : 3,
      orNull(payload.source),
      orNull(payload.tags)
    ]
  );
  return detailQuestion(res.insertId);
}

/** 更新题目 */
async function updateQuestion(id, payload = {}) {
  const existing = await detailQuestion(id);
  const base = validateQuestion(payload, { partial: true });
  const cols = optionsToColumns(payload.options !== undefined ? payload.options : existing.options);

  if (base.content && base.content !== existing.content) {
    const dup = await db.queryCompetition('SELECT id FROM questions q WHERE q.content = ? AND q.id <> ? LIMIT 1', [base.content, id]);
    if (dup.length) throw new AppError('已存在相同题干的题目（#' + dup[0].id + '）');
  }

  await db.executeCompetition(
    'UPDATE ' + config.competitionDb + '.questions SET ' +
    'type = ?, content = ?, option_a = ?, option_b = ?, option_c = ?, option_d = ?, option_e = ?, option_f = ?, ' +
    'answer = ?, analysis = ?, module = ?, difficulty = ?, source = ?, tags = ? WHERE id = ?',
    [
      base.type !== undefined ? base.type : existing.type,
      base.content !== undefined ? base.content : existing.content,
      cols.option_a, cols.option_b, cols.option_c, cols.option_d, cols.option_e, cols.option_f,
      base.answer !== undefined ? base.answer : existing.answer,
      orNull(payload.analysis !== undefined ? payload.analysis : existing.analysis),
      orNull(payload.module !== undefined ? payload.module : existing.module),
      base.difficulty !== undefined ? base.difficulty : existing.difficulty,
      orNull(payload.source !== undefined ? payload.source : existing.source),
      orNull(payload.tags !== undefined ? payload.tags : existing.tags),
      id
    ]
  );
  return detailQuestion(id);
}

/** 删除题目 */
async function removeQuestion(id) {
  const existing = await detailQuestion(id);
  await db.executeCompetition('DELETE FROM ' + config.competitionDb + '.questions WHERE id = ?', [id]);
  return { id: Number(existing.id) };
}

/** 批量删除 */
async function removeQuestions(ids = []) {
  const list = ids.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!list.length) throw new AppError('请选择要删除的题目');
  const res = await db.executeCompetition(
    'DELETE FROM ' + config.competitionDb + '.questions WHERE id IN (' + list.map(() => '?').join(',') + ')',
    list
  );
  return { deleted: res.affectedRows || 0 };
}

/**
 * 批量导入 (8.1 题库管理)
 * rows: [{ type, content, options, answer, analysis, module, difficulty, source, tags }]
 * 逐行校验，返回成功/失败明细，不因单行失败中断整批。
 */
async function importQuestions(rows = [], { skipDuplicate = true } = {}) {
  if (!Array.isArray(rows) || !rows.length) throw new AppError('导入内容为空');

  const result = { total: rows.length, inserted: 0, skipped: 0, failed: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const lineNo = i + 2; // 含表头
    try {
      const base = validateQuestion(row);
      const cols = optionsToColumns(row.options);

      if (skipDuplicate) {
        const dup = await db.queryCompetition('SELECT id FROM questions q WHERE q.content = ? LIMIT 1', [base.content]);
        if (dup.length) {
          result.skipped += 1;
          continue;
        }
      }

      await db.executeCompetition(
        'INSERT INTO ' + config.competitionDb + '.questions ' +
        '(type, content, option_a, option_b, option_c, option_d, option_e, option_f, answer, analysis, module, difficulty, source, tags) ' +
        'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [
          base.type, base.content,
          cols.option_a, cols.option_b, cols.option_c, cols.option_d, cols.option_e, cols.option_f,
          base.answer,
          orNull(row.analysis),
          orNull(row.module),
          base.difficulty !== undefined ? base.difficulty : 3,
          orNull(row.source),
          orNull(row.tags)
        ]
      );
      result.inserted += 1;
    } catch (err) {
      result.failed += 1;
      if (result.errors.length < 20) result.errors.push({ line: lineNo, message: err.message });
    }
  }
  return result;
}

/** 导入模板表头与示例行 */
function importTemplate() {
  return {
    headers: ['题型', '题干', '选项A', '选项B', '选项C', '选项D', '选项E', '选项F', '正确答案', '解析', '知识模块', '难度', '来源', '标签'],
    sample: [
      [1, '人工智能领域中，GPT 中的 G 代表？', 'Generative', 'General', 'Global', 'Graph', '', '', 'A', 'GPT 全称 Generative Pre-trained Transformer。', '人工智能', 2, '示例题库', 'AI'],
      [3, '信息素养只需要掌握检索技能即可。', '', '', '', '', '', '', 'B', '信息素养包含信息意识、知识、能力与伦理。', '信息素养基础', 1, '示例题库', '判断题']
    ]
  };
}

module.exports = {
  search, facets, extractKeywords, checkDuplicate, exportCsv, similarity,
  detailQuestion, createQuestion, updateQuestion, removeQuestion, removeQuestions,
  importQuestions, importTemplate, optionsToColumns,
  isSearchEnabled, setSearchEnabled, trackSearch, getSearchCount, normalizeOptions, optionsFromRow, QUESTION_TYPE_LABEL
};