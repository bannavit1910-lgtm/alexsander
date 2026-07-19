require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const connectDB = require('./db');
const rateLimit = require('./middleware/rateLimit');
const { attachUser } = require('./middleware/auth');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-please-change',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24, // 1 วัน
  },
}));

app.use(attachUser);
app.locals.storeName = 'Alexsander Store';

// จำกัดจำนวน request ต่อ IP แบบง่าย ป้องกันการยิง API ถล่ม (rate limiting)
app.use(rateLimit({ windowMs: 60 * 1000, max: 100 }));

app.use('/', require('./routes/auth'));
app.use('/', require('./routes/products'));
app.use('/', require('./routes/orders'));
app.use('/', require('./routes/topup'));
app.use('/admin', require('./routes/admin'));

app.use((req, res) => {
  res.status(404).render('error', { message: 'ไม่พบหน้านี้' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { message: 'เกิดข้อผิดพลาดบางอย่างในระบบ กรุณาลองใหม่อีกครั้ง' });
});

const PORT = process.env.PORT || 3000;

// ต้องเชื่อมต่อ MongoDB ให้สำเร็จก่อน ค่อยเปิดรับ request
// (ถ้าเชื่อมต่อไม่ได้ connectDB() จะ process.exit(1) เอง — จะได้เห็นสาเหตุจริงใน log ทันที)
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Alexsander Store กำลังทำงานที่ http://localhost:${PORT}`);
  });
});
