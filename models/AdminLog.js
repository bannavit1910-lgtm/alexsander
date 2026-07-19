// models/AdminLog.js
const mongoose = require('mongoose');
const adminLogSchema = new mongoose.Schema({
  admin_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  action: String,
  detail: String,
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('AdminLog', adminLogSchema);