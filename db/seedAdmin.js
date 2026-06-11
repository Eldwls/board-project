const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const dbPath = path.join(__dirname, '../database.sqlite');
const db = new sqlite3.Database(dbPath);

bcrypt.hash('admin123', 10, (err, hash) => {
  if (err) { console.error(err.message); db.close(); return; }
  db.run(
    `INSERT INTO users (username, password, name, status) VALUES ('admin', ?, '뭐든사 관리자', 'active')
     ON CONFLICT(username) DO UPDATE SET password=excluded.password, name=excluded.name, status='active'`,
    [hash],
    (e) => {
      if (e) console.error(e.message);
      else console.log('관리자: admin / admin123');
      db.close();
    }
  );
});
