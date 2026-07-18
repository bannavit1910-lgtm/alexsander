const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcrypt');

const db = new Database(path.join(__dirname, 'data', 'store.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',      -- 'member' | 'admin'
  tier TEXT NOT NULL DEFAULT 'Member',      -- Member / VIP / MVP
  balance INTEGER NOT NULL DEFAULT 0,       -- เก็บเป็นสตางค์ (บาท * 100) เพื่อเลี่ยงปัญหา float
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'ทั่วไป',
  rarity TEXT NOT NULL DEFAULT 'rare',      -- rare | epic | legend
  price INTEGER NOT NULL,                   -- สตางค์
  image_path TEXT,
  stock INTEGER NOT NULL DEFAULT 1,
  is_best_seller INTEGER NOT NULL DEFAULT 0,
  discount_percent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  price_paid INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed', -- completed | pending | cancelled
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS topups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,                  -- สตางค์
  method TEXT NOT NULL DEFAULT 'truemoney',
  reference TEXT,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS admin_activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- คลังไอดี/สต็อกจริงของแต่ละสินค้า: 1 แถว = 1 ไอดีที่ส่งให้ลูกค้าได้ 1 ครั้ง
CREATE TABLE IF NOT EXISTS stock_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  content TEXT NOT NULL,                    -- ข้อมูลไอดี/บัญชีที่จะส่งให้ลูกค้า (เช่น user:pass หรือรายละเอียดอื่นๆ)
  status TEXT NOT NULL DEFAULT 'available', -- available | sold
  order_id INTEGER,                         -- อ้างอิงคำสั่งซื้อที่ถูกใช้ไอดีนี้ไป
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(product_id) REFERENCES products(id),
  FOREIGN KEY(order_id) REFERENCES orders(id)
);
CREATE INDEX IF NOT EXISTS idx_stock_items_product_status ON stock_items(product_id, status);

-- กันซองอั่งเปาลิงก์เดียวกันถูกอนุมัติ/เติมเงินเข้าบัญชีซ้ำสองครั้ง
CREATE UNIQUE INDEX IF NOT EXISTS idx_topups_reference_approved
  ON topups(reference) WHERE status = 'approved' AND reference IS NOT NULL AND reference != '';
`);

// migration เบื้องต้น: เพิ่มคอลัมน์ delivered_content ให้ตาราง orders ถ้ายังไม่มี
// (เก็บสำเนาไอดีที่ส่งไปตอนซื้อ ไว้แสดงในประวัติคำสั่งซื้อ แม้จะลบแถวใน stock_items ไปแล้วก็ตาม)
const orderColumns = db.prepare('PRAGMA table_info(orders)').all().map((c) => c.name);
if (!orderColumns.includes('delivered_content')) {
  db.exec('ALTER TABLE orders ADD COLUMN delivered_content TEXT');
}

// สร้างบัญชีแอดมินเริ่มต้น ถ้ายังไม่มีผู้ใช้ในระบบเลย
const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
if (userCount === 0) {
  const hash = bcrypt.hashSync('changeme123', 10);
  db.prepare(`INSERT INTO users (username, password_hash, role, tier) VALUES (?, ?, 'admin', 'MVP')`)
    .run('admin', hash);
  console.log('สร้างบัญชีแอดมินเริ่มต้นแล้ว -> username: admin / password: changeme123 (กรุณาเปลี่ยนรหัสผ่านทันทีหลังเข้าใช้งานครั้งแรก)');
}

module.exports = db;
