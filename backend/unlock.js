// unlock.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// Adjust the Mongo URI if in your .env or local
const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/autofiverr';

async function unlock() {
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');

  // 1. See what projects are currently marked as running:
  const running = await mongoose.connection.collection('projects').find({ status: 'running' }).toArray();
  console.log('Found running projects:', running.map(p => ({ id: p._id, name: p.name || p.title, status: p.status })));

  // 2. Clear any stuck running states to interrupted:
  const result = await mongoose.connection.collection('projects').updateMany(
    { status: 'running' },
    { $set: { status: 'interrupted', error: 'Reset stuck workflow lock' } }
  );
  console.log(`Cleared ${result.modifiedCount} stuck running project(s).`);

  // 3. (Optional) Force start the legal firm project directly:
  // await mongoose.connection.collection('projects').updateOne(
  //   { _id: new mongoose.Types.ObjectId('6acd22b1b80c688924c6b3a1') },
  //   { $set: { status: 'pending' } }
  // );

  await mongoose.disconnect();
  console.log('Done! Now refresh your browser or trigger the workflow again.');
}

unlock().catch(console.error);