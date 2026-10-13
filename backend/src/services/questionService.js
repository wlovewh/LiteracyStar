'use strict';
const db = require('../config/db');
const { AppError } = require('../utils/response');

const TYPE_LABEL = { 1: '单选', 2: '多选', 3: '判断' };
const LABEL_TYPE = { 单选: 1, 多选: 2, 判断: 3, 单选题: 1, 多选题: 2, 判断题: 3 };

const OPTION_KEYS = ['option_a', 'option_b', 'option_c', 'option_d', 'option_e', 'option_f'];
const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function trimOrNull(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/** 判断题自动生成"正确/错误"两个选项 (project.md 5.2) */
function applyJudgeOptions(payload) {
  if (Number(payload.type) === 3) {
    return Object.assign({}, payload, {
      option_a: payload.option_a || '正确',
      option_b: payload.option_b || '错误',
      option_c: null,
      option_d: null,
      option_e: null,
      option_f: null
    });
  }
  return payload;
}

/**
 * 单条题目校验 (project.md 5.3)
 * 返回 { valid, errors[] }
 */
function validateQuestion(payload) {
  const errors = [];
  const type = Number(payload.type);
  if (![1, 2, 3].includes(type)) errors.push('题型无效（应为 1=单选 2=多选 3=判断）');

  const content = trimOrNull(payload.content);
  if (!content) errors.push('题干不能为空');

  const answer = trimOrNull(payload.answer);
  if (!answer) {
    errors.push('正确答案不能为空');
  } else {
    const letters = String(answer).toUpperCase().replace(/[^A-F]/g, '').split('');
    if (!letters.length) errors.push('正确答案格式无效');
    // 答案与选项匹配校验
    const available = OPTION_LETTERS.filter((_, i) => trimOrNull(payload[OPTION_KEYS[i]]));
    const missing = letters.filter((l) => !available.includes(l));
    if (missing.length) errors.push('正确答案 ' + missing.join('') + ' 对应的选项为空');
    if (type === 1 && letters.length !== 1) errors.push('单选题答案只能有一个选项');
    if (type === 2 && letters.length < 2) errors.push('多选题答案至少包含两个选项');
    if (type === 3 && letters.length !== 1) errors.push('判断题答案只能有一个选项');
  }

  const difficulty = payload.difficulty === undefined || payload.difficulty === null || payload.difficulty === ''
    ? 3
    : Number(payload.difficulty);
  if (!Number.isFinite(difficulty) || difficulty < 1 || difficulty > 5) errors.push('难度应为 1-5');

  return { valid: errors.length === 0, errors };
}

function normalizeRow(payload) {
  const p = applyJudgeOptions(payload);
  return [
    Number(p.type),
    String(p.content).trim(),
    trimOrNull(p.option_a),
    trimOrNull(p.option_b),
    trimOrNull(p.option_c),
    trimOrNull(p.option_d),
    trimOrNull(p.option_e),
    trimOrNull(p.option_f),
    String(p.answer).toUpperCase().replace(/[^A-F]/g, ''),
    trimOrNull(p.analysis),
    trimOrNull(p.module),
    p.difficulty === undefined || p.difficulty === null || p.difficulty === '' ? 3 : Number(p.difficulty),
    trimOrNull(p.source),
    trimOrNull(p.tags)
  ];
}

const INSERT_SQL =
  'INSERT INTO questions (type, content, option_a, option_b, option_c, option_d, option_e, option_f, answer, analysis, module, difficulty, source, tags) ' +
  'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';

async function list(query = {}) {
  const where = [];
  const params = [];
  const { type, module, difficulty, source, keyword } = query;

  if (type) { where.push('type = ?'); params.push(Number(type)); }
  if (module) { where.push('module = ?'); params.push(module); }
  if (difficulty) { where.push('difficulty = ?'); params.push(Number(difficulty)); }
  if (source) { where.push('source = ?'); params.push(source); }
  if (keyword) {
    where.push('(content LIKE ? OR tags LIKE ?)');
    params.push('%' + keyword + '%', '%' + keyword + '%');
  }

  const whereSql = where.length ? ' WHERE ' + where.join(' AND ') : '';
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 20));

  const countRow = await db.queryOne('SELECT COUNT(*) AS total FROM questions' + whereSql, params);
  const rows = await db.query(
    'SELECT * FROM questions' + whereSql + ' ORDER BY id DESC LIMIT ' + pageSize + ' OFFSET ' + ((page - 1) * pageSize),
    params
  );

  return { list: rows, total: countRow ? Number(countRow.total) : 0, page, pageSize };
}

