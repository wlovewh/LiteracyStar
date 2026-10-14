'use strict';
/**
 * 数据库备份服务。
 *
 * 设计要点：
 *  - 用 mysqldump 导出到 backend/backups/，文件名带时间戳；
 *  - 每次备份写入 backup_records 表，管理端据此查看与删除；
 *  - 定时任务用进程内 setInterval 实现（每分钟检查一次是否到点），
 *    避免引入额外依赖；服务重启后按配置自动恢复；
 *  - 默认保留最近 N 份，超出的自动清理，防止磁盘被撑满。
 */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const db = require('../config/db');
const config = require('../config');
const logger = require('../utils/logger');

const BACKUP_DIR = config.backup.dir
  ? path.resolve(config.backup.dir)
  : path.resolve(__dirname, '..', '..', 'backups');

/**
 * 解析 mysqldump 可执行文件路径。
 * 生产环境通常在 PATH 中；Windows 开发机可能未加入 PATH，
 * 因此在 PATH 查找失败时回退到常见安装位置，避免"备份直接失败"。
 */
function resolveMysqldump() {
  if (config.backup.mysqldumpPath && fs.existsSync(config.backup.mysqldumpPath)) {
    return config.backup.mysqldumpPath;
  }
  const candidates = [
    'mysqldump',
    'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe',
    'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqldump.exe',
    'C:\\xampp\\mysql\\bin\\mysqldump.exe',
    'C:\\wamp64\\bin\\mysql\\mysql8.0.31\\bin\\mysqldump.exe',
    '/usr/bin/mysqldump',
    '/usr/local/mysql/bin/mysqldump'
  ];
  for (const c of candidates) {
    if (c === 'mysqldump') continue; // 交由 execFile 从 PATH 解析
    if (fs.existsSync(c)) return c;
  }
  return 'mysqldump';
}

/** 读取平台设置 */
async function getSetting(key, fallback = null) {
  const row = await db.queryOne('SELECT value FROM platform_settings WHERE `key` = ?', [key]);
  return row ? row.value : fallback;
}

async function setSetting(key, value) {
  await db.execute(
    'INSERT INTO platform_settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
    [key, value === null || value === undefined ? null : String(value)]
  );
}

/** 备份配置（带默认值） */
async function getConfig() {
  const [enabled, hour, minute, keep] = await Promise.all([
    getSetting('backup_enabled', '0'),
    getSetting('backup_hour', '3'),
    getSetting('backup_minute', '0'),
    getSetting('backup_keep', '7')
  ]);
  return {
    enabled: enabled === '1',
    hour: Math.min(23, Math.max(0, Number(hour) || 0)),
    minute: Math.min(59, Math.max(0, Number(minute) || 0)),
    keep: Math.max(1, Math.min(90, Number(keep) || 7))
  };
}

async function saveConfig(payload = {}) {
  if (payload.enabled !== undefined) await setSetting('backup_enabled', payload.enabled ? '1' : '0');
  if (payload.hour !== undefined) await setSetting('backup_hour', String(Math.min(23, Math.max(0, Number(payload.hour) || 0))));
  if (payload.minute !== undefined) await setSetting('backup_minute', String(Math.min(59, Math.max(0, Number(payload.minute) || 0))));
  if (payload.keep !== undefined) await setSetting('backup_keep', String(Math.max(1, Math.min(90, Number(payload.keep) || 7))));
  const cfg = await getConfig();
  scheduleNext();
  return cfg;
}

/** 判断 mysqldump 是否可用 */
function hasMysqldump() {
  const bin = resolveMysqldump();
  if (bin === 'mysqldump') return true; // 交由 PATH 解析，失败时再回退
  return fs.existsSync(bin);
}

/**
 * 纯 Node 实现的降级导出。
 * mysqldump 不存在时（常见于 Windows 开发机）用它生成逻辑备份，
 * 保证备份功能在缺少客户端工具时依然可用。
 */
