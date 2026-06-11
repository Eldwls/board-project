var express = require('express');
var db = require('../db/db');
var { requireAdmin } = require('../middleware/auth');
var { getSizesForType, resolveSizeType } = require('../lib/sizes');
var { appUrl } = require('../lib/basePath');

var router = express.Router();
router.use(requireAdmin);

var ORDER_STATUSES = ['배송준비중', '배송중', '배송완료', '주문취소'];
var CATS = ['상의', '하의', '아우터', '잡화'];
var DEFAULT_STOCK = 18;

function loadDashboard(tab, req, cb) {
  var data = {
    tab: tab,
    categories: CATS,
    statuses: ORDER_STATUSES,
    error: req.query.error || null,
    saved: req.query.saved === '1'
  };

  db.get('SELECT COUNT(*) as c FROM users WHERE status="active"', [], function (e1, u1) {
    db.get('SELECT COUNT(*) as c FROM users WHERE status="withdrawn"', [], function (e2, u2) {
      db.get('SELECT COUNT(*) as c FROM orders', [], function (e3, o) {
        db.get('SELECT COUNT(*) as c FROM products', [], function (e4, p) {
          data.stats = { activeUsers: u1.c, withdrawnUsers: u2.c, orders: o.c, products: p.c };

          db.all(
            `SELECT p.*, COALESCE((SELECT SUM(stock) FROM product_stocks ps WHERE ps.product_id = p.id),0) as total_stock
             FROM products p ORDER BY p.id DESC`,
            [],
            function (pErr, products) {
              data.products = products || [];

              db.all(
                `SELECT o.*, u.username, u.name FROM orders o JOIN users u ON o.user_id = u.id ORDER BY o.created_at DESC`,
                [],
                function (oErr, orders) {
                  data.orders = orders || [];

                  db.all(
                    'SELECT id, username, name, email, phone, points, status, withdrawn_at FROM users ORDER BY id ASC',
                    [],
                    function (uErr, users) {
                      data.users = users || [];
                      cb(null, data);
                    }
                  );
                }
              );
            }
          );
        });
      });
    });
  });
}

router.get('/', function (req, res) {
  var tab = req.query.tab || 'overview';
  if (['overview', 'products', 'orders', 'users'].indexOf(tab) < 0) tab = 'overview';

  loadDashboard(tab, req, function (err, data) {
    if (err) return res.status(500).send('관리자 대시보드 로드 실패');
    res.render('admin/dashboard', data);
  });
});

router.get('/products/:id/stocks', function (req, res) {
  var id = parseInt(req.params.id, 10);
  db.get('SELECT * FROM products WHERE id = ?', [id], function (err, product) {
    if (err || !product) return res.status(404).send('상품 없음');
    db.all('SELECT * FROM product_stocks WHERE product_id = ? ORDER BY size', [id], function (sErr, stocks) {
      res.render('admin/product-stocks', { product: product, stocks: stocks || [], saved: req.query.saved === '1' });
    });
  });
});

router.post('/products', function (req, res) {
  var name = (req.body.name || '').trim();
  var price = parseInt(req.body.price, 10);
  var category = req.body.category || '상의';
  var image = (req.body.image || '').trim();
  var description = (req.body.description || '').trim();
  var sizeType = resolveSizeType(category, name);

  if (!name || isNaN(price)) {
    return res.redirect(appUrl('/admin?tab=products&error=invalid'));
  }

  db.run(
    'INSERT INTO products (name, description, price, category, size_type, image, stock, likes) VALUES (?,?,?,?,?,?,0,0)',
    [name, description, price, category, sizeType, image],
    function () {
      var pid = this.lastID;
      var sizes = getSizesForType(sizeType);
      var stmt = db.prepare('INSERT INTO product_stocks (product_id, size, stock) VALUES (?,?,?)');
      sizes.forEach(function (sz) { stmt.run(pid, sz, DEFAULT_STOCK); });
      stmt.finalize(function () {
        db.run(
          'UPDATE products SET stock = (SELECT COALESCE(SUM(stock),0) FROM product_stocks WHERE product_id = ?) WHERE id = ?',
          [pid, pid],
          function () { res.redirect(appUrl('/admin/products/' + pid + '/stocks')); }
        );
      });
    }
  );
});

router.post('/products/:id/stocks', function (req, res) {
  var id = parseInt(req.params.id, 10);
  db.all('SELECT size FROM product_stocks WHERE product_id = ?', [id], function (err, rows) {
    if (!rows || !rows.length) return res.redirect(appUrl('/admin?tab=products'));

    var pending = rows.length;
    rows.forEach(function (r) {
      var val = parseInt(req.body['stock_' + r.size], 10);
      if (!isNaN(val) && val >= 0) {
        db.run('UPDATE product_stocks SET stock = ? WHERE product_id = ? AND size = ?', [val, id, r.size], done);
      } else done();

      function done() {
        pending--;
        if (pending === 0) {
          db.run(
            'UPDATE products SET stock = (SELECT COALESCE(SUM(stock),0) FROM product_stocks WHERE product_id = ?) WHERE id = ?',
            [id, id],
            function () { res.redirect(appUrl('/admin/products/' + id + '/stocks?saved=1')); }
          );
        }
      }
    });
  });
});

router.post('/products/:id/delete', function (req, res) {
  db.run('DELETE FROM products WHERE id = ?', [parseInt(req.params.id, 10)], function () {
    res.redirect(appUrl('/admin?tab=products&saved=1'));
  });
});

router.post('/orders/:id/status', function (req, res) {
  var status = req.body.status;
  if (ORDER_STATUSES.indexOf(status) < 0) return res.redirect(appUrl('/admin?tab=orders'));
  db.run('UPDATE orders SET status = ? WHERE id = ?', [status, parseInt(req.params.id, 10)], function () {
    res.redirect(appUrl('/admin?tab=orders&saved=1'));
  });
});

module.exports = router;
