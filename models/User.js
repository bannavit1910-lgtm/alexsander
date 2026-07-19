const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true 
  },
  password_hash: { 
    type: String, 
    required: true 
  },
  role: { 
    type: String, 
    default: 'member' // 'member' | 'admin'
  },
  tier: { 
    type: String, 
    default: 'Member' // 'Member' | 'VIP' | 'MVP'
  },
  balance: { 
    type: Number, 
    default: 0 // เก็บเป็นสตางค์
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

module.exports = mongoose.model('User', userSchema);
