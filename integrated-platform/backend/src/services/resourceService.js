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

/** 更新资源分类（名称、排序、启用状态均可改） */
async function updateCategory(id, payload = {}) {
  const row = await db.queryOne('SELECT * FROM resource_categories WHERE id = ?', [id]);
  if (!row) throw new AppError('分类不存在', 404, 404);

  const name = payload.name !== undefined ? String(payload.name).trim() : row.name;
  if (!name) throw new AppError('分类名称不能为空');

  // 同名分类不允许重复
  if (name !== row.name) {
    const dup = await db.queryOne('SELECT id FROM resource_categories WHERE name = ? AND id <> ? LIMIT 1', [name, id]);
    if (dup) throw new AppError('已存在同名分类', 409, 409);
  }

  await db.execute(
    'UPDATE resource_categories SET name = ?, sort_order = ?, status = ? WHERE id = ?',
    [
      name,
      payload.sortOrder !== undefined ? Number(payload.sortOrder) || 0 : row.sort_order,
      payload.status !== undefined ? (Number(payload.status) === 1 ? 1 : 0) : row.status,
      id
    ]
  );
  return db.queryOne('SELECT * FROM resource_categories WHERE id = ?', [id]);
}

/**
 * 删除资源分类。
 *
 * 外键为 ON DELETE CASCADE，直接删会连带清空该分类下的全部网站，
 * 因此这里要求先清空分类下的网站，避免误删造成数据丢失。
 */
async function removeCategory(id) {
  const row = await db.queryOne('SELECT * FROM resource_categories WHERE id = ?', [id]);
  if (!row) throw new AppError('分类不存在', 404, 404);

  const used = await db.queryOne('SELECT COUNT(*) AS c FROM resource_sites WHERE category_id = ?', [id]);
  if (used && Number(used.c) > 0) {
    throw new AppError('该分类下还有 ' + used.c + ' 个网站，请先移除或改到其他分类', 409, 409);
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

/**
 * 批量导入资源网站。
 *
 * 表头（中文）：所属分类 / 网站名称 / 网址 / 简介 / 图标 / 排序 / 状态
 * 必填：所属分类、网站名称、网址。
 *
 * 分类按名称匹配（不区分大小写、忽略首尾空格）；若不存在则自动创建，
 * 这样运营可以直接把整理好的 Excel 丢进来，无需先手工建分类。
 *
 * @param {Array<object>} rows 已按表头映射好的行对象
 * @returns {Promise<{total:number, inserted:number, skipped:number, failed:number, createdCategories:string[], errors:Array}>}
 */
async function importSites(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const result = { total: list.length, inserted: 0, skipped: 0, failed: 0, createdCategories: [], errors: [] };

  // 分类名 -> id（先加载现有分类，避免逐行查库）
  const cats = await db.query('SELECT id, name FROM resource_categories');
  const catMap = new Map(cats.map((c) => [String(c.name).trim().toLowerCase(), c.id]));

  // 已存在的 (分类, 网址) 组合，用于跳过重复
  const existing = await db.query('SELECT category_id, url FROM resource_sites');
  const seen = new Set(existing.map((s) => Number(s.category_id) + '|' + String(s.url || '').trim().toLowerCase()));

  for (let i = 0; i < list.length; i += 1) {
    const raw = list[i] || {};
    const line = i + 2; // 含表头，方便用户对照 Excel 行号

    const catName = String(raw['所属分类'] ?? raw.categoryName ?? raw.category ?? '').trim();
    const name = String(raw['网站名称'] ?? raw.name ?? '').trim();
    const url = String(raw['网址'] ?? raw.url ?? '').trim();
    const description = String(raw['简介'] ?? raw.description ?? '').trim();
    const iconUrl = String(raw['图标'] ?? raw.iconUrl ?? raw.icon_url ?? '').trim();
    const sortRaw = String(raw['排序'] ?? raw.sortOrder ?? '').trim();
    const statusRaw = String(raw['状态'] ?? raw.status ?? '').trim();

    if (!catName || !name || !url) {
      result.failed += 1;
      result.errors.push({ line, message: '所属分类、网站名称、网址为必填项' });
      continue;
    }

    // 状态：开启/关闭（也兼容 1/0、启用/禁用）
    const status = /^(关闭|禁用|0|false|no)$/i.test(statusRaw) ? 0 : 1;
    const sortOrder = Number.isFinite(Number(sortRaw)) && sortRaw !== '' ? Number(sortRaw) : 0;

    try {
      // 分类不存在则自动创建
      const key = catName.toLowerCase();
      let categoryId = catMap.get(key);
      if (!categoryId) {
        const created = await createCategory({ name: catName, sortOrder: 0, status: 1 });
        categoryId = created.id;
        catMap.set(key, categoryId);
        result.createdCategories.push(catName);
      }

      const dupKey = Number(categoryId) + '|' + url.toLowerCase();
      if (seen.has(dupKey)) {
        result.skipped += 1;
        continue;
      }

      await db.execute(
        'INSERT INTO resource_sites (category_id, name, url, description, icon_url, sort_order, status) VALUES (?,?,?,?,?,?,?)',
        [categoryId, name, url, description || null, iconUrl || null, sortOrder, status]
      );
      seen.add(dupKey);
      result.inserted += 1;
    } catch (e) {
      result.failed += 1;
      result.errors.push({ line, message: e.message });
    }
  }

  return result;
}

/** 批量导入模板的表头 */
const SITE_IMPORT_HEADERS = ['所属分类', '网站名称', '网址', '简介', '图标', '排序', '状态'];

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
  importSites, SITE_IMPORT_HEADERS,
  listSites, createSite, updateSite, removeSite, trackVisit
};
