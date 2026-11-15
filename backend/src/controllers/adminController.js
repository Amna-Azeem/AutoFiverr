import Project from "../models/Project.js";

// Aggregate stats for the Admin / System Logs Dashboard.
export async function getSystemStats(_req, res) {
  try {
    const [total, completed, failed, running, queued] = await Promise.all([
      Project.countDocuments(),
      Project.countDocuments({ status: "completed" }),
      Project.countDocuments({ status: "failed" }),
      Project.countDocuments({ status: "running" }),
      Project.countDocuments({ status: "queued" }),
    ]);

    const recent = await Project.find()
      .sort({ createdAt: -1 })
      .limit(20)
      .select("title status currentAgent createdAt stats.durationMs stats.leadsFound");

    const completedProjects = await Project.find({ status: "completed" }).select(
      "stats.durationMs stats.leadsFound stats.searchQueriesRun"
    );

    const avgDurationMs =
      completedProjects.length > 0
        ? completedProjects.reduce((sum, p) => sum + (p.stats?.durationMs || 0), 0) /
          completedProjects.length
        : 0;

    const totalLeads = completedProjects.reduce((sum, p) => sum + (p.stats?.leadsFound || 0), 0);
    const totalQueries = completedProjects.reduce(
      (sum, p) => sum + (p.stats?.searchQueriesRun || 0),
      0
    );

    res.json({
      counts: { total, completed, failed, running, queued },
      successRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      avgDurationMs: Math.round(avgDurationMs),
      totalLeads,
      totalQueries,
      recentProjects: recent,
    });
  } catch (err) {
    console.error("[getSystemStats]", err);
    res.status(500).json({ error: err.message });
  }
}

export async function testGroqController(req, res) {
  try {
    const { prompt } = req.body || {};
    const p = prompt || "Hello from AutoFiverr: test Groq connectivity.";
    const { text, sources } = await import("../agents/geminiClient.js").then((m) => m.testGroq(p));
    res.json({ ok: true, provider: "groq", text, sources });
  } catch (err) {
    console.error("[testGroqController]", err);
    res.status(500).json({ error: err.message || String(err) });
  }
}
// testGrokController removed (Grok integration deprecated)
