const { isAdmin } = require('../middleware/auth');

function canViewPost(post, user) {
  if (!post.is_private) {
    return true;
  }
  if (!user) {
    return false;
  }
  if (isAdmin(user)) {
    return true;
  }
  if (post.user_id) {
    return post.user_id === user.id;
  }
  return post.author === user.name;
}

function mapPostForList(post, user) {
  if (canViewPost(post, user)) {
    return Object.assign({}, post, { locked: false });
  }
  return Object.assign({}, post, {
    locked: true,
    title: '비밀글입니다',
    content: ''
  });
}

module.exports = { canViewPost, mapPostForList };
