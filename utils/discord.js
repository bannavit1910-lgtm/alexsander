/**
 * ส่งข้อความแจ้งเตือนไปยัง Discord ผ่าน Webhook URL
 * ต้องตั้งค่า DISCORD_WEBHOOK_URL ใน .env ก่อน ไม่งั้นจะข้ามการแจ้งเตือนเงียบๆ (ไม่ทำให้แอปพัง)
 */
async function notifyDiscord({ title, description }) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [
          {
            title,
            description,
            color: 0xe8b54b,
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });
  } catch (err) {
    console.error('ส่งแจ้งเตือน Discord ไม่สำเร็จ:', err.message);
  }
}

module.exports = { notifyDiscord };