async function dumpWithNode(targetFile) {
  const tables = await db.query('SHOW TABLES');
  const key = 'Tables_in_' + config.db.database;
  const names = tables.map((t) => t[key] || Object.values(t)[0]);

  const parts = [
    '-- 纯 Node 降级导出（未找到 mysqldump）',
    '-- 数据库: ' + config.db.database,
    '-- 时间: ' + new Date().toISOString(),
    'SET NAMES utf8mb4;',
    'SET FOREIGN_KEY_CHECKS = 0;',
    ''
  ];

  for (const name of names) {
    const create = await db.query('SHOW CREATE TABLE `' + name + '`');
    const ddl = create[0]['Create Table'] || create[0]['Create View'];
    parts.push('-- ---------- ' + name + ' ----------');
    parts.push('DROP TABLE IF EXISTS `' + name + '`;');
    parts.push(ddl + ';');

    // 分批读取，避免大表一次性占满内存
    const totalRow = await db.queryOne('SELECT COUNT(*) AS c FROM `' + name + '`');
    const total = Number(totalRow.c || 0);
    const CHUNK = 500;
    for (let offset = 0; offset < total; offset += CHUNK) {
      const rows = await db.query('SELECT * FROM `' + name + '` LIMIT ' + CHUNK + ' OFFSET ' + offset);
      if (!rows.length) break;
      for (const row of rows) {
        const cols = Object.keys(row);
        const vals = cols.map((c) => {
          const v = row[c];
          if (v === null || v === undefined) return 'NULL';
          if (typeof v === 'number') return String(v);
          if (v instanceof Date) return "'" + v.toISOString().slice(0, 19).replace('T', ' ') + "'";
          if (Buffer.isBuffer(v)) return '0x' + v.toString('hex');
          if (typeof v === 'object') return "'" + JSON.stringify(v).replace(/'/g, "''") + "'";
          return "'" + String(v).replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/\n/g, '\\n').replace(/\r/g, '\\r') + "'";
        });
        parts.push(
          'INSERT INTO `' + name + '` (' + cols.map((c) => '`' + c + '`').join(',') + ') VALUES (' + vals.join(',') + ');'
        );
      }
    }
    parts.push('');
  }

  parts.push('SET FOREIGN_KEY_CHECKS = 1;');
  fs.writeFileSync(targetFile, parts.join('\n'), 'utf8');
  return fs.statSync(targetFile).size;
}

/** 执行一次备份 */
function runMysqldump(targetFile) {
  return new Promise((resolve, reject) => {
    const args = [
      '-h', config.db.host,
      '-P', String(config.db.port),
      '-u', config.db.user,
      '--single-transaction',
      '--routines',
      '--events',
      '--databases', config.db.database
    ];
    const bin = resolveMysqldump();
    const child = execFile(bin, args, {
      env: { ...process.env, MYSQL_PWD: config.db.password },
      maxBuffer: 64 * 1024 * 1024
    }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      try {
        fs.writeFileSync(targetFile, stdout, 'utf8');
        resolve(fs.statSync(targetFile).size);
      } catch (e) {
        reject(e);
      }
    });
    child.on('error', (e) =>
      reject(new Error('无法执行 mysqldump（' + bin + '）: ' + e.message +
        '。可在 .env 中设置 MYSQLDUMP_PATH 指定完整路径。'))
    );
  });
}

async function createBackup(triggerBy = 'manual') {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const filename = 'backup_' + stamp + '.sql';
  const target = path.join(BACKUP_DIR, filename);

  try {
    let size;
    let method = 'mysqldump';
    try {
      size = await runMysqldump(target);
    } catch (e) {
      // mysqldump 缺失时回退到纯 Node 导出，保证备份功能始终可用
      if (/ENOENT|无法执行 mysqldump/.test(e.message)) {
        logger.warn('mysqldump 不可用，改用内置导出: ' + e.message);
        size = await dumpWithNode(target);
        method = 'builtin';
      } else {
        throw e;
      }
    }

    const res = await db.execute(
      'INSERT INTO backup_records (filename, file_size, scope, trigger_by, status) VALUES (?,?,?,?,?)',
      [filename, size, config.db.database, triggerBy, 'ok']
    );
    await enforceRetention();
    logger.info('备份完成: ' + filename + ' (' + Math.round(size / 1024) + ' KB, ' + method + ')');
    return { id: res.insertId, filename, fileSize: size, status: 'ok', method };
  } catch (err) {
    await db.execute(
      'INSERT INTO backup_records (filename, file_size, scope, trigger_by, status, message) VALUES (?,?,?,?,?,?)',
      [filename, 0, config.db.database, triggerBy, 'failed', String(err.message).slice(0, 500)]
    );
    logger.error('备份失败: ' + err.message);
    throw err;
  }
}

