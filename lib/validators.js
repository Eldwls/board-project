function validateUsername(username) {
  if (!username || username.length < 4 || username.length > 20) {
    return '아이디는 4~20자여야 합니다.';
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return '아이디는 영문, 숫자, 밑줄(_)만 사용할 수 있습니다.';
  }
  return null;
}

function validatePassword(password) {
  if (!password || password.length < 4) {
    return '비밀번호는 4자 이상이어야 합니다.';
  }
  return null;
}

function validateName(name) {
  if (!name || name.length < 2) {
    return '이름은 2자 이상 입력해 주세요.';
  }
  return null;
}

module.exports = { validateUsername, validatePassword, validateName };
