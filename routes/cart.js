var express = require('express');
var db = require('../db/db');
var { requireLogin } = require('../middleware/auth');
var { appUrl, redirect: redirectTo } = require('../lib/basePath');

var router = express.Router();
router.use(requireLogin);

function getSizeStock(productId, size, cb) {
  db.get('SELECT stock FROM product_stocks WHERE product_id = ? AND size = ?', [productId, size], cb);
}

router.get('/', function (req, res) {
  var userId = req.session.user.id;
  db.all(
    `SELECT c.product_id, c.size, c.quantity, p.name, p.price, p.image, p.category
     FROM cart_items c JOIN products p ON c.product_id = p.id
     WHERE c.user_id = ? ORDER BY c.created_at DESC`,
    [userId],
    function (err, items) {
      if (err) return res.status(500).send('장바구니 오류');
      var total = items.reduce(function (s, i) { return s + i.price * i.quantity; }, 0);
      res.render('cart/index', { items: items, total: total, message: req.query.message || null });
    }
  );
});

router.post('/add', function (req, res) {
  var userId = req.session.user.id;
  var productId = parseInt(req.body.productId, 10);
  var size = (req.body.size || 'FREE').trim();
  var qty = parseInt(req.body.quantity, 10) || 1;
  var redirectPath = req.body.redirect || '/products?cart_added=1';
  var buyNow = req.body.buy_now === '1';

  if (isNaN(productId)) return res.redirect(appUrl('/products'));

  getSizeStock(productId, size, function (err, row) {
    if (err || !row || row.stock < 1) {
      return redirectTo(res, redirectPath.indexOf('?') >= 0
        ? redirectPath.replace('cart_added=1', 'err=soldout')
        : redirectPath + '?err=soldout');
    }

    db.get('SELECT quantity FROM cart_items WHERE user_id = ? AND product_id = ? AND size = ?',
      [userId, productId, size], function (e, cartRow) {
        var newQty = cartRow ? cartRow.quantity + qty : qty;
        if (newQty > row.stock) return res.redirect(appUrl('/cart?message=stock_insufficient'));

        function done() {
          if (buyNow) return res.redirect(appUrl('/order/checkout'));
          redirectTo(res, redirectPath);
        }

        if (cartRow) {
          db.run('UPDATE cart_items SET quantity = ? WHERE user_id = ? AND product_id = ? AND size = ?',
            [newQty, userId, productId, size], done);
        } else {
          db.run('INSERT INTO cart_items (user_id, product_id, size, quantity) VALUES (?,?,?,?)',
            [userId, productId, size, qty], done);
        }
      });
  });
});

router.post('/update', function (req, res) {
  var userId = req.session.user.id;
  var productId = parseInt(req.body.productId, 10);
  var size = req.body.size || 'FREE';
  var qty = parseInt(req.body.quantity, 10);

  if (qty < 1) {
    return db.run('DELETE FROM cart_items WHERE user_id = ? AND product_id = ? AND size = ?',
      [userId, productId, size], function () { res.redirect(appUrl('/cart')); });
  }

  getSizeStock(productId, size, function (err, row) {
    if (!row || qty > row.stock) return res.redirect(appUrl('/cart?message=stock_insufficient'));
    db.run('UPDATE cart_items SET quantity = ? WHERE user_id = ? AND product_id = ? AND size = ?',
      [qty, userId, productId, size], function () { res.redirect(appUrl('/cart')); });
  });
});

router.post('/remove', function (req, res) {
  db.run('DELETE FROM cart_items WHERE user_id = ? AND product_id = ? AND size = ?',
    [req.session.user.id, parseInt(req.body.productId, 10), req.body.size || 'FREE'],
    function () { res.redirect(appUrl('/cart')); });
});

module.exports = router;
