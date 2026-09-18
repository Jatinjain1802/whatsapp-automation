import mongoose from 'mongoose';
import { config } from './config.js';

export async function connectDb() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(config.mongoUri, {
    maxPoolSize: config.mongo.maxPoolSize,
    serverSelectionTimeoutMS: 10_000, // fail fast on a wrong URI/IP allowlist
    socketTimeoutMS: 45_000,
  });
  mongoose.connection.on('error', (err) => console.error('[db] error', err.message));
  mongoose.connection.on('disconnected', () => console.warn('[db] disconnected'));
  console.log('[db] connected to MongoDB');
}

export async function disconnectDb() {
  await mongoose.disconnect();
}
