import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import signalsRouter from "./routes/signals.js";



import { connectDB } from "./config/db.js";
import projectRoutes from "./routes/projects.js";
import agencyRoutes from "./routes/agencies.js";
import adminRoutes from "./routes/admin.js";
import uploadRoutes from "./routes/upload.js";
import authRoutes from "./routes/auth.js";
import {
  recoverInterruptedProjects,
  installShutdownHandlers,
  startStaleWatchdog,
} from "./utils/projectRecovery.js";

console.log(
  "[env] BRAVE_API_KEY:",
  process.env.BRAVE_API_KEY ? "Loaded" : "Missing"
);

const app = express();

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5177",
  process.env.CLIENT_ORIGIN,
].filter(Boolean);

app.use("/api/signals", signalsRouter);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin not allowed by CORS: ${origin}`));
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(morgan("dev"));
app.use("/api/auth", authRoutes);

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "autofiverr-backend" }));


app.use("/api/projects", projectRoutes);
app.use("/api/agencies", agencyRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/upload", uploadRoutes);

// Central error handler (multer errors, agent errors, etc.)
app.use((err, _req, res, _next) => {
  console.error("[unhandled]", err);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

const PORT = process.env.PORT || 5000;

connectDB()
  .then(async () => {
    // Recover projects that were running before this server started.
    await recoverInterruptedProjects();

    // Mark active projects as interrupted when the server shuts down.
    installShutdownHandlers();

    // Safety net for projects whose worker disappeared unexpectedly.
    startStaleWatchdog();

    app.listen(PORT, () => {
      console.log(
        `[server] AutoFiverr backend running on :${PORT}`
      );
    });
  })
  .catch((err) => {
    console.error("[server] MongoDB connection failed:", err);
    process.exitCode = 1;
  });
