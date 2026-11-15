import fs from "fs/promises";
import jwt from "jsonwebtoken";
import pdfParse from "pdf-parse";
import Project from "../models/Project.js";
import { runAgency4 } from "../orchestrator/agency4Orchestrator.js";
import { subscribe, unsubscribe } from "../utils/logger.js";
import { buildWordReport } from "../agents/crmStructurerAgent.js";

export async function createProject(req, res) {
  try {
    const {
      title,
      goal,
      clientCompanyName,
      industry,
      targetAudience,
      geographicFocus,
      researchFocus,
      targetCompanies,
      clientServiceSummary,
      maxLeads,
      agencySlug,
    } = req.body;




    if (!title || !goal) {
      return res.status(400).json({ error: "title and goal are required" });
    }

    const uploadedFiles = [];
    if (req.file) {
      try {
        const buffer = await fs.readFile(req.file.path);
        const parsed = await pdfParse(buffer);
        uploadedFiles.push({
          originalName: req.file.originalname,
          storedPath: req.file.path,
          parsedTextExcerpt: parsed.text.slice(0, 6000),
        });
      } catch (e) {
        console.warn("[upload] PDF parse failed:", e.message);
        uploadedFiles.push({
          originalName: req.file.originalname,
          storedPath: req.file.path,
          parsedTextExcerpt: "",
        });
      }
    }

    const project = await Project.create({
      userId: req.user.id,
      
      title,
      goal,
      agencySlug: agencySlug || "smart-lead-finder",
      clientCompanyName,
      industry,
      targetAudience,
      geographicFocus,
      researchFocus,
      clientServiceSummary,
      maxLeads: Number(maxLeads) || 10,
      targetCompanies: parseList(targetCompanies),
      uploadedFiles,
      status: "queued",
    });

    res.status(202).json({ project });
    runAgency4(project._id).catch((err) => {
      console.error(`[createProject] orchestrator failed for ${project._id}:`, err);
    });
  } catch (err) {
    console.error("[createProject]", err);
    res.status(500).json({ error: err.message });
  }
}

function parseList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function canAccessProject(project, user) {
  return user.role === "admin" || String(project.userId) === String(user.id);
}





export async function rerunProject(req, res) {
  try {
    const project = await Project.findById(
      req.params.id
    );

    if (!project) {
      return res.status(404).json({
        error: "Project not found",
      });
    }

    if (
      !canAccessProject(
        project,
        req.user
      )
    ) {
      return res.status(403).json({
        error: "Forbidden",
      });
    }

   if (
  project.status !== "failed" &&
  project.status !== "interrupted" &&
  project.status !== "queued" // <--- Allow queued projects to be rerun/kick-started
) {
  return res.status(400).json({
    error: "Only failed, interrupted, or queued projects can be rerun.",
  });
}

    await Project.updateOne(
      { _id: project._id },
      {
        $set: {
          status: "queued",
          currentAgent: "Starting rerun",

          leads: [],
          failedCompanies: [],
          agentRuns: [],
          agentLogs: [],

          researchCriteria: {},
          report: {},

          crmExport: {
            csv: "",
            json: [],
            files: {},
          },

          "stats.startedAt": null,
          "stats.completedAt": null,
          "stats.durationMs": 0,
          "stats.leadsFound": 0,
          "stats.searchQueriesRun": 0,
        },
      }
    );

    const resetProject =
      await Project.findById(
        project._id
      );

    res.status(202).json({
      message: "Project rerun started.",
      project: resetProject,
    });

    runAgency4(
      project._id
    ).catch((err) => {
      console.error(
        `[rerunProject] orchestrator failed for ${project._id}:`,
        err
      );
    });
  } catch (err) {
    console.error(
      "[rerunProject]",
      err
    );

    res.status(500).json({
      error: err.message,
    });
  }
}







export async function listProjects(req, res) {
  try {
    const filter =
      req.user.role === "admin"
        ? {}
        : { userId: req.user.id };

    const rows = await Project.find(filter)
      .select(
        "_id title goal agencySlug status currentAgent createdAt updatedAt stats leads.leadId"
      )
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const projects = rows.map(({ leads, ...p }) => ({
      ...p,
      leadCount: Array.isArray(leads)
        ? leads.length
        : p.stats?.leadsFound ?? 0,
    }));

    res.json({ projects });
  } catch (err) {
    console.error("[listProjects]", err);
    res.status(500).json({ error: err.message });
  }
}


 

