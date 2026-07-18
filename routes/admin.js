const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();
router.use(requireAdmin);

function logActivity(adminId, action, detail) {
  db.prepare('INSERT INTO admin_activity_log (admin_id, action, detail) VALUES (?, ?, ?)')
    .run(adminId, action, detail || '');
}

// ---------- Dashboard ----------
router.get('/', (req, res) => {
  const productCount = db.prepare('SELECT COUNT(*) c FROM products').get().c;
  const memberCount = db.prepare(`SELECT COUNT(*) c FROM users WHERE role = 'member'`).get().c;
  const pendingTopups = db.prepare(`SELECT COUNT(*) c FROM topups WHERE status = 'pending'`).get().c;
  const salesToday = db.prepare(`
    SELECT COALESCE(SUM(price_paid), 0) total FROM orders WHERE date(created_at) = date('now')
  `).get().total;

  const dailySales = db.prepare(`
    SELECT date(created_at) AS day, SUM(price_paid) AS total, COUNT(*) AS orders
    FROM orders
    WHERE created_at >= datetime('now', '-14 days')
    GROUP BY day ORDER BY day ASC
  `).all();

  res.render('admin/dashboard', { productCount, memberCount, pendingTopups, salesToday, dailySales });
});

// ---------- Products CRUD ----------
router.get('/products', (req, res) => {
  const products = db.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
  res.render('admin/products', { products });
});

router.get('/products/new', (req, res) => {
  res.render('admin/product-form', { product: null, error: null });
});

router.post('/products/new', upload.single('image'), (req, res) => {
  const { title, description, category, rarity, price, is_best_seller, discount_percent } = req.body;
  if (!title || !price) {
    return res.render('admin/product-form', { product: null, error: 'กรุณากรอกชื่อสินค้าและราคา' });
  }
  const imagePath = req.file ? `/uploads/${req.file.filename}` : null;
  const priceSatang = Math.round(parseFloat(price) * 100);

  // stock เริ่มต้นที่ 0 เสมอ — จำนวนสต็อกคำนวณจากไอดีจริงที่แอดมินเติมผ่านหน้า "จัดการสต็อก" หลังสร้างสินค้า
  const info = db.prepare(`
    INSERT INTO products (title, description, category, rarity, price, image_path, stock, is_best_seller, discount_percent)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
  `).run(
    title,
    description || '',
    category || 'ทั่วไป',
    rarity || 'rare',
    priceSatang,
    imagePath,
    is_best_seller ? 1 : 0,
    parseInt(discount_percent, 10) || 0
  );

  logActivity(req.session.user.id, 'สร้างสินค้าใหม่', title);
  res.redirect(`/admin/products/${info.lastInsertRowid}/stock`);
});

router.get('/products/:id/edit', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).render('error', { message: 'ไม่พบสินค้านี้' });
  res.render('admin/product-form', { product, error: null });
});

router.post('/products/:id/edit', upload.single('image'), (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).render('error', { message: 'ไม่พบสินค้านี้' });

  const { title, description, category, rarity, price, is_best_seller, discount_percent } = req.body;
  const priceSatang = Math.round(parseFloat(price) * 100);

  let imagePath = product.image_path;
  if (req.file) {
    // ลบรูปเก่าทิ้งถ้ามี
    if (product.image_path) {
      const oldFile = path.join(__dirname, '..', 'public', product.image_path);
      fs.unlink(oldFile, () => {});
    }
    imagePath = `/uploads/${req.file.filename}`;
  }

  // หมายเหตุ: ไม่แก้ไข stock ที่นี่ — จำนวนสต็อกคำนวณจากไอดีจริงในหน้า "จัดการสต็อก" เท่านั้น
  db.prepare(`
    UPDATE products SET title=?, description=?, category=?, rarity=?, price=?, image_path=?, is_best_seller=?, discount_percent=?
    WHERE id=?
  `).run(
    title,
    description || '',
    category || 'ทั่วไป',
    rarity || 'rare',
    priceSatang,
    imagePath,
    is_best_seller ? 1 : 0,
    parseInt(discount_percent, 10) || 0,
    product.id
  );

  logActivity(req.session.user.id, 'แก้ไขสินค้า', title);
  res.redirect('/admin/products');
});

