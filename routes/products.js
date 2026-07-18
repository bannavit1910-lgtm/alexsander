const express = require('express');
const db = require('../db');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

router.get('/', (req, res) => {
  const category = req.query.category;
  let products;
  if (category && category !== 'ทั้งหมด') {
    products = db.prepare('SELECT * FROM products WHERE category = ? ORDER BY created_at DESC').all(category);
  } else {
    products = db.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
  }
  const categories = db.prepare('SELECT DISTINCT category FROM products').all().map(r => r.category);
  res.render('index', { products, categories, activeCategory: category || 'ทั้งหมด' });
});

// ซื้อสินค้า: หักยอดคงเหลือของผู้ใช้ แล้วสร้างรายการคำสั่งซื้อ
router.post('/buy/:id', requireLogin, (req, res) => {
  const productId = req.params.id;
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!product) {
    return res.status(404).render('error', { message: 'ไม่พบสินค้านี้' });
  }
  if (product.stock <= 0) {
    return res.status(400).render('error', { message: 'สินค้าหมดสต็อกแล้ว' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  const finalPrice = Math.round(product.price * (1 - product.discount_percent / 100));

  if (user.balance < finalPrice) {
    return res.status(400).render('error', {
      message: `ยอดเงินคงเหลือไม่พอ (คงเหลือ ฿${(user.balance / 100).toFixed(2)}, ราคาสินค้า ฿${(finalPrice / 100).toFixed(2)}) กรุณาเติมเงินก่อนทำรายการ`,
    });
  }

  let outOfStock = false;

  const tx = db.transaction(() => {
    // ดึงไอดี/สต็อกที่ยังว่างอยู่ 1 รายการมาจอง (เก่าสุดก่อน) เพื่อส่งให้ลูกค้าทันที
    const item = db.prepare(`
      SELECT * FROM stock_items WHERE product_id = ? AND status = 'available' ORDER BY id ASC LIMIT 1
    `).get(product.id);

    if (!item) {
      outOfStock = true;
      return;
    }

    db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(finalPrice, user.id);

    const info = db.prepare(`
      INSERT INTO orders (user_id, product_id, price_paid, status, delivered_content)
      VALUES (?, ?, ?, 'completed', ?)
    `).run(user.id, product.id, finalPrice, item.content);

    db.prepare(`UPDATE stock_items SET status = 'sold', order_id = ? WHERE id = ?`)
      .run(info.lastInsertRowid, item.id);

    // ปรับจำนวนสต็อกที่แสดงหน้าร้านให้ตรงกับจำนวนไอดีที่เหลือจริง
    db.prepare(`
      UPDATE products SET stock = (SELECT COUNT(*) FROM stock_items WHERE product_id = ? AND status = 'available')
      WHERE id = ?
    `).run(product.id, product.id);
  });
  tx();

  if (outOfStock) {
    return res.status(400).render('error', { message: 'สินค้าหมดสต็อกแล้ว (ไม่มีไอดีคงเหลือให้ส่ง) กรุณาติดต่อแอดมินหรือรอเติมสต็อก' });
  }

  res.redirect('/dashboard?bought=1');
});

module.exports = router;
