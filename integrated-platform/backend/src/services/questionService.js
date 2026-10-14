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

module.exports = {
  search, facets, extractKeywords, checkDuplicate, exportCsv, similarity,
  isSearchEnabled, setSearchEnabled, trackSearch, getSearchCount, normalizeOptions, optionsFromRow, QUESTION_TYPE_LABEL
};