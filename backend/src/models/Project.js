import mongoose from "mongoose";

const AgentLogSchema = new mongoose.Schema(
  {
    agent: { type: String, required: true },
    message: { type: String, required: true },
    level: { type: String, enum: ["info", "warn", "error", "success"], default: "info" },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const SourceSchema = new mongoose.Schema(
  {
    id: Number,
    title: String,
    url: String,
    verificationMethod: String,
    verifiedAt: String,
  },
  { _id: false, strict: false }
);

const VerifiedEvidenceSchema = new mongoose.Schema(
  {
    signal: String,
    reason: String,
    sourceTitle: String,
    sourceUrl: String,
    excerpt: String,
    citationId: Number,
    verified: Boolean,
    sourceCheck: String,
    verifiedAt: String,
  },
  { _id: false, strict: false }
);

const FailedCompanySchema = new mongoose.Schema(
  {
    companyName: String,
    stage: String,
    error: String,
  },
  { _id: false }
);

const LeadSchema = new mongoose.Schema(
  {
    leadId: String,
    companyName: String,
    website: String,
    verifiedEvidence: [VerifiedEvidenceSchema],
    email: String,
    subject: String,
    usedEvidence: [{ type: mongoose.Schema.Types.Mixed }],
    qa: { type: mongoose.Schema.Types.Mixed, default: null },
    sources: [SourceSchema],
    createdAt: String,
  },
  { _id: false, strict: false }
);

const ProjectSchema = new mongoose.Schema(
  {
    userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  }, 
    title: { type: String, required: true },
    agencySlug: { type: String, required: true, default: "smart-lead-finder" },
    goal: { type: String, required: true },
    clientCompanyName: { type: String },
    industry: { type: String },
    targetAudience: { type: String },
    geographicFocus: { type: String },
    researchFocus: { type: String },
    targetCompanies: [{ type: String }],
    clientServiceSummary: { type: String },
    maxLeads: { type: Number, default: 10 },

    uploadedFiles: [
      {
        originalName: String,
        storedPath: String,
        parsedTextExcerpt: String,
        uploadedAt: { type: Date, default: Date.now },
      },
    ],

    status: {
      type: String,
      enum: ["queued", "running", "completed", "failed"],
      default: "queued",
    },
    currentAgent: { type: String, default: null },

    agentLogs: [AgentLogSchema],
    agentRuns: [
      {
        agent: String,
        input: String,
        output: String,
        status: { type: String, default: "success" },
        timestamp: { type: Date, default: Date.now },
      },
    ],

    researchCriteria: { type: mongoose.Schema.Types.Mixed, default: null },
    leads: [LeadSchema],
    failedCompanies: { type: [FailedCompanySchema], default: [] },
    report: { type: mongoose.Schema.Types.Mixed, default: null },
    crmExport: {
      json: { type: mongoose.Schema.Types.Mixed, default: null },
      csv: { type: String, default: null },
      files: { type: mongoose.Schema.Types.Mixed, default: null },
    },

    stats: {
      startedAt: Date,
      completedAt: Date,
      durationMs: Number,
      leadsFound: { type: Number, default: 0 },
      searchQueriesRun: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

export default mongoose.model("Project", ProjectSchema);