/** 备份记录列表 */
async function listBackups({ limit = 100 } = {}) {
  return db.query(
    'SELECT id, filename, file_size, scope, trigger_by, status, message, created_at ' +
    'FROM backup_records ORDER BY id DESC LIMIT ?',
    [Number(limit) || 100]
  );
}

/** 删除一条备份（同时删除磁盘文件） */
async function removeBackup(id) {
  const row = await db.queryOne('SELECT * FROM backup_records WHERE id = ?', [id]);
  if (!row) return { id: Number(id), removed: false };

  const target = path.join(BACKUP_DIR, path.basename(row.filename));
  if (target.startsWith(BACKUP_DIR) && fs.existsSync(target)) {
    try { fs.unlinkSync(target); } catch (_) { /* 文件已不存在可忽略 */ }
  }
  await db.execute('DELETE FROM backup_records WHERE id = ?', [id]);
  return { id: Number(id), removed: true, filename: row.filename };
}

/** 批量删除 */
async function removeMany(ids) {
  const list = (ids || []).map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0);
  let removed = 0;
  for (const id of list) {
    const r = await removeBackup(id);
    if (r.removed) removed += 1;
  }
  return { requested: list.length, removed };
}

/** 清理超过保留份数的旧备份 */
async function enforceRetention() {
  const cfg = await getConfig();
  const rows = await db.query('SELECT id FROM backup_records ORDER BY id DESC');
  const extra = rows.slice(cfg.keep);
  for (const r of extra) await removeBackup(r.id);
  return extra.length;
}

/** 备份文件下载路径（供管理端下载） */
function resolveBackupFile(filename) {
  const target = path.join(BACKUP_DIR, path.basename(String(filename)));
  if (!target.startsWith(BACKUP_DIR) || !fs.existsSync(target)) return null;
  return target;
}

// ---------------- 定时调度 ----------------
let timer = null;
let lastRunKey = null;

/** 每分钟检查一次是否到达配置的备份时刻 */
function scheduleNext() {
  if (timer) { clearInterval(timer); timer = null; }

  timer = setInterval(async () => {
    try {
      const cfg = await getConfig();
      if (!cfg.enabled) return;

      const now = new Date();
      const key = now.toISOString().slice(0, 10) + ' ' + cfg.hour + ':' + cfg.minute;
      // 同一分钟内只触发一次；跨天由 key 中的日期保证
      if (now.getHours() !== cfg.hour || now.getMinutes() !== cfg.minute) return;
      if (lastRunKey === key) return;
      lastRunKey = key;

      await createBackup('auto');
    } catch (err) {
      logger.error('定时备份失败: ' + err.message);
    }
  }, 60 * 1000);

  // 不阻止进程退出
  if (timer.unref) timer.unref();
}

/** 启动调度（应用启动时调用一次） */
async function start() {
  try {
    const cfg = await getConfig();
    scheduleNext();
    logger.info('备份调度已启动: ' + (cfg.enabled ? ('每天 ' + cfg.hour + ':' + String(cfg.minute).padStart(2, '0')) : '未启用'));
  } catch (err) {
    logger.warn('备份调度启动失败: ' + err.message);
  }
}

module.exports = {
  BACKUP_DIR,
  getConfig,
  saveConfig,
  createBackup,
  listBackups,
  removeBackup,
  removeMany,
  enforceRetention,
  resolveBackupFile,
  start
};
