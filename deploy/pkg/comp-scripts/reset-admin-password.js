'use strict';
const bcrypt = require('bcryptjs');
const db = require('../src/config/db');

(async () => {
  const hash = bcrypt.hashSync('admin123', 10);
  await db.execute('UPDATE admins SET password = ? WHERE username = ?', [hash, 'admin']);
  const a = await db.queryOne('SELECT password FROM admins WHERE username = ?', ['admin']);
  console.log('new hash:', hash);
  console.log('stored  :', a.password);
  console.log('verify  :', await bcrypt.compare('admin123', a.password));
  await db.close();
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
