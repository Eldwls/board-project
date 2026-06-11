var express = require('express');
var db = require('../db/db');
var { requireLogin } = require('../middleware/auth');
var { appUrl, redirect: redirectTo } = require('../lib/basePath');

var router = express.Router();

router.post('/toggle', requireLogin, function (req, res) {
  var userId = req.session.user.id;
  var productId = parseInt(req.body.productId, 10);
  var redirectPath = req.body.redirect || '/products';

  if (isNaN(productId)) return redirectTo(res, redirectPath);

  db.get('SELECT stock FROM products WHERE id = ?', [productId], function (err, product) {
    if (err || !product) return redirectTo(res, redirectPath);

    db.get('SELECT 1 FROM wishlists WHERE user_id = ? AND product_id = ?', [userId, productId], function (e, row) {
      if (row) {
        db.run('DELETE FROM wishlists WHERE user_id = ? AND product_id = ?', [userId, productId], function () {
          redirectTo(res, redirectPath);
        });
      } else {
        db.run('INSERT INTO wishlists (user_id, product_id) VALUES (?, ?)', [userId, productId], function () {
          redirectTo(res, redirectPath);
        });
      }
    });
  });
});

router.post('/remove', requireLogin, function (req, res) {
  var userId = req.session.user.id;
  var productId = parseInt(req.body.productId, 10);
  db.run('DELETE FROM wishlists WHERE user_id = ? AND product_id = ?', [userId, productId], function () {
    res.redirect(appUrl('/user/mypage?tab=wishlist'));
  });
});

router.post('/to-cart', requireLogin, function (req, res) {
  var productId = parseInt(req.body.productId, 10);
  res.redirect(appUrl('/products/' + productId));
});

module.exports = router;
