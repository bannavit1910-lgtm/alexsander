const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  title: { 
    type: String, 
    required: true 
  },
  description: { 
    type: String 
  },
  category: { 
    type: String, 
    default: 'ทั่วไป' 
  },
  rarity: { 
    type: String, 
    default: 'rare' // rare | epic | legend
  },
  price: { 
    type: Number, 
    required: true // เก็บเป็นสตางค์ (บาท * 100)
  },
  image_path: { 
    type: String 
  },
  stock: { 
    type: Number, 
    default: 1 
  },
  is_best_seller: { 
    type: Number, 
    default: 0 // 0 = ไม่ใช่, 1 = ใช่
  },
  discount_percent: { 
    type: Number, 
    default: 0 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

module.exports = mongoose.model('Product', productSchema);
