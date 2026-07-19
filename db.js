const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        // ดึงค่าจาก Environment Variables
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error('Error connecting to MongoDB:', error.message);
        process.exit(1); // หยุดการทำงานถ้าเชื่อมต่อไม่ได้
    }
};

module.exports = connectDB;