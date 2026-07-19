const mongoose = require('mongoose');

const connectDB = async () => {
    const uri = process.env.MONGO_URI;
    if (!uri) {
        console.error('Error connecting to MongoDB: ไม่พบ MONGO_URI ใน environment variables');
        process.exit(1);
    }

    // log แบบไม่โชว์รหัสผ่านเต็มๆ กันเห็นในล็อกสาธารณะ
    console.log('[db] กำลังเชื่อมต่อ MongoDB ที่:', uri.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:****@'));

    mongoose.connection.on('error', (err) => {
        console.error('[db] Mongoose connection error event:', err.message);
    });
    mongoose.connection.on('disconnected', () => {
        console.warn('[db] Mongoose disconnected');
    });

    try {
        const conn = await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 8000, // ไม่ต้องรอนานเป็นนาทีถ้าต่อไม่ติดจริงๆ
        });
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error('Error connecting to MongoDB:', error.message);
        console.error('[db] รายละเอียดเพิ่มเติม:', error.name, error.code || '');
        process.exit(1); // หยุดการทำงานถ้าเชื่อมต่อไม่ได้
    }
};

module.exports = connectDB;
