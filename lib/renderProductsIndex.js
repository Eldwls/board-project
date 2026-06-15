var db = require('../db/db');
var { getSizesForType } = require('./sizes');
var { getSessionUserId } = require('./sessionUser');

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

function renderProductsIndex(req, res) {
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

    db.all(
      'SELECT p.*, COALESCE((SELECT SUM(stock) FROM product_stocks ps WHERE ps.product_id = p.id),0) as total_stock FROM products p ORDER BY p.likes DESC LIMIT 5',
      [],
      function (rErr, ranking) {
        (ranking || []).forEach(function (p) { p.stock = p.total_stock; });
        getWishlistIds(userId, function (wErr, wishlistIds) {
          res.render('products/index', {
            products: products,
            ranking: ranking || [],
            categories: CATS,
            currentCategory: category,
            currentSort: sort,
            currentDir: dir,
            wishlistIds: wishlistIds,
            cartAdded: req.query.cart_added === '1',
            basePath: res.locals.basePath,
            appUrl: res.locals.appUrl
          });
        });
      }
    );
  });
}

module.exports = { renderProductsIndex, CATS };
