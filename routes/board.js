var express = require('express');
var db = require('../db/db');
var { requireLogin, isAdmin } = require('../middleware/auth');
var { canViewPost, mapPostForList } = require('../lib/boardAccess');
var { appUrl } = require('../lib/basePath');

var router = express.Router();
var BOARD_CATS = ['배송', '상품', '반품', '기타'];

function deletePostAndReplies(postId, cb) {
  db.all('SELECT id FROM posts WHERE parent_id = ?', [postId], function (err, children) {
    if (err) return cb(err);
    var i = 0;
    function next() {
      if (i >= children.length) return db.run('DELETE FROM posts WHERE id = ?', [postId], cb);
      deletePostAndReplies(children[i].id, function (e) {
        if (e) return cb(e);
        i++;
        next();
      });
    }
    next();
  });
}

function fetchReplies(parentId, user, cb) {
  db.all('SELECT * FROM posts WHERE parent_id = ? ORDER BY created_at ASC', [parentId], function (err, replies) {
    if (err) return cb(err);
    var visible = replies.filter(function (r) { return canViewPost(r, user); });
    var result = [];
    var i = 0;
    function next() {
      if (i >= visible.length) return cb(null, result);
      fetchReplies(visible[i].id, user, function (e, nested) {
        if (e) return cb(e);
        result.push({ post: visible[i], replies: nested });
        i++;
        next();
      });
    }
    next();
  });
}

router.get('/', function (req, res) {
  db.all(
    'SELECT * FROM posts WHERE parent_id IS NULL ORDER BY is_notice DESC, created_at DESC',
    [],
    function (err, posts) {
      if (err) return res.status(500).send('게시판 오류');
      res.render('board/index', {
        posts: posts.map(function (p) { return mapPostForList(p, req.session && req.session.user); }),
        categories: BOARD_CATS
      });
    }
  );
});

router.get('/write', requireLogin, function (req, res) {
  res.render('board/write', { error: null, categories: BOARD_CATS });
});

router.post('/write', requireLogin, function (req, res) {
  var title = (req.body.title || '').trim();
  var content = (req.body.content || '').trim();
  var category = req.body.category || '기타';
  var isPrivate = req.body.is_private === '1' ? 1 : 0;
  var isNotice = isAdmin(req.session.user) && req.body.is_notice === '1' ? 1 : 0;

  if (!title || !content) return res.render('board/write', { error: '제목과 내용을 입력해 주세요.', categories: BOARD_CATS });

  db.run(
    'INSERT INTO posts (title, content, category, parent_id, user_id, author, is_private, is_notice) VALUES (?,?,?,NULL,?,?,?,?)',
    [title, content, category, req.session.user.id, req.session.user.name, isPrivate, isNotice],
    function (err) {
      if (err) return res.render('board/write', { error: '등록 실패', categories: BOARD_CATS });
      res.redirect(appUrl('/board/' + this.lastID));
    }
  );
});

router.get('/:id/reply', requireLogin, function (req, res) {
  var id = parseInt(req.params.id, 10);
  db.get('SELECT * FROM posts WHERE id = ?', [id], function (err, parent) {
    if (err || !parent) return res.status(404).send('글 없음');
    if (!canViewPost(parent, req.session.user)) return res.status(403).render('error', { message: '비밀글 열람 권한이 없습니다.', error: { status: 403 } });
    res.render('board/reply', { parent: parent, error: null });
  });
});

router.post('/:id/reply', requireLogin, function (req, res) {
  var parentId = parseInt(req.params.id, 10);
  var title = (req.body.title || '').trim();
  var content = (req.body.content || '').trim();

  db.get('SELECT * FROM posts WHERE id = ?', [parentId], function (err, parent) {
    if (err || !parent) return res.status(404).send('글 없음');
    if (!canViewPost(parent, req.session.user)) return res.status(403).send('권한 없음');
    if (!title || !content) return res.render('board/reply', { parent: parent, error: '제목과 내용을 입력해 주세요.' });

    db.run(
      'INSERT INTO posts (title, content, category, parent_id, user_id, author, is_private, is_notice) VALUES (?,?,?,?,?,?,0,0)',
      [title, content, parent.category || '기타', parentId, req.session.user.id, req.session.user.name],
      function () { res.redirect(appUrl('/board/' + (parent.parent_id || parentId))); }
    );
  });
});

router.get('/:id/edit', requireLogin, function (req, res) {
  var id = parseInt(req.params.id, 10);
  db.get('SELECT * FROM posts WHERE id = ?', [id], function (err, post) {
    if (err || !post) return res.status(404).send('글 없음');
    var canEdit = isAdmin(req.session.user) || post.user_id === req.session.user.id;
    if (!canEdit) return res.status(403).send('권한 없음');
    res.render('board/edit', { post: post, error: null, categories: BOARD_CATS });
  });
});

router.post('/:id/edit', requireLogin, function (req, res) {
  var id = parseInt(req.params.id, 10);
  var title = (req.body.title || '').trim();
  var content = (req.body.content || '').trim();
  var category = req.body.category || '기타';
  var isPrivate = req.body.is_private === '1' ? 1 : 0;

  db.get('SELECT * FROM posts WHERE id = ?', [id], function (err, post) {
    if (err || !post) return res.status(404).send('글 없음');
    if (!isAdmin(req.session.user) && post.user_id !== req.session.user.id) return res.status(403).send('권한 없음');
    if (!title || !content) return res.render('board/edit', { post: post, error: '입력 확인', categories: BOARD_CATS });

    db.run('UPDATE posts SET title=?, content=?, category=?, is_private=? WHERE id=?',
      [title, content, category, isPrivate, id], function () { res.redirect(appUrl('/board/' + id)); });
  });
});

router.post('/:id/delete', requireLogin, function (req, res) {
  var id = parseInt(req.params.id, 10);
  db.get('SELECT * FROM posts WHERE id = ?', [id], function (err, post) {
    if (err || !post) return res.status(404).send('글 없음');
    if (!isAdmin(req.session.user) && post.user_id !== req.session.user.id) return res.status(403).send('권한 없음');
    var redirectId = post.parent_id;
    deletePostAndReplies(id, function (e) {
      if (e) return res.status(500).send('삭제 실패');
      res.redirect(appUrl(redirectId ? '/board/' + redirectId : '/board'));
    });
  });
});

router.get('/:id', function (req, res) {
  var id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(404).send('글 없음');

  db.get('SELECT * FROM posts WHERE id = ?', [id], function (err, post) {
    if (err || !post) return res.status(404).send('글 없음');
    if (!canViewPost(post, req.session.user)) {
      return res.status(403).render('error', { message: '비밀글은 작성자와 admin만 열람할 수 있습니다.', error: { status: 403 } });
    }

    db.run('UPDATE posts SET views = views + 1 WHERE id = ?', [id], function () {
      post.views = (post.views || 0) + 1;
      fetchReplies(id, req.session.user, function (rErr, replyTree) {
        res.render('board/show', { post: post, replyTree: replyTree || [], categories: BOARD_CATS });
      });
    });
  });
});

module.exports = router;