/** 筛选项候选值，供前端下拉使用 */
async function facets() {
  const [modules, sources] = await Promise.all([
    db.query('SELECT DISTINCT module FROM questions WHERE module IS NOT NULL AND module <> "" ORDER BY module'),
    db.query('SELECT DISTINCT source FROM questions WHERE source IS NOT NULL AND source <> "" ORDER BY source')
  ]);
  return {
    modules: modules.map((r) => r.module),
    sources: sources.map((r) => r.source),
    types: [{ value: 1, label: '单选' }, { value: 2, label: '多选' }, { value: 3, label: '判断' }],
    difficulties: [1, 2, 3, 4, 5]
  };
}

async function getById(id) {
  const row = await db.queryOne('SELECT * FROM questions WHERE id = ?', [id]);
  if (!row) throw new AppError('题目不存在', 404, 404);
  return row;
}

async function create(payload) {
  const normalized = applyJudgeOptions(payload);
  const { valid, errors } = validateQuestion(normalized);
  if (!valid) throw new AppError(errors.join('；'));
  const result = await db.execute(INSERT_SQL, normalizeRow(normalized));
  return getById(result.insertId);
}

async function update(id, payload) {
  const existing = await getById(id);
  const merged = applyJudgeOptions(Object.assign({}, existing, payload));
  const { valid, errors } = validateQuestion(merged);
  if (!valid) throw new AppError(errors.join('；'));

  const values = normalizeRow(merged);
  await db.execute(
    'UPDATE questions SET type=?, content=?, option_a=?, option_b=?, option_c=?, option_d=?, option_e=?, option_f=?, answer=?, analysis=?, module=?, difficulty=?, source=?, tags=? WHERE id = ?',
    values.concat([id])
  );
  return getById(id);
}

async function remove(id) {
  await getById(id);
  const used = await db.queryOne('SELECT COUNT(*) AS c FROM answers WHERE question_id = ?', [id]);
  if (used && Number(used.c) > 0) throw new AppError('该题目已被使用，无法删除', 409, 409);
  await db.execute('DELETE FROM stage_papers WHERE question_id = ?', [id]);
  await db.execute('DELETE FROM questions WHERE id = ?', [id]);
  return { id };
}

async function removeMany(ids) {
  if (!Array.isArray(ids) || !ids.length) throw new AppError('请选择要删除的题目');
  let deleted = 0;
  const skipped = [];
  for (const id of ids) {
    try {
      await remove(id);
      deleted += 1;
    } catch (err) {
      skipped.push({ id, reason: err.message });
    }
  }
  return { deleted, skipped };
}

/**
 * 批量导入 (project.md 5.3)
 * rows: 已解析为对象数组的 Excel/CSV 数据，键为中文表头
 * 返回 { success, failed, errors: [{ row, reason }] }
 */
async function importRows(rows) {
  const errors = [];
  const validRows = [];
  const seenContent = new Set();

  // 预取已有题干用于重复校验
  const existing = await db.query('SELECT content FROM questions');
  existing.forEach((r) => seenContent.add(String(r.content).trim()));

  for (let i = 0; i < rows.length; i += 1) {
    const raw = rows[i];
    const rowNo = i + 2; // 表头占第 1 行

    const typeLabel = trimOrNull(raw['题型']);
    const type = LABEL_TYPE[typeLabel];
    if (!type) {
      errors.push({ row: rowNo, reason: '题型无效: ' + (typeLabel || '(空)') });
      continue;
    }

    const payload = {
      type,
      content: raw['题干'],
      option_a: raw['选项A'],
      option_b: raw['选项B'],
      option_c: raw['选项C'],
      option_d: raw['选项D'],
      option_e: raw['选项E'],
      option_f: raw['选项F'],
      answer: raw['正确答案'],
      analysis: raw['解析'],
      module: raw['知识模块'],
      difficulty: raw['难度'],
      source: raw['来源'],
      tags: raw['标签']
    };

    const content = trimOrNull(payload.content);
    if (!content) {
      errors.push({ row: rowNo, reason: '题干为空' });
      continue;
    }
    if (seenContent.has(content)) {
      errors.push({ row: rowNo, reason: '题干重复' });
      continue;
    }

    const normalized = applyJudgeOptions(payload);
    const { valid, errors: vErrors } = validateQuestion(normalized);
    if (!valid) {
      errors.push({ row: rowNo, reason: vErrors.join('；') });
      continue;
    }

    seenContent.add(content);
    validRows.push(normalized);
  }

  let success = 0;
  if (validRows.length) {
    await db.transaction(async (tx) => {
      for (const row of validRows) {
        await tx.execute(INSERT_SQL, normalizeRow(row));
        success += 1;
      }
    });
  }

  return { success, failed: errors.length, total: rows.length, errors: errors.slice(0, 200) };
}

