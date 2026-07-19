const express = require('express');
const bcrypt = require('bcrypt');
const User = require('../models/User'); // เรียกใช้ User Model ของ MongoDB แทน

const router = express.Router();

router.get('/register', (req, res) => {
  res.render('register', { error: null });
});

router.post('/register', async (req, res) => {
  try {
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

    // เช็คว่ามีชื่อผู้ใช้นี้ในฐานข้อมูลหรือยัง (Mongoose)
    const existing = await User.findOne({ username });
    if (existing) {
      return res.render('register', { error: 'ชื่อผู้ใช้นี้มีคนใช้แล้ว' });
    }

    const hash = await bcrypt.hash(password, 10);
    
    // บันทึกข้อมูลลง MongoDB
    const newUser = await User.create({
      username: username,
      password_hash: hash
      // role, tier, balance ไม่ต้องใส่เพราะเราตั้ง default ไว้ใน Model แล้ว
    });

    // สร้าง Session ให้ผู้ใช้
    req.session.user = {
      id: newUser._id.toString(), // MongoDB จะใช้ _id แทน id 
      username: newUser.username,
      role: newUser.role,
      tier: newUser.tier,
    };
    res.redirect('/dashboard');

  } catch (error) {
    console.error('Register Error:', error);
    res.render('register', { error: 'เกิดข้อผิดพลาดทางเซิร์ฟเวอร์ โปรดลองใหม่อีกครั้ง' });
  }
});

router.get('/login', (req, res) => {
  res.render('login', { error: null });
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // ค้นหาผู้ใช้จาก MongoDB
    const user = await User.findOne({ username });

    if (!user) {
      return res.render('login', { error: 'ไม่พบชื่อผู้ใช้นี้ในระบบ' });
    }
    const match = await bcrypt.compare(password || '', user.password_hash);
    if (!match) {
      return res.render('login', { error: 'รหัสผ่านไม่ถูกต้อง' });
    }

    req.session.user = {
      id: user._id.toString(), // ใช้ _id ของ MongoDB
      username: user.username,
      role: user.role,
      tier: user.tier,
    };

    if (user.role === 'admin') {
      return res.redirect('/admin');
    }
    res.redirect('/dashboard');

  } catch (error) {
    console.error('Login Error:', error);
    res.render('login', { error: 'เกิดข้อผิดพลาดทางเซิร์ฟเวอร์ โปรดลองใหม่อีกครั้ง' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

module.exports = router;
