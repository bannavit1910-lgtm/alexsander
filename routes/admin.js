const express = require('express');
const fs = require('fs');
const path = require('path');
const { requireAdmin } = require('../middleware/auth');
const upload = require('../middleware/upload');

// นำเข้า Models
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const StockItem = require('../models/StockItem');
const Topup = require('../models/Topup');
const AdminLog = require('../models/AdminLog');

const router = express.Router();
router.use(requireAdmin);

async function logActivity(adminId, action, detail) {
  await AdminLog.create({ admin_id: adminId, action, detail });
}

// ---------- Dashboard ----------
router.get('/', async (req, res) => {
  const productCount = await Product.countDocuments();
  const memberCount = await User.countDocuments({ role: 'member' });
  const pendingTopups = await Topup.countDocuments({ status: 'pending' });
  
  // ยอดขายวันนี้ (MongoDB Date aggregation)
  const today = new Date();
  today.setHours(0,0,0,0);
  const salesTodayRes = await Order.aggregate([
    { $match: { createdAt: { $gte: today }, status: 'completed' } },
    { $group: { _id: null, total: { $sum: '$price_paid' } } }
  ]);
  const salesToday = salesTodayRes.length > 0 ? salesTodayRes[0].total : 0;

  res.render('admin/dashboard', { productCount, memberCount, pendingTopups, salesToday });
});

// ---------- Products CRUD ----------
router.get('/products', async (req, res) => {
  const products = await Product.find().sort({ createdAt: -1 });
  res.render('admin/products', { products });
});

router.post('/products/new', upload.single('image'), async (req, res) => {
  const { title, price, ...body } = req.body;
  const imagePath = req.file ? `/uploads/${req.file.filename}` : null;
  const product = await Product.create({ 
    ...body, title, price: Math.round(parseFloat(price) * 100), image_path: imagePath 
  });
  await logActivity(req.session.user.id, 'สร้างสินค้าใหม่', title);
  res.redirect(`/admin/products/${product._id}/stock`);
});

router.post('/products/:id/edit', upload.single('image'), async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (req.file && product.image_path) {
    fs.unlink(path.join(__dirname, '..', 'public', product.image_path), () => {});
  }
  await Product.findByIdAndUpdate(req.params.id, { 
    ...req.body, price: Math.round(parseFloat(req.body.price) * 100),
    image_path: req.file ? `/uploads/${req.file.filename}` : product.image_path 
  });
  await logActivity(req.session.user.id, 'แก้ไขสินค้า', req.body.title);
  res.redirect('/admin/products');
});

// ---------- Stock Management ----------
router.get('/products/:id/stock', async (req, res) => {
  const product = await Product.findById(req.params.id);
  const items = await StockItem.find({ product_id: product._id }).populate('order_id');
  res.render('admin/product-stock', { product, items });
});

router.post('/products/:id/stock/add', async (req, res) => {
  const lines = req.body.items.split('\n').map(l => l.trim()).filter(l => l);
  const docs = lines.map(line => ({ product_id: req.params.id, content: line }));
  await StockItem.insertMany(docs);
  
  // อัปเดตจำนวนสต็อก
  const count = await StockItem.countDocuments({ product_id: req.params.id, status: 'available' });
  await Product.findByIdAndUpdate(req.params.id, { stock: count });
  
  res.redirect(`/admin/products/${req.params.id}/stock`);
});

// ---------- Members & Orders & Topups ----------
router.get('/members', async (req, res) => {
  const members = await User.find().sort({ createdAt: -1 });
  res.render('admin/members', { members });
});

router.post('/topups/:id/approve', async (req, res) => {
  const topup = await Topup.findById(req.params.id);
  if (topup && topup.status === 'pending') {
    await Topup.findByIdAndUpdate(req.params.id, { status: 'approved' });
    await User.findByIdAndUpdate(topup.user_id, { $inc: { balance: topup.amount } });
    await logActivity(req.session.user.id, 'อนุมัติการเติมเงิน', topup._id.toString());
  }
  res.redirect('/admin/topups');
});

router.get('/logs', async (req, res) => {
  const logs = await AdminLog.find().populate('admin_id').sort({ createdAt: -1 }).limit(200);
  res.render('admin/logs', { logs });
});

module.exports = router;
