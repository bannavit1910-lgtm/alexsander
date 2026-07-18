const express = require('express');
const twvoucherModule = require('@fortune-inc/tw-voucher');
// บาง environment/เวอร์ชันของแพ็กเกจนี้ export เป็น { default: fn } แทนที่จะเป็นฟังก์ชันตรงๆ
// เช็คไว้กันเหนียว ไม่ให้พังเวลาโครงสร้าง export เปลี่ยนไป
const twvoucher = typeof twvoucherModule === 'function'
  ? twvoucherModule
  : (typeof twvoucherModule.default === 'function' ? twvoucherModule.default : null);

if (typeof twvoucher !== 'function') {
  console.error('[topup] คำเตือน: โหลด @fortune-inc/tw-voucher ไม่สำเร็จ รูปแบบที่ได้คือ:', typeof twvoucherModule, Object.keys(twvoucherModule || {}));
}
const db = require('../db');
const { requireLogin } = require('../middleware/auth');
const { notifyDiscord } = require('../utils/discord');

const router = express.Router();

async function verifyTruemoneyVoucher(voucherLink) {
  if (typeof twvoucher !== 'function') {
    return { verified: false, amountSatang: null, reason: 'โหลดไลบรารีแลกซองไม่สำเร็จ (twvoucher ไม่ใช่ฟังก์ชัน) กรุณาแจ้งผู้ดูแลระบบ' };
  }
  const phone = (process.env.TRUEMONEY_PHONE || '').trim();
  if (!phone) {
    return { verified: false, amountSatang: null, reason: 'ยังไม่ได้ตั้งค่า TRUEMONEY_PHONE ในไฟล์ .env กรุณารอแอดมินตรวจสอบ' };
  }
  if (!voucherLink) {
    return { verified: false, amountSatang: null, reason: 'ไม่ได้แนบลิงก์/รหัสซองอั่งเปา กรุณารอแอดมินตรวจสอบด้วยมือ' };
  }

  try {
    const redeemed = await twvoucher(phone, voucherLink);
    const amountSatang = Math.round(parseFloat(redeemed.amount) * 100);
    if (!amountSatang || amountSatang <= 0) {
      return { verified: false, amountSatang: null, reason: 'แลกซองสำเร็จแต่ยอดเงินไม่ถูกต้อง' };
    }
    return { verified: true, amountSatang, ownerName: redeemed.owner_full_name || null };
  } catch (err) {
    return { verified: false, amountSatang: null, reason: `แลกซองไม่สำเร็จ: ${err.message || 'ไม่ทราบสาเหตุ'}` };
  }
}

router.post('/topup', requireLogin, async (req, res) => {
  const amountBaht = parseFloat(req.body.amount);
  const reference = (req.body.reference || '').trim();

  if (!reference) {
    return res.status(400).render('error', { message: 'กรุณาแนบลิงก์หรือรหัสซองอั่งเปา TrueMoney' });
  }

  const existing = db.prepare(
    `SELECT id FROM topups WHERE reference = ? AND status = 'approved'`
  ).get(reference);
  if (existing) {
    return res.status(400).render('error', { message: 'ซองอั่งเปานี้ถูกใช้ไปแล้ว' });
  }

  const placeholderAmountSatang = Number.isFinite(amountBaht) && amountBaht > 0 ? Math.round(amountBaht * 100) : 0;

  let info;
  try {
    info = db.prepare(
      `INSERT INTO topups (user_id, amount, method, reference, status) VALUES (?, ?, 'truemoney', ?, 'pending')`
    ).run(req.session.user.id, placeholderAmountSatang, reference);
  } catch (err) {
    return res.status(400).render('error', { message: 'คำขอนี้ถูกส่งไปแล้ว กรุณารอแอดมินตรวจสอบ' });
  }

  const check = await verifyTruemoneyVoucher(reference);
  if (!check.verified) {
    console.error('[topup] แลกซองไม่สำเร็จ:', check.reason, '| reference:', reference);
  }
  let creditedAmountSatang = 0;

  if (check.verified) {
    creditedAmountSatang = check.amountSatang;
    try {
      db.prepare(`UPDATE topups SET status = 'approved', amount = ? WHERE id = ?`)
        .run(creditedAmountSatang, info.lastInsertRowid);
      db.prepare(`UPDATE users SET balance = balance + ? WHERE id = ?`)
        .run(creditedAmountSatang, req.session.user.id);
    } catch (err) {
      db.prepare(`UPDATE topups SET status = 'rejected' WHERE id = ?`).run(info.lastInsertRowid);
      check.verified = false;
      check.reason = 'ซองนี้ถูกใช้ไปแล้วจากคำขอที่เข้ามาพร้อมกัน';
      creditedAmountSatang = 0;
    }
  }

  await notifyDiscord({
    title: check.verified ? 'เติมเงินสำเร็จอัตโนมัติ (ซองอั่งเปา)' : 'มีรายการเติมเงินใหม่ (รอตรวจสอบ)',
    description: [
      `ผู้ใช้: **${req.session.user.username}**`,
      check.verified
        ? `จำนวนที่ยืนยันจริง: **฿${(creditedAmountSatang / 100).toFixed(2)}**${check.ownerName ? ` (จากซองของ ${check.ownerName})` : ''}`
        : `เหตุผล: ${check.reason}`,
      `สถานะ: ${check.verified ? 'อนุมัติอัตโนมัติ' : 'รอแอดมินตรวจสอบ'}`,
    ].join('\n'),
  });

  res.redirect('/dashboard?topup=1');
});

module.exports = router;
