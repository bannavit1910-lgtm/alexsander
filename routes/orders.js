const express = require('express');
const db = require('../db');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

router.get('/dashboard', requireLogin, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  const orders = db.prepare(`
    SELECT orders.*, products.title AS product_title, products.image_path
    FROM orders JOIN products ON products.id = orders.product_id
    WHERE orders.user_id = ?
    ORDER BY orders.created_at DESC
  `).all(user.id);

  const topups = db.prepare('SELECT * FROM topups WHERE user_id = ? ORDER BY created_at DESC').all(user.id);

  res.render('dashboard', {
    user,
    orders,
    topups,
    justBought: req.query.bought === '1',
  });
});

module.exports = router;
