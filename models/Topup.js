const mongoose = require('mongoose');

const topupSchema = new mongoose.Schema({
  user_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  amount: { 
    type: Number, 
    required: true // เก็บเป็นสตางค์
  },
  method: { 
    type: String, 
    default: 'truemoney' 
  },
  reference: { 
    type: String // เช่น เบอร์โทร หรือ รหัสอ้างอิงสลิป
  },
  status: { 
    type: String, 
    default: 'pending' // pending | approved | rejected
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

module.exports = mongoose.model('Topup', topupSchema);
