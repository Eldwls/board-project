var express = require('express');
var bcrypt = require('bcrypt');
var db = require('../db/db');
var { requireLogin } = require('../middleware/auth');
var { validateUsername, validatePassword, validateName } = require('../lib/validators');
var { appUrl, redirect: redirectTo } = require('../lib/basePath');

var router = express.Router();
var SALT = 10;

function setSession(req, user) {
  req.session.user = { id: user.id, username: user.username, name: user.name };
}

router.get('/register', function (req, res) {
  if (req.session.user) return res.redirect(appUrl('/products'));
  res.render('user/register', { error: null, form: {} });
});

router.post('/register', function (req, res) {
  var username = (req.body.username || '').trim();
  var password = req.body.password || '';
  var passwordConfirm = req.body.password_confirm || '';
  var name = (req.body.name || '').trim();
  var gender = (req.body.gender || '').trim() || null;
  var age = req.body.age ? parseInt(req.body.age, 10) : null;
  var address = (req.body.address || '').trim() || null;
  var phone = (req.body.phone || '').trim() || null;
  var email = (req.body.email || '').trim() || null;
  var form = { username: username, name: name, gender: gender, age: age, address: address, phone: phone, email: email };

  var errMsg = validateUsername(username) || validatePassword(password) || validateName(name);
  if (password !== passwordConfirm) errMsg = '비밀번호와 비밀번호 확인이 일치하지 않습니다.';
  if (errMsg) return res.render('user/register', { error: errMsg, form: form });

  db.get('SELECT * FROM users WHERE username = ?', [username], function (err, row) {
    if (err) return res.render('user/register', { error: '서버 오류', form: form });

    if (row && row.status === 'withdrawn') {
      return res.render('user/reactivate', { username: username, name: name, password: password });
    }
    if (row) return res.render('user/register', { error: '이미 사용 중인 아이디입니다.', form: form });

    bcrypt.hash(password, SALT, function (he, hash) {
      if (he) return res.render('user/register', { error: '가입 처리 오류', form: form });
      db.run(
        'INSERT INTO users (username, password, name, gender, age, address, phone, email, status, points) VALUES (?,?,?,?,?,?,?,?,?,0)',
        [username, hash, name, gender, age, address, phone, email, 'active'],
        function (ie) {
          if (ie) return res.render('user/register', { error: '가입 실패', form: form });
          setSession(req, { id: this.lastID, username: username, name: name });
          res.redirect(appUrl('/products'));
        }
      );
    });
  });
});

router.post('/reactivate', function (req, res) {
  var username = (req.body.username || '').trim();
  var password = req.body.password || '';
  var name = (req.body.name || '').trim();
  var confirm = req.body.confirm;

  if (confirm !== 'yes') return res.redirect(appUrl('/user/register'));

  db.get('SELECT * FROM users WHERE username = ? AND status = ?', [username, 'withdrawn'], function (err, row) {
    if (err || !row) return res.render('user/register', { error: '재가입할 계정을 찾을 수 없습니다.', form: { username: username, name: name } });

    bcrypt.hash(password, SALT, function (he, hash) {
      if (he) return res.render('user/register', { error: '재가입 처리 오류', form: {} });
      db.run('UPDATE users SET password=?, name=?, status=?, withdrawn_at=NULL WHERE id=?',
        [hash, name, 'active', row.id], function (ue) {
          if (ue) return res.render('user/register', { error: '재가입 실패', form: {} });
          setSession(req, { id: row.id, username: username, name: name });
          res.redirect(appUrl('/products?reactivated=1'));
        });
    });
  });
});

router.get('/login', function (req, res) {
  if (req.session.user) return res.redirect(appUrl('/products'));
  res.render('user/login', { error: null, redirect: req.query.redirect || '/products' });
});

router.post('/login', function (req, res) {
  var username = (req.body.username || '').trim();
  var password = req.body.password || '';
  var redirect = req.body.redirect || '/products';

  if (!username || !password) {
    return res.render('user/login', { error: '아이디와 비밀번호를 입력해 주세요.', redirect: redirect });
  }

  db.get('SELECT * FROM users WHERE username = ?', [username], function (err, user) {
    if (err || !user) return res.render('user/login', { error: '아이디 또는 비밀번호가 일치하지 않습니다.', redirect: redirect });
    if (user.status === 'withdrawn') return res.render('user/login', { error: '탈퇴한 계정입니다. 재가입을 진행해 주세요.', redirect: redirect });

    bcrypt.compare(password, user.password, function (ce, match) {
      if (ce || !match) return res.render('user/login', { error: '아이디 또는 비밀번호가 일치하지 않습니다.', redirect: redirect });
      setSession(req, user);
      redirectTo(res, redirect);
    });
  });
});

