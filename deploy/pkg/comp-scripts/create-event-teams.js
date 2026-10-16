'use strict';
const db = require('../src/config/db');
(async () => {
  await db.execute(`CREATE TABLE IF NOT EXISTS event_teams (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    event_id   INT UNSIGNED NOT NULL,
    team_id    INT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_event_team (event_id, team_id),
    KEY idx_et_event (event_id),
    KEY idx_et_team (team_id),
    CONSTRAINT fk_et_event FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE,
    CONSTRAINT fk_et_team FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const cols = await db.query('SHOW COLUMNS FROM event_teams');
  console.log('event_teams 列:', cols.map(c => c.Field).join(', '));
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
