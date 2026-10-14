'use strict';
const db = require('../src/config/db');
(async () => {
  await db.execute(`CREATE TABLE IF NOT EXISTS stage_attempts (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    stage_id    INT UNSIGNED NOT NULL,
    team_id     INT UNSIGNED NOT NULL,
    student_id  VARCHAR(50) NOT NULL,
    scope_key   VARCHAR(50) NOT NULL DEFAULT 'common',
    started_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    submitted_at DATETIME DEFAULT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_attempt (stage_id, team_id, student_id),
    KEY idx_attempt_stage (stage_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const cols = await db.query('SHOW COLUMNS FROM stage_attempts');
  console.log('stage_attempts 列:', cols.map(c => c.Field).join(', '));
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
