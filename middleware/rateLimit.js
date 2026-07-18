/**
 * Rate limiter แบบง่าย เก็บสถานะไว้ใน memory (เหมาะกับ dev/เซิร์ฟเวอร์เดียว)
 * ถ้า deploy แบบหลาย instance ควรเปลี่ยนไปใช้ store กลาง เช่น Redis แทน
 */
function rateLimit({ windowMs = 60000, max = 100 } = {}) {
  const hits = new Map();

  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const entry = hits.get(key) || { count: 0, start: now };

    if (now - entry.start > windowMs) {
      entry.count = 0;
      entry.start = now;
    }
    entry.count += 1;
    hits.set(key, entry);

    if (entry.count > max) {
      return res.status(429).render('error', { message: 'คุณส่งคำขอถี่เกินไป กรุณารอสักครู่แล้วลองใหม่' });
    }
    next();
  };
}

module.exports = rateLimit;
