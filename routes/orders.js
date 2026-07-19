const express = require('express');
const User = require('../models/User');
const Order = require('../models/Order');
const Topup = require('../models/Topup');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

router.get('/dashboard', requireLogin, async (req, res) => {
  try {
    const user = await User.findById(req.session.user.id);
    if (!user) {
      req.session.destroy(() => res.redirect('/login'));
      return;
    }

    const ordersRaw = await Order.find({ user_id: user._id })
      .populate('product_id', 'title image_path')
      .sort({ createdAt: -1 });

    // ปรับรูปแบบให้ตรงกับที่ view เดิมคาดหวัง (product_title, image_path แบบแบน)
    const orders = ordersRaw.map((o) => ({
      ...o.toObject(),
      product_title: o.product_id ? o.product_id.title : null,
      image_path: o.product_id ? o.product_id.image_path : null,
    }));

    const topups = await Topup.find({ user_id: user._id }).sort({ createdAt: -1 });

    res.render('dashboard', {
      user,
      orders,
      topups,
      justBought: req.query.bought === '1',
    });
  } catch (error) {
    console.error('Dashboard Error:', error);
    res.status(500).render('error', { message: 'เกิดข้อผิดพลาดในการโหลดหน้า dashboard' });
  }
});

module.exports = router;
