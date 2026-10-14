'use strict';
const db = require('../src/config/db');
(async () => {
  const cols = await db.query("SHOW COLUMNS FROM chat_messages LIKE 'sender_key'");
  if (cols.length) { console.log('sender_key 已存在'); process.exit(0); }
  await db.execute("ALTER TABLE chat_messages ADD COLUMN sender_key VARCHAR(64) DEFAULT NULL COMMENT '发送者标识(用于区分自己/他人)' AFTER sender_student_id");
  await db.execute("ALTER TABLE chat_messages ADD KEY idx_msg_sender_key (room_id, sender_key)");
  const after = await db.query("SHOW COLUMNS FROM chat_messages LIKE 'sender_key'");
  console.log('已添加:', JSON.stringify(after));
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
