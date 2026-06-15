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

var app = express();
app.set('trust proxy', 1);

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
if (BASE_PATH) {
  app.use(BASE_PATH, express.static(path.join(__dirname, 'public')));
}

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

function homeRedirect(req, res) {
  res.redirect(appUrl('/products'));
}

app.get('/', homeRedirect);
if (BASE_PATH) {
  app.get(BASE_PATH, homeRedirect);
  app.get(BASE_PATH + '/', homeRedirect);
}

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
