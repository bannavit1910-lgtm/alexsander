const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');

const router = express.Router();

router.get('/register', (req, res) => {
  res.render('register', { error: null });
});

router.post('/register', async (req, res) => {
  const { username, password, confirm_password } = req.body;

  if (!username || !password) {
    return res.render('register', { error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
  }
  if (username.length < 4) {
    return res.render('register', { error: 'ชื่อผู้ใช้ต้องมีอย่างน้อย 4 ตัวอักษร' });
  }
  if (password.length < 6) {
    return res.render('register', { error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' });
  }
  if (password !== confirm_password) {
    return res.render('register', { error: 'รหัสผ่านทั้งสองช่องไม่ตรงกัน' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.render('register', { error: 'ชื่อผู้ใช้นี้มีคนใช้แล้ว' });
  }

  const hash = await bcrypt.hash(password, 10);
  const info = db.prepare(
    `INSERT INTO users (username, password_hash, role, tier, balance) VALUES (?, ?, 'member', 'Member', 0)`
  ).run(username, hash);

  req.session.user = {
    id: info.lastInsertRowid,
    username,
    role: 'member',
    tier: 'Member',
  };
  res.redirect('/dashboard');
});

router.get('/login', (req, res) => {
  res.render('login', { error: null });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (!user) {
    return res.render('login', { error: 'ไม่พบชื่อผู้ใช้นี้ในระบบ' });
  }
  const match = await bcrypt.compare(password || '', user.password_hash);
  if (!match) {
    return res.render('login', { error: 'รหัสผ่านไม่ถูกต้อง' });
  }

  req.session.user = {
    id: user.id,
    username: user.username,
    role: user.role,
    tier: user.tier,
  };

  if (user.role === 'admin') {
    return res.redirect('/admin');
  }
  res.redirect('/dashboard');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

module.exports = router;