router.get('/find-id', function (req, res) {
  res.redirect(appUrl('/user/login'));
});

router.post('/find-id', function (req, res) {
  var name = (req.body.name || '').trim();
  var phone = (req.body.phone || '').trim();
  var email = (req.body.email || '').trim();

  if (!name || (!phone && !email)) {
    return res.json({ success: false, message: '이름과 전화번호 또는 이메일을 입력해 주세요.' });
  }

  db.get(
    'SELECT username FROM users WHERE name = ? AND status = ? AND (phone = ? OR email = ?)',
    [name, 'active', phone, email],
    function (err, user) {
      if (err) return res.json({ success: false, message: '조회 중 오류가 발생했습니다.' });
      if (!user) return res.json({ success: false, message: '일치하는 회원 정보가 없습니다.' });
      res.json({ success: true, username: user.username });
    }
  );
});

router.get('/find-password', function (req, res) {
  res.redirect(appUrl('/user/login'));
});

router.post('/find-pw', function (req, res) {
  var username = (req.body.username || '').trim();
  var name = (req.body.name || '').trim();
  var phone = (req.body.phone || '').trim();
  var email = (req.body.email || '').trim();

  if (!username || !name || (!phone && !email)) {
    return res.json({ success: false, message: '아이디, 이름, 전화번호 또는 이메일을 입력해 주세요.' });
  }

  db.get(
    'SELECT id FROM users WHERE username = ? AND name = ? AND status = ? AND (phone = ? OR email = ?)',
    [username, name, 'active', phone, email],
    function (err, user) {
      if (err) return res.json({ success: false, message: '처리 중 오류가 발생했습니다.' });
      if (!user) return res.json({ success: false, message: '일치하는 회원 정보가 없습니다.' });

      bcrypt.hash('0000', SALT, function (he, hash) {
        if (he) return res.json({ success: false, message: '비밀번호 초기화에 실패했습니다.' });
        db.run('UPDATE users SET password = ? WHERE id = ?', [hash, user.id], function (upErr) {
          if (upErr) return res.json({ success: false, message: '비밀번호 저장에 실패했습니다.' });
          res.json({
            success: true,
            message: "비밀번호가 '0000'으로 임시 초기화되었습니다. 로그인 후 변경해주세요."
          });
        });
      });
    }
  );
});

router.get('/mypage', requireLogin, function (req, res) {
  var userId = req.session.user.id;
  var tab = req.query.tab || 'profile';

  db.get('SELECT id, username, name, gender, age, address, phone, email, points, status, withdrawn_at FROM users WHERE id = ?', [userId], function (err, profile) {
    if (err || !profile) return res.status(500).send('회원 정보 오류');

    db.all('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 10', [userId], function (oErr, orders) {
      db.all(
        `SELECT w.product_id, p.name, p.price, p.image, p.stock, p.category
         FROM wishlists w JOIN products p ON w.product_id = p.id
         WHERE w.user_id = ? ORDER BY w.created_at DESC`,
        [userId],
        function (wErr, wishlist) {
          db.all(
            'SELECT id, title, category, is_private, is_notice, created_at FROM posts WHERE user_id = ? AND parent_id IS NULL ORDER BY created_at DESC',
            [userId],
            function (pErr, myPosts) {
              res.render('user/mypage', {
                profile: profile, orders: orders || [], wishlist: wishlist || [],
                myPosts: myPosts || [], tab: tab, err: req.query.err || null
              });
            }
          );
        }
      );
    });
  });
});

router.post('/withdraw', requireLogin, function (req, res) {
  var userId = req.session.user.id;
  if (req.session.user.username === 'admin') return res.status(403).send('관리자는 탈퇴할 수 없습니다.');

  db.run("UPDATE users SET status='withdrawn', withdrawn_at=datetime('now') WHERE id=?", [userId], function (err) {
    if (err) return res.status(500).send('탈퇴 처리 실패');
    req.session.destroy(function () {
      res.redirect(appUrl('/products?withdrawn=1'));
    });
  });
});

router.get('/logout', function (req, res) {
  req.session.destroy(function () { res.redirect(appUrl('/products')); });
});

module.exports = router;
