import mongoose from "mongoose";

const AgencySchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    tagline: { type: String },
    description: { type: String },
    status: { type: String, enum: ["active", "coming_soon"], default: "coming_soon" },
    agentCount: { type: Number, default: 6 },
    agentRoster: [{ type: String }],
  },
  { timestamps: true }
);

export default mongoose.model("Agency", AgencySchema);
