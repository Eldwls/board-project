var BASE_PATH = (process.env.BASE_PATH || '').replace(/\/$/, '');

function appUrl(path) {
  if (!path) return BASE_PATH || '/';
  if (path.indexOf('http') === 0) return path;
  if (path.charAt(0) !== '/') path = '/' + path;
  return (BASE_PATH || '') + path;
}

function redirect(res, target, fallback) {
  fallback = fallback || '/products';
  if (!target || target.charAt(0) !== '/' || target.indexOf('//') === 0) {
    return res.redirect(appUrl(fallback));
  }
  return res.redirect(appUrl(target));
}

module.exports = { BASE_PATH, appUrl, redirect };
