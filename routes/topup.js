const express = require('express');
const twvoucherModule = require('@fortune-inc/tw-voucher');
const Topup = require('../models/Topup'); // เรียกใช้ Topup Model
const User = require('../models/User');   // เรียกใช้ User Model
const { requireLogin } = require('../middleware/auth');
const { notifyDiscord } = require('../utils/discord');

const router = express.Router();

// จัดการเรื่อง export ของ @fortune-inc/tw-voucher
const twvoucher = typeof twvoucherModule === 'function'
  ? twvoucherModule
  : (typeof twvoucherModule.default === 'function' ? twvoucherModule.default : null);

if (typeof twvoucher !== 'function') {
  console.error('[topup] คำเตือน: โหลด @fortune-inc/tw-voucher ไม่สำเร็จ รูปแบบที่ได้คือ:', typeof twvoucherModule, Object.keys(twvoucherModule || {}));
}

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
  try {
    const amountBaht = parseFloat(req.body.amount);
    const reference = (req.body.reference || '').trim();

    if (!reference) {
      return res.status(400).render('error', { message: 'กรุณาแนบลิงก์หรือรหัสซองอั่งเปา TrueMoney' });
    }

    // เช็คว่ามีซองนี้ที่อนุมัติไปแล้วหรือไม่ (MongoDB)
    const existing = await Topup.findOne({ reference: reference, status: 'approved' });
    if (existing) {
      return res.status(400).render('error', { message: 'ซองอั่งเปานี้ถูกใช้ไปแล้ว' });
    }

    const placeholderAmountSatang = Number.isFinite(amountBaht) && amountBaht > 0 ? Math.round(amountBaht * 100) : 0;

    // สร้างรายการเติมเงินใหม่ในสถานะ pending
    let newTopup;
    try {
      newTopup = await Topup.create({
        user_id: req.session.user.id,
        amount: placeholderAmountSatang,
        method: 'truemoney',
        reference: reference,
        status: 'pending'
      });
    } catch (err) {
      return res.status(400).render('error', { message: 'คำขอนี้ถูกส่งไปแล้ว หรือเกิดข้อผิดพลาด กรุณารอแอดมินตรวจสอบ' });
    }

    const check = await verifyTruemoneyVoucher(reference);
    if (!check.verified) {
      console.error('[topup] แลกซองไม่สำเร็จ:', check.reason, '| reference:', reference);
    }
    let creditedAmountSatang = 0;

    if (check.verified) {
      creditedAmountSatang = check.amountSatang;
      try {
        // อัปเดตสถานะ Topup เป็น approved
        newTopup.status = 'approved';
        newTopup.amount = creditedAmountSatang;
        await newTopup.save();

        // อัปเดตยอดเงิน User
        const user = await User.findById(req.session.user.id);
        user.balance += creditedAmountSatang;
        await user.save();
      } catch (err) {
        newTopup.status = 'rejected';
        await newTopup.save();
        check.verified = false;
        check.reason = 'เกิดข้อผิดพลาดในการอัปเดตยอดเงิน อาจเกิดจากการทำรายการซ้ำซ้อน';
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
  } catch (error) {
    console.error('Topup Route Error:', error);
    res.status(500).render('error', { message: 'ระบบเกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง' });
  }
});

module.exports = router;
