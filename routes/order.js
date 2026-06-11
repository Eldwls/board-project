var express = require('express');
var db = require('../db/db');
var { requireLogin } = require('../middleware/auth');
var { appUrl } = require('../lib/basePath');

var router = express.Router();
router.use(requireLogin);

var STOCK_ERROR_MSG = '죄송합니다. 선택하신 사이즈의 재고가 부족합니다.';

function syncProductStock(productId, cb) {
  db.run(
    `UPDATE products SET stock = (
      SELECT COALESCE(SUM(stock), 0) FROM product_stocks WHERE product_id = ?
    ) WHERE id = ?`,
    [productId, productId],
    cb
  );
}

function checkCartStock(items, cb) {
  var i = 0;
  function next() {
    if (i >= items.length) return cb(null, true);
    var it = items[i];
    db.get(
      'SELECT stock FROM product_stocks WHERE product_id = ? AND size = ?',
      [it.product_id, it.size],
      function (err, row) {
        if (err) return cb(err);
        if (!row || row.stock < it.quantity) return cb(null, false);
        i++;
        next();
      }
    );
  }
  next();
}

router.get('/', function (req, res) {
  db.all('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC',
    [req.session.user.id], function (err, orders) {
      res.render('order/index', { orders: orders || [] });
    });
});

router.get('/checkout', function (req, res) {
  var userId = req.session.user.id;
  db.all(
    `SELECT c.product_id, c.size, c.quantity, p.name, p.price, p.image
     FROM cart_items c JOIN products p ON c.product_id = p.id WHERE c.user_id = ?`,
    [userId],
    function (err, items) {
      if (!items || !items.length) return res.redirect(appUrl('/cart?message=empty'));
      var total = items.reduce(function (s, i) { return s + i.price * i.quantity; }, 0);
      res.render('order/checkout', { items: items, total: total, user: req.session.user });
    }
  );
});

router.post('/complete', function (req, res) {
  var userId = req.session.user.id;
  var recipient = (req.body.recipient_name || '').trim();
  var phone = (req.body.phone || '').trim();
  var address = (req.body.address || '').trim();
  var payment = req.body.payment_method || '무통장입금';

  if (!recipient || !phone || !address) return res.redirect(appUrl('/order/checkout?err=form'));

  db.all(
    `SELECT c.product_id, c.size, c.quantity, p.name, p.price
     FROM cart_items c JOIN products p ON c.product_id = p.id WHERE c.user_id = ?`,
    [userId],
    function (err, items) {
      if (err) return res.status(500).send('주문 처리 중 오류가 발생했습니다.');
      if (!items || !items.length) return res.redirect(appUrl('/cart?message=empty'));

      checkCartStock(items, function (checkErr, ok) {
        if (checkErr) return res.status(500).send('재고 확인 중 오류가 발생했습니다.');
        if (!ok) return res.redirect(appUrl('/cart?message=stock_insufficient'));

        var total = items.reduce(function (s, it) { return s + it.price * it.quantity; }, 0);

        db.serialize(function () {
          db.run('BEGIN TRANSACTION');

          db.run(
            'INSERT INTO orders (user_id, total_price, status, recipient_name, phone, address, payment_method) VALUES (?,?,?,?,?,?,?)',
            [userId, total, '배송준비중', recipient, phone, address, payment],
            function (insErr) {
              if (insErr) {
                db.run('ROLLBACK');
                return res.status(500).send('주문 생성에 실패했습니다.');
              }

              var orderId = this.lastID;
              var idx = 0;

              function processItem() {
                if (idx >= items.length) {
                  return db.run('DELETE FROM cart_items WHERE user_id = ?', [userId], function (delErr) {
                    if (delErr) {
                      db.run('ROLLBACK');
                      return res.status(500).send('장바구니 비우기에 실패했습니다.');
                    }

                    var pIdx = 0;
                    var productIds = items.map(function (it) { return it.product_id; });
                    var uniqueIds = productIds.filter(function (id, i, arr) { return arr.indexOf(id) === i; });

                    function syncNext() {
                      if (pIdx >= uniqueIds.length) {
                        return db.run('COMMIT', function (commitErr) {
                          if (commitErr) return res.status(500).send('주문 완료 처리에 실패했습니다.');
                          res.redirect(appUrl('/order/' + orderId + '?completed=1'));
                        });
                      }
                      syncProductStock(uniqueIds[pIdx], function () {
                        pIdx++;
                        syncNext();
                      });
                    }
                    syncNext();
                  });
                }

                var it = items[idx];
                db.run(
                  'UPDATE product_stocks SET stock = stock - ? WHERE product_id = ? AND size = ? AND stock >= ?',
                  [it.quantity, it.product_id, it.size, it.quantity],
                  function (deductErr) {
                    if (deductErr || this.changes === 0) {
                      db.run('ROLLBACK');
                      return res.redirect(appUrl('/cart?message=stock_insufficient'));
                    }

                    db.run(
                      'INSERT INTO order_items (order_id, product_id, size, quantity, price) VALUES (?,?,?,?,?)',
                      [orderId, it.product_id, it.size, it.quantity, it.price],
                      function (oiErr) {
                        if (oiErr) {
                          db.run('ROLLBACK');
                          return res.status(500).send('주문 상세 저장에 실패했습니다.');
                        }
                        idx++;
                        processItem();
                      }
                    );
                  }
                );
              }

              processItem();
            }
          );
        });
      });
    }
  );
});

router.get('/:id', function (req, res) {
  var orderId = parseInt(req.params.id, 10);
  var userId = req.session.user.id;
  if (isNaN(orderId)) return res.status(404).send('주문 없음');

  db.get('SELECT * FROM orders WHERE id = ? AND user_id = ?', [orderId, userId], function (err, order) {
    if (err || !order) return res.status(404).send('주문 없음');

    db.all(
      `SELECT oi.*, p.name as product_name, p.image FROM order_items oi
       LEFT JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?`,
      [orderId],
      function (iErr, items) {
        res.render('order/show', { order: order, items: items || [], completed: req.query.completed === '1' });
      }
    );
  });
});

module.exports = router;
