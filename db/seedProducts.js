const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { getSizesForType, resolveSizeType } = require('../lib/sizes');

const dbPath = path.join(__dirname, '../database.sqlite');
const db = new sqlite3.Database(dbPath);

const DEFAULT_STOCK = 18;

// 품절·재입고 알림 테스트용: 스니커즈 250mm만 0개
const SOLDOUT_TEST = { productName: '클래식 레더 스니커즈', size: '250mm' };

const IMG = 'https://images.unsplash.com/photo-';
const products = [
  { name: '시티보이 오버핏 셔츠', description: '뭐든 입어도 어울리는 루즈 실루엣', price: 59000, category: '상의', image: IMG + '1594938298603-c8148c4dae35?w=1200&q=85&auto=format&fit=crop', likes: 2840, is_featured: 1 },
  { name: '슬림 워싱 데님', description: '365일 데일리 인디고 데님', price: 89000, category: '하의', image: IMG + '1542272604-787c3835535d?w=1200&q=85&auto=format&fit=crop', likes: 3120, is_featured: 1 },
  { name: '울 블렌드 오버코트', description: '겨울에도 뭐든 사는 아우터', price: 189000, category: '아우터', image: IMG + '1539533018447-63fcce267608?w=1200&q=85&auto=format&fit=crop', likes: 4210, is_featured: 1 },
  { name: '클래식 레더 스니커즈', description: '발에 뭐든 맞는 화이트 스니커즈', price: 129000, category: '잡화', image: IMG + '1549298916-b41d501d3772?w=1200&q=85&auto=format&fit=crop', likes: 5680, is_featured: 1 },
  { name: '미니멀 크로스백', description: '뭐든 들어가는 데일리 백', price: 79000, category: '잡화', image: IMG + '1553062407-98eeb64c6a62?w=1200&q=85&auto=format&fit=crop', likes: 1950, is_featured: 1 },
  { name: '그래픽 후드', description: '스트릿 무드 오버핏 후드', price: 69000, category: '상의', image: IMG + '1556821840-3a63f95609a7?w=1200&q=85&auto=format&fit=crop', likes: 1720, is_featured: 0 },
  { name: '와이드 카고 팬츠', description: '유틸 포켓 와이드 핏', price: 99000, category: '하의', image: IMG + '1624378439575-d8705ad7ae80?w=1200&q=85&auto=format&fit=crop', likes: 2100, is_featured: 0 },
  { name: '나일론 윈드브레이커', description: '시티보이 아웃도어 바람막이', price: 119000, category: '아우터', image: IMG + '1591047139829-d91aecb6caea?w=1200&q=85&auto=format&fit=crop', likes: 2680, is_featured: 0 },
  { name: '볼캡 스트릿 모자', description: '데일리 볼캡', price: 39000, category: '잡화', image: IMG + '1588852622552-63edc07866a5?w=1200&q=85&auto=format&fit=crop', likes: 980, is_featured: 0 },
  { name: '린넨 블렌드 셔츠', description: '시원한 여름 린넨 셔츠', price: 49000, category: '상의', image: IMG + '1602810318383-e386cc2a3ccf?w=1200&q=85&auto=format&fit=crop', likes: 1340, is_featured: 0 },
  { name: '테이퍼드 슬랙스', description: '오피스룩 테이퍼드 핏', price: 79000, category: '하의', image: IMG + '1473966962630-7e150adbcaff?w=1200&q=85&auto=format&fit=crop', likes: 1560, is_featured: 0 },
  { name: '퍼플리스 집업', description: '레이어드 집업 아우터', price: 89000, category: '아우터', image: IMG + '1551028711-22f38b835a0d?w=1200&q=85&auto=format&fit=crop', likes: 1890, is_featured: 0 }
];

products.forEach((p) => { p.size_type = resolveSizeType(p.category, p.name); });

function stockForSize(productName, size) {
  if (productName === SOLDOUT_TEST.productName && size === SOLDOUT_TEST.size) return 0;
  return DEFAULT_STOCK;
}

function syncProductTotals(cb) {
  db.run(
    `UPDATE products SET stock = (
      SELECT COALESCE(SUM(ps.stock), 0) FROM product_stocks ps WHERE ps.product_id = products.id
    )`,
    cb
  );
}

db.serialize(() => {
  db.run('DELETE FROM restock_alerts');
  db.run('DELETE FROM reviews');
  db.run('DELETE FROM product_stocks');
  db.run('DELETE FROM cart_items');
  db.run('DELETE FROM wishlists');
  db.run('DELETE FROM order_items');
  db.run('DELETE FROM orders');
  db.run('DELETE FROM products', (err) => {
    if (err) { console.error(err.message); db.close(); return; }

    const pStmt = db.prepare(
      'INSERT INTO products (name, description, price, category, size_type, image, stock, likes, is_featured) VALUES (?,?,?,?,?,?,0,?,?)'
    );
    const sStmt = db.prepare('INSERT INTO product_stocks (product_id, size, stock) VALUES (?,?,?)');

    let i = 0;
    function next() {
      if (i >= products.length) {
        pStmt.finalize();
        sStmt.finalize(() => {
          syncProductTotals((syncErr) => {
            if (syncErr) console.error(syncErr.message);
            else {
              console.log('뭐든사 상품 ' + products.length + '건 시드 완료');
              console.log('사이즈별 기본 재고: ' + DEFAULT_STOCK + '개');
              console.log('품절 테스트: ' + SOLDOUT_TEST.productName + ' / ' + SOLDOUT_TEST.size + ' = 0개');
            }
            db.close();
          });
        });
        return;
      }
      const p = products[i];
      pStmt.run(p.name, p.description, p.price, p.category, p.size_type, p.image, p.likes, p.is_featured, function () {
        const pid = this.lastID;
        getSizesForType(p.size_type).forEach((sz) => {
          sStmt.run(pid, sz, stockForSize(p.name, sz));
        });
        i++;
        next();
      });
    }
    next();
  });
});
