import path from "node:path";
import Project from "../models/Project.js";
import { makeLogger } from "../utils/logger.js";
import { runWithLiveLog } from "../utils/liveLog.js";
import { registerRun, unregisterRun } from "../utils/projectRecovery.js";
import { findContactEmails } from "../agents/contactFinder.js";
import { runTargetProfiler } from "../agents/targetProfilerAgent.js";
import { runCandidateDiscovery } from "../agents/candidateDiscoveryAgent.js";
import { runCompanyScraper } from "../agents/companyScraperAgent.js";
import { runContentRelevanceFilter } from "../agents/contentRelevanceFilterAgent.js";
import { runEvidenceVerification } from "../agents/evidenceVerificationAgent.js";
import { runOutreachWriter } from "../agents/outreachWriter.js";
import { formatEmailLayout, buildSignature, fillSignature, emailSimilarity } from "../agents/emailFormat.js";
import { runOutreachQa } from "../agents/outreachQualityGateAgent.js";
import { pushLeadToHubspot } from "../agents/hubspotPush.js";

import {
  runCrmStructurer,
  buildCrmCsv,
  buildProjectReport,
  exportLeads,
} from "../agents/crmStructurerAgent.js";

const AGENT_NAMES = {
  1: "Target Profiler",
  2: "Candidate Discovery",
  3: "Company Scraper",
  4: "Content Relevance Filter",
  5: "Evidence Verification",
  6: "Outreach Writer",
  6.5: "Outreach QA",
  7: "CRM Structurer",
};

const EXPORT_DIR = process.env.EXPORT_DIR || path.resolve(process.cwd(), "exports");

// How many times discovery may be re-run (next result page) when too few leads survived the need checks.
const MAX_DISCOVERY_ROUNDS = Math.max(1, Number(process.env.MAX_DISCOVERY_ROUNDS) || 3);
// A company that exists is a lead even with no public email: it is kept with whatever route exists (contact form,
// LinkedIn, phone, or none) and flagged. Set ALLOW_NO_CONTACT=false to drop leads with no contact route at all.
const ALLOW_NO_CONTACT = process.env.ALLOW_NO_CONTACT !== "false";
// How many companies are processed at the same time (each one makes several network and LLM calls).
const CANDIDATE_CONCURRENCY = Math.max(1, Math.min(6, Number(process.env.CANDIDATE_CONCURRENCY) || 3));

// Written into the agent label so a discard/failure is visible in "Agent progress"
// even if the frontend badge only knows "Completed".
const STATUS_SUFFIX = {
  discarded: " — DISCARDED",
  failed: " — FAILED",
};

function hostKey(candidate) {
  try {
    return new URL(candidate.website).host.toLowerCase().replace(/^www\./, "");
  } catch {
    return `name:${String(candidate?.companyName || "").toLowerCase()}`;
  }
}

function mergeDiscovery(prev, next) {
  if (!prev) return next;
  return {
    ...next,
    candidates: [...(prev.candidates || []), ...(next.candidates || [])],
    backupCandidates: [...(prev.backupCandidates || []), ...(next.backupCandidates || [])],
    found: (prev.found || 0) + (next.found || 0),
    searchQueriesRun: (prev.searchQueriesRun || 0) + (next.searchQueriesRun || 0),
    braveSearchLimit: (prev.braveSearchLimit || 0) + (next.braveSearchLimit || 0),
    discarded: [...(prev.discarded || []), ...(next.discarded || [])],
  };
}

function preview(value) {
  if (typeof value === "string") {
    return value.length > 1500 ? `${value.slice(0, 1500)}…` : value;
  }
  if (Array.isArray(value)) {
    const items = value.slice(0, 12).map(preview);
    if (value.length > 12) items.push(`… ${value.length - 12} more`);
    return items;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, preview(inner)]));
  }
  return value;
}

const toText = (value) => (typeof value === "string" ? value : JSON.stringify(value ?? null, null, 2));

function formatMetrics(metrics) {
  if (!metrics || typeof metrics !== "object") return "";
  const entries = Object.entries(metrics).filter(
    ([, value]) => value !== undefined && value !== null && typeof value !== "object"
  );
  if (!entries.length) return "";
  return entries
    .map(([key, value]) => {
      const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
      return `${label}: ${value}`;
    })
    .join(" • ");
}

