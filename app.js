var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var session = require('express-session');
var { isAdmin } = require('./middleware/auth');

var userRouter = require('./routes/user');
var boardRouter = require('./routes/board');
var productRouter = require('./routes/products');
var cartRouter = require('./routes/cart');
var orderRouter = require('./routes/order');
var wishlistRouter = require('./routes/wishlist');
var adminRouter = require('./routes/admin');
var { BASE_PATH, appUrl } = require('./lib/basePath');
var { renderProductsIndex } = require('./lib/renderProductsIndex');

var app = express();
app.set('trust proxy', 1);

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use(session({
  secret: 'mudeunsa-fashion-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24,
    path: BASE_PATH || '/'
  }
}));

app.locals.basePath = BASE_PATH;
app.locals.appUrl = appUrl;

app.use(function (req, res, next) {
  var session = req.session;
  res.locals.user = (session && session.user) || null;
  res.locals.isAdmin = isAdmin(session && session.user);
  res.locals.flash = (session && session.flash) || null;
  res.locals.basePath = BASE_PATH;
  res.locals.appUrl = appUrl;
  if (session) delete session.flash;
  next();
});

/**
 * 대문(/) · BASE_PATH · BASE_PATH/ 진입 시 리다이렉트 없이 상품 목록을 그 자리에서 렌더
 * Nginx prefix strip으로 '/'만 들어오는 경우와 '/stud2/' 직접 접근 모두 처리
 */
app.use(function homeEntryGuard(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();

  var rawUrl = (req.originalUrl || req.url || '').split('?')[0].split('#')[0];
  var reqPath = req.path || '/';

  function normalize(p) {
    if (!p || p === '') return '/';
    var s = p;
    while (s.length > 1 && s.charAt(s.length - 1) === '/') {
      s = s.slice(0, -1);
    }
    return s;
  }

  var normUrl = normalize(rawUrl);
  var normPath = normalize(reqPath);
  var normBase = BASE_PATH ? normalize(BASE_PATH) : '';

  var isDoor = normPath === '/' || normUrl === '/' || rawUrl === '' || normUrl === '';

  if (normBase) {
    isDoor = isDoor || normPath === normBase || normUrl === normBase;
  }

  if (isDoor) {
    return renderProductsIndex(req, res);
  }

  next();
});

app.use(express.static(path.join(__dirname, 'public')));
if (BASE_PATH) {
  app.use(BASE_PATH, express.static(path.join(__dirname, 'public')));
}

function mountRouter(routePath, router) {
  app.use(routePath, router);
  if (BASE_PATH) app.use(BASE_PATH + routePath, router);
}

mountRouter('/user', userRouter);
mountRouter('/admin', adminRouter);
mountRouter('/wishlist', wishlistRouter);
mountRouter('/board', boardRouter);
mountRouter('/products', productRouter);
mountRouter('/cart', cartRouter);
mountRouter('/order', orderRouter);

function loginRedirect(req, res) {
  res.redirect(appUrl('/user/login'));
}
app.get('/login', loginRedirect);
if (BASE_PATH) app.get(BASE_PATH + '/login', loginRedirect);

app.use(function (req, res, next) {
  next(createError(404));
});

app.use(function (err, req, res, next) {
  if (req.app.get('env') === 'development') console.error(err.stack || err);
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : { status: err.status };
  res.status(err.status || 500);
  res.render('error');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server Running on port ${PORT}`);
  if (BASE_PATH) console.log(`Base path: ${BASE_PATH}`);
});

module.exports = app;
