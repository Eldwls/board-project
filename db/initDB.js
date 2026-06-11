const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '../database.sqlite');
const schemaPath = path.join(__dirname, '../schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf8');

if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
  console.log('기존 database.sqlite를 삭제하고 새로 생성합니다.');
}

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.exec(schema, (err) => {
    if (err) {
      console.error('데이터베이스 초기화 실패:', err.message);
    } else {
      console.log('데이터베이스(database.sqlite) 및 테이블이 성공적으로 생성되었습니다.');
    }
    db.close();
  });
});
