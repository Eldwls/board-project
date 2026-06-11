var { appUrl } = require('../lib/basePath');

function requireLogin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.redirect(appUrl('/user/login') + '?redirect=' + encodeURIComponent(req.originalUrl));
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user || req.session.user.username !== 'admin') {
    if (req.session) req.session.flash = '권한이 없습니다.';
    return res.redirect(appUrl('/products'));
  }
  next();
}

function isAdmin(user) {
  return !!(user && user.username === 'admin');
}

module.exports = { requireLogin, requireAdmin, isAdmin };
