#!/usr/bin/env bash
cd /var/www/integrated-platform/backend
node -e "
const db = require('./src/config/db');
(async () => {
  const rooms = await db.query(\"SELECT id, team_id, name FROM chat_rooms WHERE name LIKE '%准入%' OR name LIKE '%门禁%' OR name LIKE '%R11%' OR name LIKE '%R10%'\");
  console.log('待清理测试聊天室: ' + JSON.stringify(rooms));
  for (const r of rooms) {
    await db.execute('DELETE FROM chat_messages WHERE room_id = ?', [r.id]);
    await db.execute('DELETE FROM chat_rooms WHERE id = ?', [r.id]);
  }
  const left = await db.query('SELECT id, name FROM chat_rooms');
  console.log('剩余聊天室: ' + JSON.stringify(left));
  await db.close();
})();
"
