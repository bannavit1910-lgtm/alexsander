function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  if (req.session.user.role !== 'admin') {
    return res.status(403).render('error', { message: 'คุณไม่มีสิทธิ์เข้าถึงหน้านี้ (ต้องเป็นแอดมินเท่านั้น)' });
  }
  next();
}

// ทำให้ทุกหน้าเข้าถึง current user ได้ผ่าน res.locals
function attachUser(req, res, next) {
  res.locals.currentUser = req.session.user || null;
  res.locals.currentPath = req.path;
  next();
}

module.exports = { requireLogin, requireAdmin, attachUser };
