'use strict';
const db = require('../src/config/db');
(async () => {
  await db.execute(`CREATE TABLE IF NOT EXISTS backup_records (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    filename    VARCHAR(200) NOT NULL,
    file_size   BIGINT UNSIGNED NOT NULL DEFAULT 0,
    scope       VARCHAR(50) NOT NULL DEFAULT 'all',
    trigger_by  VARCHAR(20) NOT NULL DEFAULT 'auto',
    status      VARCHAR(20) NOT NULL DEFAULT 'ok',
    message     VARCHAR(500) DEFAULT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_backup_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const cols = await db.query('SHOW COLUMNS FROM backup_records');
  console.log('backup_records 列:', cols.map(c => c.Field).join(', '));
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
