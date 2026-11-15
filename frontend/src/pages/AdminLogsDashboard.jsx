import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import JSZip from "jszip";
import { api } from "../api/client.js";

const RUNNING_TIMEOUT_MS = 5 * 60 * 1000;

export default function AdminLogsDashboard() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [agencyFilter, setAgencyFilter] = useState("");
  const [rerunningId, setRerunningId] = useState(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const { projects: items } = await api.listProjects();

        if (!active) return;

        setProjects(items || []);
      } catch (err) {
        if (!active) return;
        setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  /*
   * A project that has been "running" for more than 5 minutes
   * is treated as failed/interrupted for the dashboard.
   *
   * We do NOT change the database status here.
   */
  function isTimedOut(project) {
    if (
      project.status !== "running" &&
      project.status !== "queued"
    ) {
      return false;
    }

    const startedAt =
      project.startedAt ||
      project.updatedAt ||
      project.createdAt;

    if (!startedAt) {
      return false;
    }

    const startedTime = new Date(startedAt).getTime();

    if (Number.isNaN(startedTime)) {
      return false;
    }

    return (
      Date.now() - startedTime >
      RUNNING_TIMEOUT_MS
    );
  }

  /*
   * Public status mapping.
   *
   * completed -> completed
   * running/queued <= 5 minutes -> running
   * running/queued > 5 minutes -> failed
   * failed/interrupted -> failed
   */
  function displayStatus(project) {
    const rawStatus = project.status;

    if (rawStatus === "completed") {
      return "completed";
    }

    if (
      (rawStatus === "running" ||
        rawStatus === "queued") &&
      !isTimedOut(project)
    ) {
      return "running";
    }

    if (
      rawStatus === "failed" ||
      rawStatus === "interrupted" ||
      isTimedOut(project)
    ) {
      return "failed";
    }

    return "failed";
  }

  /*
   * Get the agency name/slug consistently.
   */
  function getAgency(project) {
    return (
      project.agencyName ||
      project.agency ||
      project.agencySlug ||
      "Unknown Agency"
    );
  }

  /*
   * Available agencies for the filter.
   */
  const agencies = [
    ...new Set(
      projects.map((project) =>
        getAgency(project)
      )
    ),
  ];

  /*
   * Filter projects by agency.
   */
  const filteredProjects = agencyFilter
    ? projects.filter(
        (project) =>
          getAgency(project) ===
          agencyFilter
      )
    : projects;

  /*
   * Portfolio statistics use the public
   * normalized statuses.
   */
  const total = projects.length;

  const completed = projects.filter(
    (project) =>
      displayStatus(project) ===
      "completed"
  ).length;

  const running = projects.filter(
    (project) =>
      displayStatus(project) ===
      "running"
  ).length;

  const failed = projects.filter(
    (project) =>
      displayStatus(project) ===
      "failed"
  ).length;

  async function handleRerun(project) {
    const id = project._id || project.id;

    if (!id) {
      alert("This project does not have a valid ID.");
      return;
    }

    const confirmed = window.confirm(
      `Run "${project.title}" again from the beginning?`
    );

    if (!confirmed) return;

    try {
      setRerunningId(id);
      setError("");

      const { project: updatedProject } =
        await api.rerunProject(id);

      /*
       * Immediately update the card to running.
       */
      setProjects((current) =>
        current.map((item) =>
          (item._id || item.id) === id
            ? updatedProject || {
                ...item,
                status: "queued",
                currentAgent: "Starting rerun",
                updatedAt: new Date().toISOString(),
              }
            : item
        )
      );
    } catch (err) {
      alert(
        `Failed to rerun project: ${err.message}`
      );
    } finally {
      setRerunningId(null);
    }
  }

  async function handleDownload(project) {
    const zip = new JSZip();

    const content = `
Project: ${project.title}

Agency:
${getAgency(project)}

Status:
${displayStatus(project)}

Goal:
${project.goal || "Not provided"}

Companies:
${(project.targetCompanies || []).join(", ")}

Leads:
${project.leadCount ?? project.leads?.length ?? project.stats?.leadsFound ?? 0}
`;

    zip.file("report.txt", content);

    const blob = await zip.generateAsync({
      type: "blob",
    });

    const url =
      URL.createObjectURL(blob);

    const link =
      document.createElement("a");

    link.href = url;

    link.download = `${(
      project.title || "project"
    )
      .replace(/\s+/g, "-")
      .toLowerCase()}.zip`;

    link.click();

    URL.revokeObjectURL(url);
  }

  async function handleDelete(project) {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${project.title}"?`
    );

    if (!confirmed) return;

    try {
      const id =
        project._id || project.id;

      await api.deleteProject(id);

      setProjects((current) =>
        current.filter(
          (p) =>
            (p._id || p.id) !== id
        )
      );
    } catch (err) {
      alert(
        `Failed to delete project: ${err.message}`
      );
    }
  }

  /*
   * Re-check timed-out projects every 30 seconds.
   *
   * This only causes React to re-render.
   * It does NOT modify the backend/database.
   */
  useEffect(() => {
    const timer = setInterval(() => {
      setProjects((current) => [...current]);
    }, 30000);

    return () => clearInterval(timer);
  }, []);

  if (loading) {
    return (
      <div className="px-6 py-10 text-slate-500">
        Loading projects...
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-6 py-10 text-red-500">
        {error}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl min-w-0 overflow-x-hidden px-6 py-0">
      {/* Header */}

      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-blue-600">
            Portfolio
          </p>

          <h1 className="mt-2 text-3xl font-semibold text-slate-900">
            Projects Overview
          </h1>
        </div>

        {/* Agency filter */}

        <select
          value={agencyFilter}
          onChange={(e) =>
            setAgencyFilter(
              e.target.value
            )
          }
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
        >
          <option value="">
            All AI Agencies
          </option>

          {agencies.map((agency) => (
            <option
              key={agency}
              value={agency}
            >
              {agency}
            </option>
          ))}
        </select>
      </div>

      {/* Stats */}

      <div className="mb-8 grid gap-4 md:grid-cols-4">
        <Stat
          label="Total"
          value={total}
        />

        <Stat
          label="Completed"
          value={completed}
          accent
        />

        <Stat
          label="Running"
          value={running}
          running
        />

        <Stat
          label="Failed"
          value={failed}
          error
        />
      </div>

      {/* Projects */}

      <div className="space-y-3">
        {filteredProjects.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            No matching projects found.
          </div>
        ) : (
          filteredProjects.map(
            (project) => {
              const rawStatus =
                project.status;

              const status =
                displayStatus(project);

              const id =
                project._id ||
                project.id;

              /*
               * A timed-out running project
               * is now eligible for rerun.
               */
              const canRerun =
                rawStatus === "failed" ||
                rawStatus === "interrupted" ||
                isTimedOut(project);

              const isRerunning =
                rerunningId === id;

              return (
                <div
                  key={id}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-lg font-semibold text-slate-900">
                          {project.title}
                        </h2>

                        <StatusBadge
                          status={
                            status
                          }
                        />
                      </div>

                      <p className="mt-1 text-sm text-blue-600">
                        {getAgency(
                          project
                        )}
                      </p>

                      <ExpandableText
                        text={
                          project.goal ||
                          "No goal recorded"
                        }
                      />
                    </div>

                    {/* Actions */}

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Link
                        to={`/projects/${id}`}
                        className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-medium transition hover:border-blue-600 hover:text-blue-600"
                      >
                        View Project
                      </Link>

                      {canRerun && (
                        <button
                          onClick={() =>
                            handleRerun(
                              project
                            )
                          }
                          disabled={
                            isRerunning
                          }
                          className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isRerunning
                            ? "Starting..."
                            : "Run Again"}
                        </button>
                      )}

                      {rawStatus ===
                        "completed" && (
                        <button
                          onClick={() =>
                            handleDownload(
                              project
                            )
                          }
                          className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
                        >
                          Download
                        </button>
                      )}

                      <button
                        onClick={() =>
                          handleDelete(
                            project
                          )
                        }
                        title="Delete project"
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-red-200 text-xl text-red-500 transition hover:bg-red-50 hover:text-red-700"
                      >
                        ×
                      </button>
                    </div>
                  </div>

                  {/* Project information */}

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <InfoCard
                      title="Companies"
                      value={
                        (
                          project.targetCompanies ||
                          []
                        ).join(", ") ||
                        "Not provided"
                      }
                    />

                    <InfoCard
                      title="Started"
                      value={new Date(
                        project.createdAt ||
                          Date.now()
                      ).toLocaleString()}
                    />

                                        <InfoCard
                      title="Leads"
                      value={
                        project.leadCount ??
                        project.stats?.leadsFound ??
                        0
                      }
                    />
                    
                  </div>
                </div>
              );
            }
          )
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  running,
  error,
}) {
  let color =
    "text-slate-900";

  if (accent) {
    color = "text-blue-600";
  }

  if (running) {
    color = "text-blue-500";
  }

  if (error) {
    color = "text-red-500";
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs uppercase tracking-wider text-slate-400">
        {label}
      </p>

      <p
        className={`mt-2 text-2xl font-semibold ${color}`}
      >
        {value}
      </p>
    </div>
  );
}

function StatusBadge({ status }) {
  const styles = {
    completed:
      "bg-emerald-100 text-emerald-700",

    running:
      "bg-blue-100 text-blue-700",

    failed:
      "bg-red-100 text-red-700",
  };

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
        styles[status] ||
        "bg-slate-100 text-slate-600"
      }`}
    >
      {status}
    </span>
  );
}

function InfoCard({ title, value }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs uppercase tracking-wider text-slate-400">
        {title}
      </p>

<p className="mt-2 break-words text-sm font-medium text-slate-800">
        {value}
      </p>
    </div>
  );
}

function ExpandableText({ text }) {
  const [expanded, setExpanded] =
    useState(false);

  if (text.length < 120) {
    return (
      <p className="mt-2 text-sm text-slate-600">
        {text}
      </p>
    );
  }

  return (
    <div className="mt-2">
      <p className="text-sm text-slate-600">
        {expanded
          ? text
          : `${text.slice(0, 120)}...`}
      </p>

      <button
        onClick={() =>
          setExpanded(!expanded)
        }
        className="mt-1 text-xs font-medium text-blue-600 hover:text-blue-700"
      >
        {expanded
          ? "Read Less"
          : "Read More"}
      </button>
    </div>
  );
}