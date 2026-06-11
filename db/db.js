const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 루트 디렉토리에 생성된 database.sqlite 파일 연결
const dbPath = path.join(__dirname, '../database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('데이터베이스 연결 실패:', err.message);
    } else {
        console.log('SQLite 데이터베이스에 성공적으로 연결되었습니다.');
    }
});

module.exports = db;