/** 导出（供前端生成 Excel/CSV） */
async function exportRows(query = {}) {
  const result = await list(Object.assign({}, query, { page: 1, pageSize: 100000 }));
  return result.list.map((q) => ({
    题型: TYPE_LABEL[q.type] || q.type,
    题干: q.content,
    选项A: q.option_a || '',
    选项B: q.option_b || '',
    选项C: q.option_c || '',
    选项D: q.option_d || '',
    选项E: q.option_e || '',
    选项F: q.option_f || '',
    正确答案: q.answer,
    解析: q.analysis || '',
    知识模块: q.module || '',
    难度: q.difficulty,
    来源: q.source || '',
    标签: q.tags || ''
  }));
}

/**
 * 按环节配置抽题 (project.md 5.4)
 * 随机抽题：按题型/知识模块/难度筛选后随机抽取
 * 固定试卷：按指定 id 列表取题
 */
async function pickQuestions(cfg, { scopeKey = 'common', countOverride = null } = {}) {
  const filters = [];
  const params = [];

  if (cfg.moduleFilter && cfg.moduleFilter.length) {
    filters.push('module IN (' + cfg.moduleFilter.map(() => '?').join(',') + ')');
    params.push(...cfg.moduleFilter);
  }
  if (cfg.difficultyFilter && cfg.difficultyFilter.length) {
    filters.push('difficulty IN (' + cfg.difficultyFilter.map(() => '?').join(',') + ')');
    params.push(...cfg.difficultyFilter);
  }
  const whereSql = filters.length ? ' WHERE ' + filters.join(' AND ') : '';

  const pickByType = async (type, count) => {
    if (count <= 0) return [];
    if (cfg.paperStrategy === 'fixed') {
      if (!cfg.fixedQuestionIds.length) return [];
      const rows = await db.query(
        'SELECT * FROM questions WHERE id IN (' + cfg.fixedQuestionIds.map(() => '?').join(',') + ') AND type = ?',
        cfg.fixedQuestionIds.concat([type])
      );
      return rows.slice(0, count);
    }
    const rows = await db.query(
      'SELECT * FROM questions' + whereSql + (whereSql ? ' AND' : ' WHERE') + ' type = ? ORDER BY RAND() LIMIT ' + Number(count),
      params.concat([type])
    );
    return rows;
  };

  const q = cfg.questionConfig;

  // 接力模式：按 relayPlan 为每位队员生成不同试题
  if (q.relay && q.relayPlan.length) {
    const plan = q.relayPlan.find((p) => p.index === Number(scopeKey)) || q.relayPlan[0];
    const single = await pickByType(1, plan.single);
    const multiple = await pickByType(2, plan.multiple);
    const judge = await pickByType(3, plan.judge);
    return [...single, ...multiple, ...judge];
  }

  const single = await pickByType(1, countOverride && countOverride.single !== undefined ? countOverride.single : q.single);
  const multiple = await pickByType(2, countOverride && countOverride.multiple !== undefined ? countOverride.multiple : q.multiple);
  const judge = await pickByType(3, countOverride && countOverride.judge !== undefined ? countOverride.judge : q.judge);

  // 固定试卷保持管理员指定顺序
  if (cfg.paperStrategy === 'fixed') {
    const all = [...single, ...multiple, ...judge];
    const order = new Map(cfg.fixedQuestionIds.map((id, i) => [Number(id), i]));
    all.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9));
    return all;
  }
  return [...single, ...multiple, ...judge];
}

module.exports = {
  TYPE_LABEL,
  LABEL_TYPE,
  OPTION_KEYS,
  OPTION_LETTERS,
  validateQuestion,
  applyJudgeOptions,
  list,
  facets,
  getById,
  create,
  update,
  remove,
  removeMany,
  importRows,
  exportRows,
  pickQuestions
};
