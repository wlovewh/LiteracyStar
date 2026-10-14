'use strict';
const db = require('../config/db');
const { AppError } = require('../utils/response');

/**
 * 资源分类 + 网站 (project.md 追加文档 5)
 */

/** 分类列表（含网站数量） */
async function listCategories({ withSites = false, onlyEnabled = false } = {}) {
  const where = onlyEnabled ? ' WHERE c.status = 1' : '';
  const cats = await db.query(
    'SELECT c.*, (SELECT COUNT(*) FROM resource_sites s WHERE s.category_id = c.id' +
    (onlyEnabled ? ' AND s.status = 1' : '') + ') AS site_count ' +
    'FROM resource_categories c' + where + ' ORDER BY c.sort_order ASC, c.id ASC'
  );

  if (!withSites) return cats;

  const siteWhere = onlyEnabled ? ' WHERE status = 1' : '';
  const sites = await db.query(
    'SELECT * FROM resource_sites' + siteWhere + ' ORDER BY sort_order ASC, id ASC'
  );
  const grouped = new Map();
  sites.forEach((s) => {
    if (!grouped.has(s.category_id)) grouped.set(s.category_id, []);
    grouped.get(s.category_id).push(s);
  });
  return cats.map((c) => ({ ...c, sites: grouped.get(c.id) || [] }));
}

async function createCategory(payload = {}) {
  const name = String(payload.name || '').trim();
  if (!name) throw new AppError('分类名称不能为空');
  const res = await db.execute(
    'INSERT INTO resource_categories (name, sort_order, status) VALUES (?,?,?)',
    [name, Number(payload.sortOrder) || 0, payload.status === 0 ? 0 : 1]
  );
  return db.queryOne('SELECT * FROM resource_categories WHERE id = ?', [res.insertId]);
}

async function updateCategory(id, payload = {}) {
  const row = await db.queryOne('SELECT * FROM resource_categories WHERE id = ?', [id]);
  if (!row) throw new AppError('分类不存在', 404, 404);
  await db.execute(
    'UPDATE resource_categories SET name = ?, sort_order = ?, status = ? WHERE id = ?',
    [
      payload.name !== undefined ? String(payload.name).trim() : row.name,
      payload.sortOrder !== undefined ? Number(payload.sortOrder) || 0 : row.sort_order,
      payload.status !== undefined ? (Number(payload.status) === 1 ? 1 : 0) : row.status,
      id
    ]
  );
  return db.queryOne('SELECT * FROM resource_categories WHERE id = ?', [id]);
}

async function removeCategory(id) {
  const row = await db.queryOne('SELECT * FROM resource_categories WHERE id = ?', [id]);
  if (!row) throw new AppError('分类不存在', 404, 404);
  const used = await db.queryOne('SELECT COUNT(*) AS c FROM resource_sites WHERE category_id = ?', [id]);
  // 外键为 ON DELETE CASCADE，此处显式提示避免误删
  if (used && Number(used.c) > 0) {
    throw new AppError('该分类下还有 ' + used.c + ' 个网站，请先移除或改分类', 409, 409);
  }
  await db.execute('DELETE FROM resource_categories WHERE id = ?', [id]);
  return { id: Number(id) };
}

/** 网站列表（支持按分类、关键词筛选） */
async function listSites({ categoryId, keyword, page = 1, pageSize = 50, onlyEnabled = false } = {}) {
  const where = [];
  const params = [];
  if (categoryId) { where.push('s.category_id = ?'); params.push(Number(categoryId)); }
  if (keyword) { where.push('(s.name LIKE ? OR s.description LIKE ? OR s.url LIKE ?)'); const k = '%' + keyword + '%'; params.push(k, k, k); }
  if (onlyEnabled) where.push('s.status = 1');
  const clause = where.length ? ' WHERE ' + where.join(' AND ') : '';

  const totalRow = await db.queryOne('SELECT COUNT(*) AS c FROM resource_sites s' + clause, params);
  const limit = Math.max(1, Math.min(200, Number(pageSize) || 50));
  const offset = (Math.max(1, Number(page) || 1) - 1) * limit;

  const rows = await db.query(
    'SELECT s.*, c.name AS category_name FROM resource_sites s ' +
    'LEFT JOIN resource_categories c ON c.id = s.category_id' + clause +
    ' ORDER BY s.sort_order ASC, s.id ASC LIMIT ' + limit + ' OFFSET ' + offset,
    params
  );
  return { list: rows, total: totalRow ? Number(totalRow.c) : 0, page: Number(page) || 1, pageSize: limit };
}

async function createSite(payload = {}) {
  const name = String(payload.name || '').trim();
  const url = String(payload.url || '').trim();
  const categoryId = Number(payload.categoryId);
  if (!name) throw new AppError('网站名称不能为空');
  if (!url) throw new AppError('网址不能为空');
  if (!categoryId) throw new AppError('请选择所属分类');

  const cat = await db.queryOne('SELECT id FROM resource_categories WHERE id = ?', [categoryId]);
  if (!cat) throw new AppError('所属分类不存在', 404, 404);

  const res = await db.execute(
    'INSERT INTO resource_sites (category_id, name, url, description, icon_url, sort_order, status) VALUES (?,?,?,?,?,?,?)',
    [categoryId, name, url, payload.description || null, payload.iconUrl || null,
     Number(payload.sortOrder) || 0, payload.status === 0 ? 0 : 1]
  );
  return db.queryOne('SELECT * FROM resource_sites WHERE id = ?', [res.insertId]);
}

async function updateSite(id, payload = {}) {
  const row = await db.queryOne('SELECT * FROM resource_sites WHERE id = ?', [id]);
  if (!row) throw new AppError('网站不存在', 404, 404);
  await db.execute(
    'UPDATE resource_sites SET category_id = ?, name = ?, url = ?, description = ?, icon_url = ?, sort_order = ?, status = ? WHERE id = ?',
    [
      payload.categoryId !== undefined ? Number(payload.categoryId) : row.category_id,
      payload.name !== undefined ? String(payload.name).trim() : row.name,
      payload.url !== undefined ? String(payload.url).trim() : row.url,
      payload.description !== undefined ? payload.description : row.description,
      payload.iconUrl !== undefined ? payload.iconUrl : row.icon_url,
      payload.sortOrder !== undefined ? Number(payload.sortOrder) || 0 : row.sort_order,
      payload.status !== undefined ? (Number(payload.status) === 1 ? 1 : 0) : row.status,
      id
    ]
  );
  return db.queryOne('SELECT * FROM resource_sites WHERE id = ?', [id]);
}

async function removeSite(id) {
  const row = await db.queryOne('SELECT id FROM resource_sites WHERE id = ?', [id]);
  if (!row) throw new AppError('网站不存在', 404, 404);
  await db.execute('DELETE FROM resource_sites WHERE id = ?', [id]);
  return { id: Number(id) };
}

/** 记录访问次数（用于数据统计） */
async function trackVisit(id) {
  await db.execute('UPDATE resource_sites SET visit_count = visit_count + 1 WHERE id = ?', [id]);
  return { id: Number(id) };
}

/** 分类排序：按传入的 id 顺序重排 */
async function reorderCategories(ids = []) {
  for (let i = 0; i < ids.length; i += 1) {
    await db.execute('UPDATE resource_categories SET sort_order = ? WHERE id = ?', [i + 1, Number(ids[i])]);
  }
  return listCategories();
}

module.exports = {
  listCategories, createCategory, updateCategory, removeCategory, reorderCategories,
  listSites, createSite, updateSite, removeSite, trackVisit
};
