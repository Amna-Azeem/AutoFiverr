import mongoose from "mongoose";
import dotenv from "dotenv";
import Project from "../models/Project.js";

dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const result = await Project.updateMany(
      {},
      {
        $set: {
          userId: new mongoose.Types.ObjectId(
            "6abd2a4376d21028f40e873e"
          ),
        },
      }
    );

    console.log("Update result:", result);

    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();