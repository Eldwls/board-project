var express = require('express');
var { appUrl } = require('../lib/basePath');
var router = express.Router();

/* 메인 페이지 리다이렉트 (쇼핑몰로 이동) */
router.get('/', function(req, res, next) {
  res.redirect(appUrl('/products'));
});

module.exports = router;