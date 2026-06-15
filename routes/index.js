var express = require('express');
var { renderProductsIndex } = require('../lib/renderProductsIndex');

var router = express.Router();

router.get('/', function (req, res) {
  renderProductsIndex(req, res);
});

module.exports = router;