router.post('/products/:id/delete', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (product && product.image_path) {
    fs.unlink(path.join(__dirname, '..', 'public', product.image_path), () => {});
  }
  db.prepare('DELETE FROM stock_items WHERE product_id = ?').run(req.params.id);
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  logActivity(req.session.user.id, 'ลบสินค้า', product ? product.title : `id ${req.params.id}`);
  res.redirect('/admin/products');
});

// ---------- Product stock (เติมไอดีเข้าสต็อก) ----------
const MAX_STOCK_PER_PRODUCT = 1000;

router.get('/products/:id/stock', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).render('error', { message: 'ไม่พบสินค้านี้' });

  const items = db.prepare(`
    SELECT stock_items.*, users.username AS sold_to
    FROM stock_items
    LEFT JOIN orders ON orders.id = stock_items.order_id
    LEFT JOIN users ON users.id = orders.user_id
    WHERE stock_items.product_id = ?
    ORDER BY (stock_items.status = 'available') DESC, stock_items.id DESC
  `).all(product.id);

  const availableCount = items.filter((i) => i.status === 'available').length;
  const soldCount = items.length - availableCount;

  res.render('admin/product-stock', {
    product, items, availableCount, soldCount, maxStock: MAX_STOCK_PER_PRODUCT, error: null,
  });
});

router.post('/products/:id/stock/add', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).render('error', { message: 'ไม่พบสินค้านี้' });

  const rerender = (error) => {
    const items = db.prepare(`
      SELECT stock_items.*, users.username AS sold_to
      FROM stock_items
      LEFT JOIN orders ON orders.id = stock_items.order_id
      LEFT JOIN users ON users.id = orders.user_id
      WHERE stock_items.product_id = ?
      ORDER BY (stock_items.status = 'available') DESC, stock_items.id DESC
    `).all(product.id);
    const availableCount = items.filter((i) => i.status === 'available').length;
    const soldCount = items.length - availableCount;
    return res.render('admin/product-stock', {
      product, items, availableCount, soldCount, maxStock: MAX_STOCK_PER_PRODUCT, error,
    });
  };

  const lines = (req.body.items || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return rerender('กรุณาใส่รายการไอดีอย่างน้อย 1 รายการ (พิมพ์บรรทัดละ 1 รายการ)');
  }

  const availableCount = db.prepare(`
    SELECT COUNT(*) c FROM stock_items WHERE product_id = ? AND status = 'available'
  `).get(product.id).c;

  if (availableCount + lines.length > MAX_STOCK_PER_PRODUCT) {
    const remainingSlots = Math.max(0, MAX_STOCK_PER_PRODUCT - availableCount);
    return rerender(
      `เพิ่มไม่ได้: สต็อกคงเหลือตอนนี้ ${availableCount} รายการ และเพิ่มขีดจำกัดสูงสุดต่อสินค้าคือ ${MAX_STOCK_PER_PRODUCT} รายการ `
      + `(เพิ่มได้อีกไม่เกิน ${remainingSlots} รายการ แต่คุณวางมา ${lines.length} รายการ)`
    );
  }

  const insert = db.prepare('INSERT INTO stock_items (product_id, content) VALUES (?, ?)');
  const tx = db.transaction((rows) => {
    rows.forEach((line) => insert.run(product.id, line));
    db.prepare(`
      UPDATE products SET stock = (SELECT COUNT(*) FROM stock_items WHERE product_id = ? AND status = 'available')
      WHERE id = ?
    `).run(product.id, product.id);
  });
  tx(lines);

  logActivity(req.session.user.id, 'เติมสต็อกสินค้า', `${product.title} +${lines.length} รายการ`);
  res.redirect(`/admin/products/${product.id}/stock`);
});

