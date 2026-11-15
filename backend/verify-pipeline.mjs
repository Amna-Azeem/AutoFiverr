import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Project from "./src/models/Project.js";

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), ".env") });

const apiUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
const userId = new mongoose.Types.ObjectId().toString();
const token = jwt.sign({ id: userId, role: "admin" }, process.env.JWT_SECRET, { expiresIn: "20m" });
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const input = {
  title: "Seven-agent pipeline verification",
  goal: "Find Canadian cybersecurity SaaS companies that may benefit from outbound sales operations support.",
  industry: "Cybersecurity SaaS",
  targetAudience: "B2B cybersecurity software companies",
  geographicFocus: "Canada",
  researchFocus: "Public launches, hiring, funding, partnerships, and product updates",
  clientServiceSummary: "B2B outbound sales operations and CRM implementation services",
  maxLeads: 2,
  targetCompanies: [],
};

let projectId = process.env.PIPELINE_PROJECT_ID;
if (!projectId) {
  const createResponse = await fetch(`${apiUrl}/api/projects`, {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });
  const created = await createResponse.json();
  if (!createResponse.ok) throw new Error(`Project creation failed (${createResponse.status}): ${created.error}`);
  projectId = created.project._id;
}
console.log(`TEST_PROJECT_ID=${projectId} MAX_LEADS=${input.maxLeads}`);

const tokenResponse = await fetch(`${apiUrl}/api/projects/${projectId}/stream-token`, { headers });
const streamToken = await tokenResponse.json();
if (!tokenResponse.ok) throw new Error(`SSE token request failed (${tokenResponse.status}): ${streamToken.error}`);
const streamResponse = await fetch(`${apiUrl}/api/projects/${projectId}/stream?token=${encodeURIComponent(streamToken.token)}`, {
  headers: { Accept: "text/event-stream" },
});
console.log(`SSE_STATUS=${streamResponse.status} CONTENT_TYPE=${streamResponse.headers.get("content-type")}`);
if (!streamResponse.ok || !streamResponse.headers.get("content-type")?.startsWith("text/event-stream")) {
  throw new Error("Authenticated SSE stream did not return event-stream headers");
}
const reader = streamResponse.body.getReader();
await reader.read();
await reader.cancel();

await mongoose.connect(process.env.MONGODB_URI);
try {
  const deadline = Date.now() + 12 * 60 * 1000;
  let project;
  while (Date.now() < deadline) {
    project = await Project.findById(projectId).lean();
    if (!project) throw new Error("Created project disappeared from MongoDB");
    const runs = project.agentRuns || [];
    console.log(`PROJECT_STATUS=${project.status} AGENT_RUNS=${runs.length} CURRENT_AGENT=${project.currentAgent || "none"}`);
    if (["completed", "failed"].includes(project.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  if (!project || !["completed", "failed"].includes(project.status)) {
    throw new Error("Pipeline did not finish within 12 minutes");
  }

  const runs = project.agentRuns || [];
  const stringRuns = runs.every((run) => typeof run.input === "string" && typeof run.output === "string");
  const reportTrace = Array.isArray(project.report?.agentResults);
  const leadShape = (project.leads || []).every((lead) =>
    ["leadId", "companyName", "website", "verifiedEvidence", "email", "subject", "usedEvidence", "qa", "sources"]
      .every((field) => Object.hasOwn(lead, field))
  );
  const globalStages = ["Target Profiler", "Candidate Discovery"];
  const stagesPresent = globalStages.every((stage) => runs.some((run) => run.agent === stage));
  const companyNames = runs
    .map((run) => run.agent.match(/^Company Scraper\s+—\s+(.+)$/)?.[1])
    .filter(Boolean);
  const companyStages = ["Company Scraper", "Content Relevance Filter", "Evidence Verification", "Outreach Writer", "Outreach QA", "CRM Structurer"];
  const orderedCompany = companyNames.find((company) => {
    const indexes = companyStages.map((stage) => runs.findIndex((run) => run.agent === `${stage} — ${company}`));
    return indexes.every((index) => index >= 0) && indexes.every((index, position) => position === 0 || index > indexes[position - 1]);
  });

  console.log(`FINAL_STATUS=${project.status} MAX_LEADS=${project.maxLeads} LEADS=${project.leads?.length || 0}`);
  console.log(`AGENT_SEQUENCE=${runs.map((run) => run.agent).join(" -> ")}`);
  console.log(`AGENT_RUN_RESULTS=${JSON.stringify(runs.map((run) => ({ agent: run.agent, status: run.status, output: String(run.output || "").slice(0, 220) })))}`);
  console.log(`FAILED_COMPANIES=${JSON.stringify(project.failedCompanies || [])}`);
  console.log(`AGENT_RUN_INPUT_OUTPUT_STRINGS=${stringRuns}`);
  console.log(`REPORT_AGENT_RESULTS=${reportTrace}`);
  console.log(`CANONICAL_LEAD_SHAPE=${leadShape}`);
  console.log(`COMPLETE_COMPANY_SEQUENCE=${orderedCompany || "none"}`);

  if (project.leads?.length) {
    const csvResponse = await fetch(`${apiUrl}/api/projects/${projectId}/export.csv`, { headers });
    const csvText = await csvResponse.text();
    const csvOk = csvResponse.ok && csvResponse.headers.get("content-disposition")?.includes("attachment") && csvText.includes(project.leads[0].companyName);
    const wordResponse = await fetch(`${apiUrl}/api/projects/${projectId}/export.docx`, { headers });
    const wordBytes = new Uint8Array(await wordResponse.arrayBuffer());
    const wordOk = wordResponse.ok
      && wordResponse.headers.get("content-disposition")?.includes("attachment")
      && wordBytes[0] === 0x50
      && wordBytes[1] === 0x4b;
    console.log(`CSV_ATTACHMENT_OK=${csvOk}`);
    console.log(`WORD_ATTACHMENT_OK=${wordOk}`);
    if (!csvOk || !wordOk) throw new Error("CRM attachment download verification failed");
  }

  if (project.maxLeads !== 2 || !stringRuns || !reportTrace || !leadShape || !stagesPresent || !orderedCompany) {
    throw new Error("Pipeline verification failed: required stages, report/lead schema, or string serialization is missing");
  }
} finally {
  await mongoose.disconnect();
}