'use strict';
const db = require('../config/db');
const questionService = require('./questionService');

/**
 * 数据统计 (project.md 追加文档 8.1)
 * 资源访问次数、题库检索次数、聊天消息量
 */
async function overview() {
  const [sites, categories, keys, rooms, messages, phrases] = await Promise.all([
    db.queryOne('SELECT COUNT(*) AS c, COALESCE(SUM(visit_count), 0) AS visits FROM resource_sites'),
    db.queryOne('SELECT COUNT(*) AS c FROM resource_categories'),
    db.queryOne('SELECT COUNT(*) AS c FROM access_keys'),
    db.queryOne('SELECT COUNT(*) AS c FROM chat_rooms'),
    db.queryOne('SELECT COUNT(*) AS c FROM chat_messages'),
    db.queryOne('SELECT COUNT(*) AS c FROM quick_phrases')
  ]);

  const questionCount = await db.queryCompetition('SELECT COUNT(*) AS c FROM questions q');

  return {
    siteCount: Number(sites.c),
    siteVisits: Number(sites.visits),
    categoryCount: Number(categories.c),
    keyCount: Number(keys.c),
    roomCount: Number(rooms.c),
    messageCount: Number(messages.c),
    phraseCount: Number(phrases.c),
    questionCount: questionCount ? Number(questionCount[0].c) : 0,
    searchCount: await questionService.getSearchCount()
  };
}

/** 访问量 Top N 网站 */
async function topSites(limit = 10) {
  const rows = await db.query(
    'SELECT s.id, s.name, s.url, s.visit_count, c.name AS category_name ' +
    'FROM resource_sites s LEFT JOIN resource_categories c ON c.id = s.category_id ' +
    'ORDER BY s.visit_count DESC, s.id ASC LIMIT ' + Number(limit)
  );
  return rows.map((r) => ({
    id: r.id, name: r.name, url: r.url,
    visitCount: Number(r.visit_count), categoryName: r.category_name || ''
  }));
}

/** 各分类网站数量分布 */
async function categoryDistribution() {
  const rows = await db.query(
    'SELECT c.name, COUNT(s.id) AS site_count, COALESCE(SUM(s.visit_count), 0) AS visits ' +
    'FROM resource_categories c LEFT JOIN resource_sites s ON s.category_id = c.id ' +
    'GROUP BY c.id, c.name ORDER BY c.sort_order ASC'
  );
  return rows.map((r) => ({ name: r.name, siteCount: Number(r.site_count), visits: Number(r.visits) }));
}

/** 近 N 天消息量趋势 */
async function messageTrend(days = 7) {
  const d = Math.max(1, Math.min(30, Number(days) || 7));
  const rows = await db.query(
    'SELECT DATE(created_at) AS day, COUNT(*) AS count FROM chat_messages ' +
    'WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ' + (d - 1) + ' DAY) ' +
    'GROUP BY DATE(created_at) ORDER BY day ASC'
  );
  const map = new Map(rows.map((r) => [String(r.day), Number(r.count)]));
  const out = [];
  for (let i = d - 1; i >= 0; i -= 1) {
    const dt = new Date(Date.now() - i * 86400000);
    const key = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
    out.push({ day: key, count: map.get(key) || 0 });
  }
  return out;
}

/** 消息类型分布 */
async function messageTypeDistribution() {
  const rows = await db.query(
    'SELECT message_type, COUNT(*) AS count FROM chat_messages GROUP BY message_type'
  );
  const label = { text: '文本', question: '题目', answer: '答案', system: '系统' };
  return rows.map((r) => ({ type: r.message_type, label: label[r.message_type] || r.message_type, count: Number(r.count) }));
}

module.exports = { overview, topSites, categoryDistribution, messageTrend, messageTypeDistribution };
