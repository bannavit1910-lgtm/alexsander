const mongoose = require('mongoose');

const stockItemSchema = new mongoose.Schema({
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  content: { type: String, required: true },
  status: { type: String, default: 'available' }, // available | sold
  order_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('StockItem', stockItemSchema);
