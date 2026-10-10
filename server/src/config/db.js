import 'dotenv/config';
import mongoose from 'mongoose';

export const connectDB = async () => {
  try {
    const mongoUri =
      process.env.MONGO_URI ||
      process.env.MONGO_URL ||
      'mongodb://127.0.0.1:27017/cloudnest';

    const options = {
      dbName: process.env.DB_NAME || 'cloudnest',
      serverSelectionTimeoutMS: 10000,
    };

    const conn = await mongoose.connect(mongoUri, options);

    console.log('MongoDB connected');
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[Database] Host: ${conn.connection.host} | DB: ${conn.connection.name}`);
    }

    mongoose.connection.on('error', (err) => {
      console.error('[Database Error] Connection runtime error:', err.message);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('[Database] MongoDB disconnected. Attempting reconnect...');
    });

    return conn;
  } catch (error) {
    console.error(`[Database Error] Connection failed: ${error.message}`);
    if (
      error.name === 'MongooseServerSelectionError' ||
      error.message.includes('whitelist') ||
      error.message.includes('querySrv')
    ) {
      console.error(
        '[Database Tip] If connecting to MongoDB Atlas:\n' +
        '  1. Verify your current IP address is whitelisted in Atlas -> Network Access (or allow 0.0.0.0/0).\n' +
        '  2. Ensure the database user password does not contain unencoded special characters.\n' +
        '  3. Verify that server/.env is saved (Ctrl + S).'
      );
    }
    process.exit(1);
  }
};

export default connectDB;
