function getSessionUser(req) {
  return (req.session && req.session.user) || null;
}

function getSessionUserId(req) {
  var user = getSessionUser(req);
  return user ? user.id : null;
}

module.exports = { getSessionUser, getSessionUserId };