async function recordAgentRun(projectId, agentName, input, output, status) {
  try {
    await Project.updateOne(
      { _id: projectId },
      {
        $push: {
          agentRuns: {
            agent: `${agentName}${STATUS_SUFFIX[status] || ""}`,
            input: toText(input).slice(0, 9000),
            output: toText(output).slice(0, 9000),
            status,
            timestamp: new Date(),
          },
        },
      }
    );
  } catch (error) {
    // A DB hiccup while logging must never kill the pipeline.
    console.error(`[orchestrator] could not record agent run "${agentName}":`, error?.message || error);
  }
}

async function setCurrentAgent(projectId, agentName) {
  await Project.updateOne({ _id: projectId }, { currentAgent: agentName });
}

/**
 * Turns whatever the QA agent returned into the shape the rest of the orchestrator uses:
 *   { subject, email: <string>, valid, mistakes, usedEvidence, qa: { passed, revisions, issues, itemsToReview, ... } }
 */
function normalizeQaOutput(out, draft, failureReason) {
  const base =
    out && typeof out === "object"
      ? { ...out }
      : {
          subject: draft.subject,
          email: draft.body,
          valid: false,
          mistakes: [{ rule: "qa_failed", detail: failureReason || "QA agent did not return a result" }],
          usedEvidence: draft.usedEvidence || [],
        };

  // If QA came back with no email but the writer produced one, keep the writer's draft.
  if (!base.email && draft.body) base.email = draft.body;
  if (!base.subject && draft.subject) base.subject = draft.subject;

  const issues = Array.isArray(base.qa?.issues)
    ? base.qa.issues
    : Array.isArray(base.mistakes)
      ? base.mistakes
      : [];

  const passed = base.qa?.passed ?? base.valid ?? false;

  base.qa = {
    ...(base.qa || {}),
    passed,
    repaired: Boolean(base.qa?.repaired),
    repairAttempts: base.qa?.repairAttempts || 0,
    revisions: base.qa?.revisions ?? base.qa?.repairAttempts ?? 0,
    issues,
    itemsToReview: issues.map((issue) =>
      typeof issue === "string" ? issue : issue.message || issue.detail || issue.rule || JSON.stringify(issue)
    ),
  };
  base.valid = base.valid ?? passed;
  return base;
}

/**
 * Automatically reset zombie runs left behind by server crashes or nodemon restarts.
 */
export async function cleanupStaleRuns() {
  try {
    // When the backend boots, nothing is actively running yet
    await Project.updateMany(
      { status: "running" },
      { $set: { status: "interrupted", error: "Server restarted while workflow was running" } }
    );
  } catch (err) {
    console.error("[cleanupStaleRuns] failed:", err?.message || err);
  }
}

export async function runAgency4(projectId) {
  const baseLog = makeLogger(projectId, Project);
  registerRun(projectId);
  try {
    // First argument is the label "AutoFiverr", second is the runner callback
    return await runWithLiveLog("AutoFiverr", async () => runAgency4Body(projectId, baseLog));
  } catch (err) {
    console.error(`[runAgency4] fatal error in project ${projectId}:`, err);
    throw err;
  } finally {
    unregisterRun(projectId);
  }
}

const REASON_TEXT = {
  agency: "agencies or service providers",
  media_or_publisher: "news sites or blogs",
  directory_or_database: "directories or listing sites",
  listicle: "list articles",
  geography_mismatch: "companies outside the target location",
  wrong_industry: "companies in the wrong industry",
  missing_target_signal: "companies with no observable service need",
  insufficient_company_evidence: "companies whose own website could not be confirmed",
  non_company_source: "non-company pages",
  wrong_size: "companies too large for the target",
  no_service_need: "companies that show no observable gap for the offered service",
};

function buildShortfall({ desiredLeads, leadsFound, discovery, failedCompanies }) {
  const details = [];
  if ((discovery.found ?? 0) < desiredLeads) {
    const counts = {};
    for (const d of discovery.discarded || []) {
      counts[d.reason] = (counts[d.reason] || 0) + 1;
    }
    const top = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([reason, n]) => `${n} ${REASON_TEXT[reason] || reason}`)
      .join(", ");

    details.push(
      `Discovery found ${discovery.found} candidate(s) for a target of ${desiredLeads}, using ${discovery.searchQueriesRun} of ${discovery.braveSearchLimit} searches.` +
        (top ? ` Most rejected results were: ${top}.` : "")
    );
  }

  for (const f of failedCompanies) {
    if (f.stage === "Candidate Discovery") continue;
    details.push(`${f.companyName} was dropped at ${f.stage}: ${f.error}`);
  }

  return {
    requested: desiredLeads,
    found: leadsFound,
    summary: `${leadsFound} of ${desiredLeads} requested lead(s) were produced.`,
    details,
  };
}

