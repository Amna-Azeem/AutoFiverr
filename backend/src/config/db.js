import mongoose from "mongoose";

export async function connectDB() {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/autofiverr";
  try {
    await mongoose.connect(uri);
    console.log(`[db] connected -> ${mongoose.connection.host}/${mongoose.connection.name}`);
  } catch (err) {
    const message = String(err.message).replace(/mongodb(?:\+srv)?:\/\/\S+/gi, "<mongodb-uri>");
    console.error("[db] connection failed:", message);
    throw err;
  }
}