router.post('/products/:id/stock/:itemId/delete', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).render('error', { message: 'ไม่พบสินค้านี้' });

  const item = db.prepare('SELECT * FROM stock_items WHERE id = ? AND product_id = ?').get(req.params.itemId, product.id);
  // ลบได้เฉพาะไอดีที่ยังไม่ถูกขาย เพื่อไม่ให้กระทบประวัติคำสั่งซื้อที่ส่งไปแล้ว
  if (item && item.status === 'available') {
    db.prepare('DELETE FROM stock_items WHERE id = ?').run(item.id);
    db.prepare(`
      UPDATE products SET stock = (SELECT COUNT(*) FROM stock_items WHERE product_id = ? AND status = 'available')
      WHERE id = ?
    `).run(product.id, product.id);
    logActivity(req.session.user.id, 'ลบไอดีออกจากสต็อก', `${product.title} (item #${item.id})`);
  }

  res.redirect(`/admin/products/${product.id}/stock`);
});

// ---------- Members ----------
router.get('/members', (req, res) => {
  const members = db.prepare('SELECT id, username, role, tier, balance, created_at FROM users ORDER BY created_at DESC').all();
  res.render('admin/members', { members });
});

router.post('/members/:id/tier', (req, res) => {
  const { tier } = req.body;
  db.prepare('UPDATE users SET tier = ? WHERE id = ?').run(tier, req.params.id);
  logActivity(req.session.user.id, 'เปลี่ยนระดับสมาชิก', `user id ${req.params.id} -> ${tier}`);
  res.redirect('/admin/members');
});

// ---------- Orders (all customers) ----------
router.get('/orders', (req, res) => {
  const orders = db.prepare(`
    SELECT orders.*, users.username, products.title AS product_title
    FROM orders
    JOIN users ON users.id = orders.user_id
    JOIN products ON products.id = orders.product_id
    ORDER BY orders.created_at DESC
  `).all();
  res.render('admin/orders', { orders });
});

// ---------- Top-up approvals ----------
router.get('/topups', (req, res) => {
  const topups = db.prepare(`
    SELECT topups.*, users.username FROM topups
    JOIN users ON users.id = topups.user_id
    ORDER BY topups.created_at DESC
  `).all();
  res.render('admin/topups', { topups });
});

router.post('/topups/:id/approve', (req, res) => {
  const topup = db.prepare('SELECT * FROM topups WHERE id = ?').get(req.params.id);
  if (!topup || topup.status !== 'pending') return res.redirect('/admin/topups');

  const tx = db.transaction(() => {
    db.prepare(`UPDATE topups SET status = 'approved' WHERE id = ?`).run(topup.id);
    db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(topup.amount, topup.user_id);
  });
  tx();

  logActivity(req.session.user.id, 'อนุมัติการเติมเงิน', `topup id ${topup.id}, user id ${topup.user_id}`);
  res.redirect('/admin/topups');
});

router.post('/topups/:id/reject', (req, res) => {
  db.prepare(`UPDATE topups SET status = 'rejected' WHERE id = ? AND status = 'pending'`).run(req.params.id);
  logActivity(req.session.user.id, 'ปฏิเสธการเติมเงิน', `topup id ${req.params.id}`);
  res.redirect('/admin/topups');
});

// ---------- Activity log ----------
router.get('/logs', (req, res) => {
  const logs = db.prepare(`
    SELECT admin_activity_log.*, users.username FROM admin_activity_log
    JOIN users ON users.id = admin_activity_log.admin_id
    ORDER BY admin_activity_log.created_at DESC LIMIT 200
  `).all();
  res.render('admin/logs', { logs });
});

module.exports = router;