async function runAgency4Body(projectId, log) {
  const startedAt = Date.now();
  const trace = [];

  const state = {
    projectName: "Smart Lead Finder & Pitcher",
    profile: null,
    discovery: null,
    leads: [],
    failedCompanies: [],
    files: {},
    current: { agent: null, company: null },
  };

  const persistReport = async (extra = {}) => {
    try {
      const report = buildProjectReport({
        projectName: state.projectName,
        profile: state.profile,
        discovery: state.discovery,
        trace,
        leads: state.leads,
        runtimeMs: Date.now() - startedAt,
        files: state.files,
      });

      Object.assign(report, { updatedAt: new Date().toISOString() }, extra);

      await Project.updateOne({ _id: projectId }, { report, failedCompanies: state.failedCompanies });
    } catch (error) {
      console.error(`[orchestrator] could not save progress for project ${projectId}:`, error?.message || error);
    }
  };

  /**
   * Records an explicit "DISCARDED" row in Agent progress for a company that dropped out at a point
   * where no agent step recorded the discard itself (no contact details, unexpected exception, ...).
   * Deliberately NOT pushed to `trace`, so the report builder only ever sees real agent steps.
   */
  const recordDiscard = async (companyName, stageLabel, reason) => {
    await recordAgentRun(
      projectId,
      `${stageLabel} — ${companyName}`,
      { company: companyName, stage: stageLabel },
      { reason: reason || "Company did not pass this stage." },
      "discarded"
    );
  };

  const step = async (agent, company, input, fn) => {
    const agentName = AGENT_NAMES[agent];
    const label = `${agentName}${company ? ` — ${company}` : ""}`;
    state.current = { agent: label, company: company || null };

    await setCurrentAgent(projectId, label);
    await log(
      agentName,
      company ? `Starting ${agentName.toLowerCase()} for ${company}.` : `Starting ${agentName.toLowerCase()}.`,
      "info"
    );

    const t0 = Date.now();
    let result;

    try {
      result = await fn();
    } catch (error) {
      result = { status: "failed", output: null, reason: error?.message || String(error) };
    }

    if (!result || typeof result !== "object") {
      result = { status: "failed", output: null, reason: "Agent returned an invalid result." };
    } else if (!result.status) {
      // An agent forgot to set `status`: infer it instead of silently treating the run as empty.
      result = {
        ...result,
        status: result.output ? "success" : "failed",
        reason: result.reason || (result.output ? undefined : "Agent returned no status and no output."),
      };
      await log(agentName, `${agentName} returned no status; treated as "${result.status}".`, "warning");
    }

    const durationMs = Date.now() - t0;

    trace.push({
      agent,
      company,
      status: result.status,
      input: preview(input),
      output: preview(result.output),
      reason: result.reason,
      metrics: result.metrics ? preview(result.metrics) : undefined,
      durationMs,
    });

    await recordAgentRun(
      projectId,
      label,
      preview(input),
      result.status === "success"
        ? preview(result.output)
        : toText({
            status: result.status,
            reason: result.reason,
            output: preview(result.output),
            metrics: preview(result.metrics),
          }),
      result.status
    );

    await persistReport({ status: "running" });

    if (result.status === "success") {
      const metricSummary = formatMetrics(result.metrics);
      await log(
        agentName,
        company
          ? `${agentName} completed for ${company}.${metricSummary ? ` ${metricSummary}` : ""}`
          : `${agentName} completed.${metricSummary ? ` ${metricSummary}` : ""}`,
        "success"
      );
    } else if (result.status === "discarded") {
      await log(
        agentName,
        company
          ? `${company} was discarded at ${agentName}: ${result.reason || "quality gate"}`
          : `${agentName} discarded the result: ${result.reason || "quality gate"}`,
        "warning"
      );
    } else {
      await log(
        agentName,
        company
          ? `${agentName} failed for ${company}: ${result.reason || "unknown error"}`
          : `${agentName} failed: ${result.reason || "unknown error"}`,
        "error"
      );
    }

    return result;
  };

  try {
    await Project.updateOne(
      { _id: projectId },
      {
        status: "running",
        currentAgent: "Target Profiler",
        "stats.startedAt": new Date(),
      }
    );

    await log("Orchestrator", "Starting AutoFiverr agency workflow.", "info");

    const project = await Project.findById(projectId);
    if (!project) throw new Error("Project not found");

    state.projectName = project.title || project.name || "Smart Lead Finder & Pitcher";
    await log("Orchestrator", `Project started: ${state.projectName}.`, "info");

    // --------------------------------------------------
    // Agent 1: Target Profiler
    // --------------------------------------------------
    const desiredLeads = Math.max(1, Number(project.maxLeads) || 1);
    // Signature: the sender's own name (when the project has one) and company, on their own lines.
    const senderSignature = buildSignature(project);
    const fillSender = (text) => fillSignature(formatEmailLayout(text), senderSignature);
    const fillSenderSubject = (text) => fillSignature(text, senderSignature, { singleLine: true });
    const sentEmails = [];

    const submission = {
      goal: project.goal,
      industry: project.industry,
      targetAudience: project.targetAudience,
      geographicFocus: project.geographicFocus,
      researchFocus: project.researchFocus,
      clientServiceSummary: String(project.clientServiceSummary || "").trim(),
      maxLeads: desiredLeads,
      targetCompanies: project.targetCompanies,
      // Structured signs/size/geography chosen in the form (see targetProfilerAgent.parseFormSpec).
      spec: project.spec,
    };

    // Fail early with a clear message instead of writing "undefined" into every email.
    if (!submission.clientServiceSummary) {
      throw new Error(
        "Project is missing clientServiceSummary: describe the service you are selling before running the pipeline."
      );
    }

    const a1 = await step(1, null, submission, async () => ({
      status: "success",
      output: await runTargetProfiler(submission),
    }));

    if (a1.status !== "success") throw new Error(a1.reason);
    if (a1.output?.status === "rejected" || !a1.output?.targetingSpec) {
      throw new Error(a1.output?.error || "Target Profiler rejected the submission.");
    }

    // The profiler only returns the targeting spec. Every later agent also needs the original
    // submission (industry, geography, service summary, maxLeads...), so merge them once, here.
    const profile = {
      ...submission,
      ...a1.output,
      maxLeads: desiredLeads,
      clientServiceSummary: submission.clientServiceSummary,
    };
    state.profile = profile;

    await Project.updateOne({ _id: projectId }, { researchCriteria: profile });
    await log("Target Profiler", `Target profile created for ${desiredLeads} lead(s).`, "success");

    // --------------------------------------------------
    // Agents 2-7: discover, qualify by REAL need, write, QA, structure
    // Discovery is repeated (next result page) until enough leads survive or the round limit is hit.
    // --------------------------------------------------
    const leads = state.leads;
    const reviewQueue = [];
    const failedCompanies = state.failedCompanies;
    const processed = new Set();
    // Discovery remembers searches, pages and companies per run id, so round 2 continues where round 1 stopped.
    // The time part makes a rerun of the same project start fresh.
    const discoveryRunId = `${projectId}-${Date.now()}`;
    let discovery = null;
    let position = 0;

    const processCandidate = async (candidate, total) => {
      position += 1;
      const name = candidate.companyName || "Unknown company";

      await log(
        "Orchestrator",
        `Processing candidate ${position}/${total}: ${name}. (${leads.length}/${desiredLeads} lead(s) so far)`,
        "info"
      );

      /**
       * Drops the company from the pipeline.
       * `record: false` when the failing agent step already wrote a discarded/failed row itself.
       */
      const discard = async (stageLabel, result, { record = true } = {}) => {
        const reason = result?.reason || "Company did not pass this stage.";
        failedCompanies.push({ companyName: name, stage: stageLabel, error: reason });
        if (record) await recordDiscard(name, stageLabel, reason);
        await persistReport({ status: "running" });
        await log("Orchestrator", `${name} will not continue past ${stageLabel}: ${reason}`, "warning");
      };

      // Agent 3: scrape + deterministic need checks
      const a3 = await step(3, name, { company: candidate, profile }, () =>
        runCompanyScraper({ company: candidate, profile })
      );
      if (a3.status !== "success") return discard(AGENT_NAMES[3], a3, { record: false });

      // Agent 4: keep only companies with a real, observable need
      const relevanceInput = { profile, company: a3.output };
      const a4 = await step(4, name, relevanceInput, () => runContentRelevanceFilter(relevanceInput));
      if (a4.status !== "success") return discard(AGENT_NAMES[4], a4, { record: false });

      // Agent 5: re-verify against the live site
      const a5 = await step(5, name, a4.output, async () => {
        const result = await runEvidenceVerification(a4.output);

        const noEvidence =
          (Array.isArray(result?.output?.verifiedEvidence) && result.output.verifiedEvidence.length === 0) ||
          (Array.isArray(result?.verifiedEvidence) && result.verifiedEvidence.length === 0);

        if (result?.status === "discarded" || result?.passed === false || noEvidence) {
          return {
            ...result,
            status: "discarded",
            reason: result?.reason || "No verifiable service need evidence found on official website.",
          };
        }

        return result;
      });
      if (a5.status !== "success") return discard(AGENT_NAMES[5], a5, { record: false });

      // Contact details
      const contact = await findContactEmails(a5.output.website, {
        place: a5.output.place || candidate.place,
        linkedinUrl: a5.output.profiles?.linkedin,
      }).catch(() => ({
        primary: null,
        others: [],
        contactFormUrl: null,
        phone: candidate.place?.phone || null,
        linkedinUrl: a5.output.profiles?.linkedin || null,
      }));

      await log(
        "Orchestrator",
        contact.primary
          ? `Verified contact email for ${name}: ${contact.primary}`
          : contact.contactFormUrl
            ? `No public email for ${name}; contact form found: ${contact.contactFormUrl}`
            : contact.linkedinUrl || contact.phone
              ? `No public email for ${name}; other route: ${contact.linkedinUrl || contact.phone}`
              : `No public contact route found for ${name}; keeping the lead anyway.`,
        contact.primary ? "success" : "info"
      );

      if (!contact.primary && !contact.contactFormUrl && !contact.linkedinUrl && !contact.phone && !ALLOW_NO_CONTACT) {
        return discard("Contact Check", {
          reason: "No email, contact form, LinkedIn page or phone number could be found, so the lead cannot be contacted.",
        });
      }

      // Agent 6: writer
      const outreachInput = {
        profile,
        companyName: a5.output.companyName,
        website: a5.output.website,
        verifiedEvidence: a5.output.verifiedEvidence,
      };
      const a6 = await step(6, name, outreachInput, () => runOutreachWriter(outreachInput));

      // If the writer produced nothing, QA still runs: it can build a deterministic template email.
      const draft = a6.output ?? {
        companyName: a5.output.companyName,
        website: a5.output.website,
        subject: "",
        body: "",
        usedEvidence: [],
        source: "none",
      };

      // Agent 6.5: QA (repairs, then falls back to a template that passes the same review)
      const qaInput = {
        profile,
        companyName: draft.companyName,
        website: draft.website,
        subject: draft.subject,
        email: draft.body,
        usedEvidence: draft.usedEvidence || [],
        verifiedEvidence: a5.output.verifiedEvidence,
        avoidEmails: sentEmails,
      };
      const a65 = await step(6.5, name, qaInput, () => runOutreachQa(qaInput));

      let qaOut = normalizeQaOutput(
        a65.status === "success" && a65.output ? a65.output : null,
        draft,
        a65.reason
      );

      if (!qaOut.qa.passed) {
        await log(
          "Outreach QA",
          `${name}: email still has items to review: ${qaOut.qa.itemsToReview.join(" | ") || "none listed"}`,
          "warning"
        );
      }

      // Two leads must never receive near-identical emails: rewrite the later one from a different template.
      const twin = qaOut.email ? sentEmails.find((e) => emailSimilarity(e, qaOut.email) >= 0.6) : null;
      if (twin) {
        await log(
          "Orchestrator",
          `The email for ${name} is too similar to an earlier lead's email; rewriting it with different wording.`,
          "info"
        );
        const retryInput = { ...qaInput, email: "", subject: "", avoidEmails: sentEmails };
        const retry = await step(6.5, name, retryInput, () => runOutreachQa(retryInput));
        if (retry.status === "success" && retry.output?.email && retry.output.valid !== false) {
          qaOut = normalizeQaOutput(retry.output, draft);
        }
      }

      // An empty email cannot be sent or reviewed: drop it with a visible reason.
      if (!qaOut.email || !String(qaOut.email).trim()) {
        return discard(AGENT_NAMES[6], {
          reason: a6.reason || "Could not produce an outreach email from the verified evidence.",
        });
      }

      sentEmails.push(qaOut.email);

      // Agent 7: CRM structuring
      const crmInput = {
        companyName: a5.output.companyName,
        website: a5.output.website,
        verifiedEvidence: a5.output.verifiedEvidence,
        email: fillSender(qaOut.email),
        subject: fillSenderSubject(qaOut.subject),
        contactEmail: contact.primary,
        contactEmails: contact.others,
        contactFormUrl: contact.contactFormUrl,
        contactPhone: contact.phone || null,
        linkedinUrl: contact.linkedinUrl || null,
        usedEvidence: qaOut.usedEvidence,
        mistakes: qaOut.mistakes,
        qa: qaOut.qa,
        outreachSource: qaOut.qa?.template ? "template" : draft.source || null,
      };

      const a7 = await step(7, name, crmInput, () => runCrmStructurer(crmInput));
      if (a7.status !== "success") return discard(AGENT_NAMES[7], a7, { record: false });

      const record = a7.output;

      // Citation numbers must be integers
      const toCitationNumber = (value, index) => {
        if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
        const match = String(value ?? "").trim().match(/^E?(\d+)$/i);
        const parsed = match ? Number(match[1]) : NaN;
        return Number.isInteger(parsed) && parsed > 0 ? parsed : index + 1;
      };
      if (Array.isArray(record.verifiedEvidence)) {
        record.verifiedEvidence = record.verifiedEvidence.map((item, index) => ({
          ...item,
          citationId: toCitationNumber(item.citationId, index),
        }));
      }

      // If the email passed QA and is present, mark as passed so it counts toward the target
      if (record.outreachStatus !== "passed" && qaOut.valid && record.email) {
        record.outreachStatus = "passed";
      }

      // Only leads whose email passed QA count toward the target. The rest are kept as a review queue.
      if (record.outreachStatus !== "passed") {
        record.needsReview = true;
        reviewQueue.push(record);
        await log(
          "Orchestrator",
          `${name} is qualified but its email still needs manual review; kept in the review queue.`,
          "warning"
        );
        return;
      }

      // Optional HubSpot sync (only for ready leads)
      try {
        record.hubspot = await pushLeadToHubspot(record);
      } catch (error) {
        record.hubspot = { ok: false, reason: error?.message || String(error) };
      }
      await log(
        "HubSpot",
        record.hubspot.ok
          ? `${name} synced to HubSpot (company ${record.hubspot.companyId}${record.hubspot.contactId ? `, contact ${record.hubspot.contactId}` : ""}).`
          : record.hubspot.skipped
            ? `HubSpot skipped: ${record.hubspot.reason}`
            : `HubSpot sync failed for ${name}: ${record.hubspot.reason}`,
        record.hubspot.ok ? "success" : "warning"
      );

      leads.push(record);
      await persistReport({ status: "running" });
      await log("Orchestrator", `Lead successfully qualified and added: ${name}.`, "success");
    };

    for (let round = 1; round <= MAX_DISCOVERY_ROUNDS && leads.length < desiredLeads; round += 1) {
      const missing = desiredLeads - leads.length;

      const a2 = await step(2, null, { round, missing }, async () => ({
        status: "success",
        output: await runCandidateDiscovery(profile, {
          requested: missing,
          page: round - 1,
          runId: discoveryRunId,
          excludeHosts: processed,
          onLog: (entry) => log(entry.agent || "Candidate Discovery", entry.message || "", entry.level || "info"),
        }),
      }));

      if (a2.status !== "success") {
        if (round === 1) throw new Error(a2.reason);
        await log("Orchestrator", `Discovery round ${round} failed: ${a2.reason}. Stopping the search.`, "warning");
        break;
      }

      discovery = mergeDiscovery(discovery, a2.output);
      state.discovery = discovery;

      for (const discarded of a2.output.discarded || []) {
        failedCompanies.push({
          companyName: discarded.companyName,
          stage: "Candidate Discovery",
          error: discarded.reason,
        });
      }

      const queue = [...(a2.output.candidates || []), ...(a2.output.backupCandidates || [])].filter(
        (c) => !processed.has(hostKey(c))
      );

      if (!queue.length) {
        if (round === 1) throw new Error("Candidate Discovery found no candidates matching the criteria.");
        await log("Orchestrator", `Discovery round ${round} found no new candidates.`, "info");
        continue;
      }

      if (round > 1) {
        await log(
          "Orchestrator",
          `Round ${round}: ${leads.length}/${desiredLeads} lead(s) so far, checking ${queue.length} more candidate(s).`,
          "info"
        );
      }

      position = 0;
      // A small worker pool: several companies are processed at once instead of one after another.
      let nextIndex = 0;
      let inFlight = 0;
      const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const worker = async () => {
        while (true) {
          if (leads.length >= desiredLeads || nextIndex >= queue.length) return;
          // Enough companies are already being processed to reach the target: do not start more than needed.
          // If one of them fails later, this worker is still here to take the next candidate.
          if (leads.length + inFlight >= desiredLeads) {
            if (inFlight === 0) return;
            await pause(500);
            continue;
          }
          const candidate = queue[nextIndex];
          nextIndex += 1;
          inFlight += 1;
          processed.add(hostKey(candidate));
          try {
            await processCandidate(candidate, queue.length);
          } catch (error) {
            // One broken company must never kill the whole run.
            const companyName = candidate.companyName || "Unknown company";
            const reason = error?.message || String(error);

            failedCompanies.push({ companyName, stage: "Pipeline", error: reason });
            await recordDiscard(companyName, "Pipeline", `Unexpected error: ${reason}`);
            await persistReport({ status: "running" });
            await log("Orchestrator", `${companyName} failed unexpectedly and was skipped: ${reason}`, "error");
          } finally {
            inFlight -= 1;
          }
        }
      };
      await Promise.all(Array.from({ length: CANDIDATE_CONCURRENCY }, worker));
    }

    // If too few ready leads, top up with qualified leads whose email needs a manual look (clearly flagged).
    if (leads.length < desiredLeads && reviewQueue.length) {
      const fill = reviewQueue.slice(0, desiredLeads - leads.length);
      leads.push(...fill);
      await log("Orchestrator", `${fill.length} lead(s) added from the review queue (flagged needsReview).`, "warning");
    }

    // Parallel workers can overshoot the target by a lead or two: keep exactly what was asked for.
    if (leads.length > desiredLeads) leads.length = desiredLeads;

    if (!discovery) throw new Error("Candidate Discovery did not run.");

    // --------------------------------------------------
    // Finalization & Exports
    // --------------------------------------------------
    const durationMs = Date.now() - startedAt;
    let files = {};

    if (leads.length) {
      files = await exportLeads(leads, {
        outDir: EXPORT_DIR,
        projectName: state.projectName,
        profile,
        baseName: `${state.projectName}-${projectId}`,
      });
      state.files = files;
    }

    const report = buildProjectReport({
      projectName: state.projectName,
      profile,
      discovery,
      trace,
      leads,
      runtimeMs: durationMs,
      files,
    });

    Object.assign(report, {
      shortfall:
        leads.length < desiredLeads
          ? buildShortfall({ desiredLeads, leadsFound: leads.length, discovery, failedCompanies })
          : null,
      status: "completed",
      outcome: leads.length ? "leads_found" : "no_leads",
      needsReviewCount: leads.filter((l) => l.needsReview).length,
      updatedAt: new Date().toISOString(),
    });

    await Project.updateOne(
      { _id: projectId },
      {
        status: "completed",
        currentAgent: null,
        leads,
        failedCompanies,
        report,
        crmExport: { csv: leads.length ? buildCrmCsv(leads) : "", json: leads, files },
        "stats.completedAt": new Date(),
        "stats.durationMs": durationMs,
        "stats.leadsFound": leads.length,
        "stats.searchQueriesRun": Number(discovery?.searchQueriesRun) || 0,
      }
    );

    await log(
      "Orchestrator",
      `Run completed in ${(durationMs / 1000).toFixed(1)}s with ${leads.length} verified lead(s).`,
      "success"
    );
  } catch (error) {
    const reason = error?.message || String(error);
    console.error(`[orchestrator] project ${projectId} failed:`, error);

    await persistReport({
      status: "failed",
      failure: {
        agent: state.current.agent,
        company: state.current.company,
        reason,
        interrupted: false,
        at: new Date().toISOString(),
      },
    });

    await Project.updateOne({ _id: projectId }, { status: "failed", currentAgent: null });
    await log("Orchestrator", `Run failed: ${reason}`, "error");
  }
}