export async function getProject(req, res) {
   
 
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (!canAccessProject(project, req.user)) return res.status(403).json({ error: "Forbidden" });
    res.json({ project });
  } catch (err) {
    console.error("[getProject]", err);
    res.status(500).json({ error: err.message });
  }
}

export async function deleteProject(req, res) {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (!canAccessProject(project, req.user)) return res.status(403).json({ error: "Forbidden" });
    await project.deleteOne();

    res.json({ message: "Project deleted successfully" });
  } catch (err) {
    console.error("[deleteProject]", err);
    res.status(500).json({ error: err.message });
  }
}

// Server-Sent Events stream of live agent logs for a running project.
// Server-Sent Events stream of live agent logs for a running project.
export async function streamProjectLogs(req, res) {
  const { id } = req.params;
  let project;
  let claims;

  try {
    claims = jwt.verify(
      req.query.token,
      process.env.JWT_SECRET
    );

    if (
      claims.scope !== "project-stream" ||
      claims.projectId !== id
    ) {
      return res.status(401).json({
        error: "Invalid stream token",
      });
    }
  } catch (err) {
    console.error(
      "[project stream auth]",
      err.message
    );

    return res.status(401).json({
      error: "Invalid or expired stream token",
    });
  }

  try {
    project = await Project.findById(id);

    if (!project) {
      return res.status(404).json({
        error: "Project not found",
      });
    }

    if (!canAccessProject(project, claims)) {
      return res.status(403).json({
        error: "Forbidden",
      });
    }
  } catch (err) {
    console.error(
      "[project stream lookup]",
      err
    );

    return res.status(500).json({
      error: "Could not load project stream",
    });
  }

  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  res.flushHeaders();

  /*
   * IMPORTANT:
   * Subscribe BEFORE replaying stored logs.
   *
   * This prevents a new log from being lost
   * between loading the project and subscribing.
   */
  subscribe(id, res);

  /*
   * Send connection message.
   */
  res.write(
    `data: ${JSON.stringify({
      agent: "System",
      message: "Connected to log stream.",
      level: "info",
      timestamp: new Date().toISOString(),
    })}\n\n`
  );

  /*
   * Replay all logs that were produced before
   * the browser connected.
   *
   * This is what makes the dashboard catch up
   * when the workflow started before SSE connected.
   */
  for (const entry of project.agentLogs || []) {
    try {
      res.write(
        `data: ${JSON.stringify(entry)}\n\n`
      );
    } catch {
      unsubscribe(id, res);
      return;
    }
  }

  /*
   * Clean up the subscriber when the browser
   * closes/navigates away from the stream.
   */
  req.on("close", () => {
    unsubscribe(id, res);
  });
}



export async function createProjectStreamToken(req, res) {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (!canAccessProject(project, req.user)) return res.status(403).json({ error: "Forbidden" });
    const token = jwt.sign(
      { id: String(req.user.id), role: req.user.role, scope: "project-stream", projectId: String(project._id) },
      process.env.JWT_SECRET,
      { expiresIn: "60s" }
    );
    res.json({ token });
  } catch (err) {
    console.error("[project stream token]", err);
    res.status(500).json({ error: err.message });
  }
}

export async function getCrmExportCsv(req, res) {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (!canAccessProject(project, req.user)) return res.status(403).json({ error: "Forbidden" });
    if (!project.crmExport?.csv) return res.status(404).json({ error: "No CRM export available yet" });
    res.set({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="autofiverr-leads-${project._id}.csv"`,
    });
    res.send(project.crmExport.csv);
  } catch (err) {
    console.error("[CRM CSV export]", err);
    res.status(500).json({ error: err.message });
  }
}

export async function getCrmExportDocx(req, res) {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (!canAccessProject(project, req.user)) return res.status(403).json({ error: "Forbidden" });

    let report;
    const docxPath = project.crmExport?.files?.docx;
    if (docxPath) {
      try {
        report = await fs.readFile(docxPath);
      } catch (err) {
        if (err.code !== "ENOENT") throw err;
      }
    }
    if (!report) {
      report = await buildWordReport(project.leads || [], {
        projectName: project.title,
        profile: project.researchCriteria || {},
      });
    }

    const filename = `${String(project.title || "lead-report").replace(/[^a-z0-9_-]+/gi, "-")}.docx`;
    res.set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
    });
    res.send(report);
  } catch (err) {
    console.error("[CRM Word export]", err);
    res.status(500).json({ error: err.message });
  }
}