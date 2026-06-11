var express = require('express');
var db = require('../db/db');
var { requireLogin } = require('../middleware/auth');
var { getSizesForType, stockLabel } = require('../lib/sizes');
var { appUrl } = require('../lib/basePath');
var { getSessionUserId } = require('../lib/sessionUser');

var router = express.Router();
var CATS = ['전체', '상의', '하의', '아우터', '잡화'];

function getWishlistIds(userId, cb) {
  if (!userId) return cb(null, []);
  db.all('SELECT product_id FROM wishlists WHERE user_id = ?', [userId], function (err, rows) {
    cb(err, rows ? rows.map(function (r) { return r.product_id; }) : []);
  });
}

function buildSort(sort, dir) {
  if (sort === 'price') return 'p.price ' + (dir === 'desc' ? 'DESC' : 'ASC');
  if (sort === 'price_high') return 'p.price ' + (dir === 'asc' ? 'ASC' : 'DESC');
  if (sort === 'reviews') return 'review_count ' + (dir === 'asc' ? 'ASC' : 'DESC') + ', p.likes DESC';
  return 'p.likes ' + (dir === 'asc' ? 'ASC' : 'DESC');
}

router.get('/', function (req, res) {
  var category = req.query.category || '전체';
  var sort = req.query.sort || 'likes';
  var dir = req.query.dir || (sort === 'price' ? 'asc' : 'desc');
  var where = '';
  var params = [];
  if (category !== '전체') { where = ' WHERE p.category = ?'; params.push(category); }

  var userId = getSessionUserId(req);
  var orderBy = buildSort(sort, dir);

  var sql = `SELECT p.*, COALESCE(r.cnt, 0) as review_count,
    COALESCE((SELECT SUM(stock) FROM product_stocks ps WHERE ps.product_id = p.id), 0) as total_stock
    FROM products p
    LEFT JOIN (SELECT product_id, COUNT(*) as cnt FROM reviews GROUP BY product_id) r ON p.id = r.product_id
    ${where} ORDER BY ${orderBy}`;

  db.all(sql, params, function (err, products) {
    if (err) return res.status(500).send('상품 로드 오류');

    products.forEach(function (p) {
      p.stock = p.total_stock;
      p.sizes = getSizesForType(p.size_type);
    });

    db.all('SELECT p.*, COALESCE((SELECT SUM(stock) FROM product_stocks ps WHERE ps.product_id = p.id),0) as total_stock FROM products p ORDER BY p.likes DESC LIMIT 5', [], function (rErr, ranking) {
      ranking.forEach(function (p) { p.stock = p.total_stock; });
      getWishlistIds(userId, function (wErr, wishlistIds) {
        res.render('products/index', {
          products: products, ranking: ranking, categories: CATS,
          currentCategory: category, currentSort: sort, currentDir: dir,
          wishlistIds: wishlistIds,
          cartAdded: req.query.cart_added === '1'
        });
      });
    });
  });
});

router.get('/:id', function (req, res) {
  var id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(404).send('상품 없음');

  var userId = getSessionUserId(req);
  var reviewSort = req.query.review_sort || 'latest';
  var photoOnly = req.query.photo_only === '1';

  db.get('SELECT * FROM products WHERE id = ?', [id], function (err, product) {
    if (err || !product) return res.status(404).send('상품 없음');

    db.all('SELECT size, stock FROM product_stocks WHERE product_id = ? ORDER BY size', [id], function (sErr, sizeStocks) {
      var stocks = {};
      var total = 0;
      (sizeStocks || []).forEach(function (s) { stocks[s.size] = s.stock; total += s.stock; });
      product.stock = total;

      var reviewWhere = 'WHERE r.product_id = ?';
      var reviewParams = [id];
      if (photoOnly) reviewWhere += " AND r.image_url IS NOT NULL AND r.image_url != ''";

      var reviewOrder = 'r.created_at DESC';
      if (reviewSort === 'likes') reviewOrder = 'r.likes DESC, r.created_at DESC';
      if (reviewSort === 'rating') reviewOrder = 'r.rating DESC, r.created_at DESC';

      db.all(
        `SELECT r.*, u.name as user_name FROM reviews r JOIN users u ON r.user_id = u.id
         ${reviewWhere} ORDER BY ${reviewOrder}`,
        reviewParams,
        function (rErr, reviews) {
          getWishlistIds(userId, function (wErr, wishlistIds) {
            db.all('SELECT size FROM restock_alerts WHERE user_id = ? AND product_id = ?', [userId || 0, id], function (aErr, alerts) {
              var alertSizes = (alerts || []).map(function (a) { return a.size; });
              res.render('products/show', {
                product: product,
                sizeStocks: stocks,
                sizeList: sizeStocks || [],
                inWishlist: wishlistIds.indexOf(product.id) >= 0,
                reviews: reviews || [],
                reviewSort: reviewSort,
                photoOnly: photoOnly,
                alertSizes: alertSizes,
                stockLabel: stockLabel
              });
            });
          });
        }
      );
    });
  });
});

router.post('/:id/reviews', requireLogin, function (req, res) {
  var id = parseInt(req.params.id, 10);
  var rating = parseInt(req.body.rating, 10);
  var content = (req.body.content || '').trim();
  var imageUrl = (req.body.image_url || '').trim();
  var userId = req.session.user.id;

  if (isNaN(rating) || rating < 1 || rating > 5) {
    return res.redirect(appUrl('/products/' + id + '?review_err=1'));
  }

  db.serialize(function () {
    db.run('BEGIN');
    db.run(
      'INSERT INTO reviews (user_id, product_id, rating, content, image_url) VALUES (?,?,?,?,?)',
      [userId, id, rating, content, imageUrl || null],
      function (insErr) {
        if (insErr) { db.run('ROLLBACK'); return res.status(500).send('리뷰 등록 실패'); }
        db.run('UPDATE users SET points = points + 5000 WHERE id = ?', [userId], function (ptErr) {
          if (ptErr) { db.run('ROLLBACK'); return res.status(500).send('적립금 처리 실패'); }
          db.run('COMMIT', function () {
            res.redirect(appUrl('/products/' + id + '?review_ok=1&points=5000'));
          });
        });
      }
    );
  });
});

router.post('/:id/restock-alert', requireLogin, function (req, res) {
  var id = parseInt(req.params.id, 10);
  var size = (req.body.size || '').trim();
  var userId = req.session.user.id;

  if (!size) return res.status(400).json({ ok: false, message: '사이즈를 선택해 주세요.' });

  db.run(
    'INSERT OR IGNORE INTO restock_alerts (user_id, product_id, size) VALUES (?,?,?)',
    [userId, id, size],
    function (err) {
      if (err) return res.status(500).json({ ok: false, message: '알림 신청 실패' });
      res.json({ ok: true, message: '재입고 알림이 신청되었습니다.' });
    }
  );
});

router.post('/:id/like', function (req, res) {
  db.run('UPDATE products SET likes = likes + 1 WHERE id = ?', [parseInt(req.params.id, 10)], function () {
    res.redirect(appUrl('/products/' + req.params.id));
  });
});

module.exports = router;
