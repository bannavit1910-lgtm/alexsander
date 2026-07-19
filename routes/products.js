const express = require('express');
const { requireLogin } = require('../middleware/auth');
const Product = require('../models/Product');
const User = require('../models/User');
const Order = require('../models/Order');
const StockItem = require('../models/StockItem');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const category = req.query.category;
    let products;
    
    // ค้นหาสินค้า
    if (category && category !== 'ทั้งหมด') {
      products = await Product.find({ category }).sort({ createdAt: -1 });
    } else {
      products = await Product.find().sort({ createdAt: -1 });
    }
    
    // ดึงหมวดหมู่ทั้งหมดแบบไม่ซ้ำ
    const categories = await Product.distinct('category');
    
    res.render('index', { products, categories, activeCategory: category || 'ทั้งหมด' });
  } catch (error) {
    console.error('Error loading products:', error);
    res.status(500).send('Server Error');
  }
});

// ซื้อสินค้า: หักยอดคงเหลือของผู้ใช้ แล้วสร้างรายการคำสั่งซื้อ
router.post('/buy/:id', requireLogin, async (req, res) => {
  try {
    const productId = req.params.id;
    
    // ดึงข้อมูลสินค้า
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).render('error', { message: 'ไม่พบสินค้านี้' });
    }
    if (product.stock <= 0) {
      return res.status(400).render('error', { message: 'สินค้าหมดสต็อกแล้ว' });
    }

    // ดึงข้อมูลผู้ใช้
    const user = await User.findById(req.session.user.id);
    const finalPrice = Math.round(product.price * (1 - product.discount_percent / 100));

    if (user.balance < finalPrice) {
      return res.status(400).render('error', {
        message: `ยอดเงินคงเหลือไม่พอ (คงเหลือ ฿${(user.balance / 100).toFixed(2)}, ราคาสินค้า ฿${(finalPrice / 100).toFixed(2)}) กรุณาเติมเงินก่อนทำรายการ`,
      });
    }

    // ดึงไอดี/สต็อกที่ยังว่างอยู่ 1 รายการ (เก่าสุดก่อน)
    const item = await StockItem.findOne({ product_id: product._id, status: 'available' }).sort({ createdAt: 1 });
    
    if (!item) {
      return res.status(400).render('error', { message: 'สินค้าหมดสต็อกแล้ว (ไม่มีไอดีคงเหลือให้ส่ง) กรุณาติดต่อแอดมินหรือรอเติมสต็อก' });
    }

    // หักเงินผู้ใช้
    user.balance -= finalPrice;
    await user.save();

    // สร้าง Order
    const newOrder = await Order.create({
      user_id: user._id,
      product_id: product._id,
      price_paid: finalPrice,
      status: 'completed',
      delivered_content: item.content
    });

    // อัปเดตสถานะ StockItem ว่าขายแล้ว
    item.status = 'sold';
    item.order_id = newOrder._id;
    await item.save();

    // อัปเดตจำนวนสต็อกรวมของสินค้า
    const availableStock = await StockItem.countDocuments({ product_id: product._id, status: 'available' });
    product.stock = availableStock;
    await product.save();

    res.redirect('/dashboard?bought=1');
    
  } catch (error) {
    console.error('Buy error:', error);
    res.status(500).render('error', { message: 'เกิดข้อผิดพลาดทางเซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง' });
  }
});

module.exports = router;
