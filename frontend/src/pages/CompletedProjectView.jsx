import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Clock3,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  ServerCrash,
  Terminal,
  XCircle,
  AlertTriangle,
} from "lucide-react";

import { api } from "../api/client.js";
// Survives navigation, so re-opening a project shows instantly
const projectCache = new Map();

// Cheap "did anything change?" check (avoids stringifying huge payloads)
function projectSignature(p) {
  if (!p) return "";
  return [
    p._id,
    p.status,
    p.updatedAt,
    p.currentAgent,
    p.queuePosition,
    p.agentRuns?.length ?? 0,
    p.agentLogs?.length ?? 0,
    p.logs?.length ?? 0,
    p.leads?.length ?? 0,
  ].join("|");
}

export default function CompletedProjectView({ children }) {
 

  const { id } = useParams();

  const cached = projectCache.get(id) || null;

const [project, setProject] = useState(cached);
const [loading, setLoading] = useState(!cached);
const [pageError, setPageError] = useState(null);
const [rerunning, setRerunning] = useState(false);

// Only update state if something actually changed
const applyProject = useCallback(
  (next) => {
    if (!next) return;
    projectCache.set(id, next);
    setProject((prev) =>
      projectSignature(prev) === projectSignature(next) ? prev : next
    );
  },
  [id]
);

// Load project (shows cached copy instantly, refreshes in background)
useEffect(() => {
  let mounted = true;
  const cachedProject = projectCache.get(id) || null;

  setProject(cachedProject);
  setLoading(!cachedProject);
  setPageError(null);

  api
    .getProject(id)
    .then((response) => {
      if (!mounted) return;
      applyProject(response?.project || null);
      setPageError(null);
    })
    .catch((err) => {
      if (!mounted) return;
      setPageError(err?.message || "Failed to load this project.");
    })
    .finally(() => {
      if (mounted) setLoading(false);
    });

  return () => {
    mounted = false;
  };
}, [id, applyProject]);

// Poll queued/running projects: one request at a time, adaptive delay
const status = project?.status;

useEffect(() => {
  if (status !== "queued" && status !== "running") return;

  let cancelled = false;
  let timer;
  let failures = 0;

  async function tick() {
    if (cancelled) return;

    // don't hammer the server from a background tab
    if (document.hidden) {
      timer = setTimeout(tick, 5000);
      return;
    }

    const started = Date.now();

    try {
      const response = await api.getProject(id);
      if (cancelled) return;
      failures = 0;
      if (response?.project) {
        applyProject(response.project);
        setPageError(null);
      }
    } catch (err) {
      if (cancelled) return;
      failures += 1;
      setPageError(err?.message || "Failed to refresh project status.");
    }

    if (cancelled) return;

    // wait longer when the server is slow, and back off on errors
    const elapsed = Date.now() - started;
    const delay = Math.min(
      Math.max(3000, elapsed * 2) * 2 ** failures,
      20000
    );
    timer = setTimeout(tick, delay);
  }

  timer = setTimeout(tick, 2500);

  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}, [id, status, applyProject]);

// Run again
async function handleRerun() {
  if (!project?._id || rerunning) return;

  try {
    setRerunning(true);
    setPageError(null);

    const response = await api.rerunProject(project._id);

    if (response?.project) {
      applyProject(response.project);
    } else {
      const refreshed = await api.getProject(project._id);
      applyProject(refreshed?.project);
    }
  } catch (err) {
    setPageError(err?.message || "Failed to run the project again.");
  } finally {
    setRerunning(false);
  }
}

  // ------------------------------------------------------------
  // Loading
  // ------------------------------------------------------------
  if (loading) {
    return <PageLoading />;
  }

  // ------------------------------------------------------------
  // Fatal page error
  // ------------------------------------------------------------
  if (pageError && !project) {
    return (
      <PageShell>
        <div className="mx-auto max-w-3xl px-6 py-12">
          <Link
            to="/projects"
            className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-black"
          >
            <ArrowLeft size={16} />
            Back to Projects
          </Link>

          <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
            <div className="mb-3 flex items-center gap-3">
              <XCircle
                className="text-red-600"
                size={24}
              />

              <h1 className="text-lg font-bold text-red-900">
                Unable to load project
              </h1>
            </div>

            <p className="text-sm text-red-800">
              {pageError}
            </p>
          </div>
        </div>
      </PageShell>
    );
  }

  if (!project) {
    return null;
  }

  // ------------------------------------------------------------
  // QUEUED
  // ------------------------------------------------------------
  if (project.status === "queued") {
    return (
      <QueuedProjectView
        project={project}
        refreshError={pageError}
      />
    );
  }

  // ------------------------------------------------------------
  // RUNNING
  // ------------------------------------------------------------
  if (project.status === "running") {
    return (
      <RunningProjectView
        project={project}
        refreshError={pageError}
      />
    );
  }

  // ------------------------------------------------------------
  // FAILED / INTERRUPTED
  // ------------------------------------------------------------
  if (project.status === "failed") {
    const interrupted =
      project.report?.failure?.interrupted === true;

    return (
      <FailedProjectView
        project={project}
        interrupted={interrupted}
        onRerun={handleRerun}
        rerunning={rerunning}
        refreshError={pageError}
      />
    );
  }

  // ------------------------------------------------------------
  // COMPLETED
  //
  // This is intentionally the ONLY place where the actual
  // Deliverables Dashboard is rendered.
  // ------------------------------------------------------------
  return children({ project });
}

/* ============================================================
   PAGE SHELL
============================================================ */

function PageShell({ children }) {
  return (
    <div className="min-h-screen bg-gray-50">
      {children}
    </div>
  );
}

function PageLoading() {
  return (
    <PageShell>
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
          <Loader2
            size={20}
            className="animate-spin text-gray-700"
          />

          <span className="text-sm font-medium text-gray-700">
            Loading project...
          </span>
        </div>
      </div>
    </PageShell>
  );
}

/* ============================================================
   COMMON HEADER
============================================================ */

function ProjectHeader({
  project,
  statusLabel,
  statusClassName,
  icon,
}) {
  return (
    <div className="border-b border-gray-200 bg-white ">
      <div className="mx-auto max-w-7xl px-6 py-0">
        <Link
          to="/projects"
          className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-black py-0"
        >
          <ArrowLeft size={16} />
          Back to Projects
        </Link>

        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-500">
              <span>
                Smart Lead Finder & Pitcher
              </span>
            </div>

            <h1 className="break-words text-2xl font-bold text-gray-900 md:text-3xl">
              {project.title ||
                "Untitled Project"}
            </h1>

            {project.clientCompanyName && (
              <p className="mt-1 text-sm text-gray-500">
                {project.clientCompanyName}
              </p>
            )}
          </div>

          <div
            className={`inline-flex shrink-0 items-center gap-2 self-start rounded-full border px-3 py-1.5 text-sm font-semibold ${statusClassName}`}
          >
            {icon}
            {statusLabel}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   QUEUED VIEW
============================================================ */

function QueuedProjectView({
  project,
  refreshError,
}) {
  const logs = getProjectLogs(project);

  return (
    <PageShell>
      <ProjectHeader
        project={project}
        statusLabel="Queued"
        statusClassName="border-amber-200 bg-amber-50 text-amber-800"
        icon={<Clock3 size={16} />}
      />

      <main className="mx-auto max-w-7xl px-6 py-8">
        {refreshError && (
          <RefreshWarning
            message={refreshError}
          />
        )}

        <div className="grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
          <section className="rounded-2xl border border-gray-200 bg-white p-7 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <Clock3 size={22} />
              </div>

              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  Project is waiting to start
                </h2>

                <p className="text-sm text-gray-500">
                  Your workflow is safely queued.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
              <p className="text-sm leading-6 text-amber-900">
                This project is currently waiting for
                an available workflow slot. It will
                automatically start when the current
                running project finishes, fails, or is
                interrupted.
              </p>
            </div>

            <div className="mt-6 flex items-center gap-3 text-sm text-gray-600">
              <RefreshCw
                size={17}
                className="animate-spin text-gray-500"
              />

              <span>
                Checking automatically for the next
                workflow state...
              </span>
            </div>

            {project.queuePosition != null && (
              <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Queue position
                </p>

                <p className="mt-1 text-2xl font-bold text-gray-900">
                  #{project.queuePosition}
                </p>
              </div>
            )}
          </section>

          <ProjectInformationCard
            project={project}
          />
        </div>

        <ExecutionLogsPanel
          logs={logs}
          title="Workflow activity"
          description="Activity already recorded for this project."
        />
      </main>
    </PageShell>
  );
}

/* ============================================================
   RUNNING VIEW
============================================================ */

function RunningProjectView({
  project,
  refreshError,
}) {
  const agentRuns = getAgentRuns(project);
  const logs = getProjectLogs(project);

  const currentAgent =
    project.currentAgent ||
    project.report?.currentAgent ||
    getLastAgentName(agentRuns) ||
    "Starting workflow";

  return (
    <PageShell>
      <ProjectHeader
        project={project}
        statusLabel="Running"
        statusClassName="border-blue-200 bg-blue-50 text-blue-800"
        icon={
          <Loader2
            size={16}
            className="animate-spin"
          />
        }
      />

      <main className="mx-auto max-w-7xl px-6 py-8">
        {refreshError && (
          <RefreshWarning
            message={refreshError}
          />
        )}

        <section className="mb-6 rounded-2xl border border-blue-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-wider text-blue-600">
                Current agent
              </p>

              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Terminal size={21} />
                </div>

                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    {prettyAgentName(
                      currentAgent
                    )}
                  </h2>

                  <p className="text-sm text-gray-500">
                    AI workflow is actively processing
                    this project.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">
              <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
              Live execution
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="font-bold text-gray-900">
                Agent progress
              </h2>

              <p className="mt-1 text-xs text-gray-500">
                Recorded agent executions for this
                project.
              </p>
            </div>

            <div className="max-h-[520px] overflow-y-auto divide-y divide-gray-100">
              {agentRuns.length > 0 ? (
                agentRuns.map((run, index) => (
                  <ExecutionAgentRow
                    key={`${run.agent || "agent"}-${index}`}
                    run={run}
                    isCurrent={
                      normalizeAgentName(
                        run.agent
                      ) ===
                      normalizeAgentName(
                        currentAgent
                      )
                    }
                  />
                ))
              ) : (
                <div className="p-6 text-sm text-gray-500">
                  Agent execution details will appear
                  here as the workflow progresses.
                </div>
              )}
            </div>
          </section>

          <ExecutionLogsPanel
            logs={logs}
            title="Live workflow activity"
            description="The activity below refreshes automatically while the project is running."
          />
        </div>
      </main>
    </PageShell>
  );
}

/* ============================================================
   FAILED / INTERRUPTED VIEW
============================================================ */

function FailedProjectView({
  project,
  interrupted,
  onRerun,
  rerunning,
  refreshError,
}) {
  const agentRuns = getAgentRuns(project);
  const logs = getProjectLogs(project);

  const failure =
    project.report?.failure || {};

  const reason =
    failure.reason ||
    project.failureReason ||
    project.errorMessage ||
    project.error ||
    "No specific failure reason was recorded.";

  const failureAgent =
    failure.agent ||
    project.currentAgent ||
    getLastAgentName(agentRuns) ||
    "Unknown agent";

  const failureCompany =
    failure.company || null;

  const failureTime =
    failure.at ||
    project.updatedAt ||
    project.createdAt ||
    null;

  return (
    <PageShell>
      <ProjectHeader
        project={project}
        statusLabel={
          interrupted ? "Interrupted" : "Failed"
        }
        statusClassName={
          interrupted
            ? "border-orange-200 bg-orange-50 text-orange-800"
            : "border-red-200 bg-red-50 text-red-800"
        }
        icon={
          interrupted ? (
            <AlertTriangle size={16} />
          ) : (
            <XCircle size={16} />
          )
        }
      />

      <main className="mx-auto max-w-7xl px-6 py-8">
        {refreshError && (
          <RefreshWarning
            message={refreshError}
          />
        )}

        <section
          className={`mb-6 rounded-2xl border p-6 shadow-sm ${
            interrupted
              ? "border-orange-200 bg-orange-50"
              : "border-red-200 bg-red-50"
          }`}
        >
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div className="flex gap-4">
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
                  interrupted
                    ? "bg-orange-100 text-orange-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {interrupted ? (
                  <AlertTriangle size={24} />
                ) : (
                  <ServerCrash size={24} />
                )}
              </div>

              <div>
                <h2
                  className={`text-xl font-bold ${
                    interrupted
                      ? "text-orange-900"
                      : "text-red-900"
                  }`}
                >
                  {interrupted
                    ? "Project was interrupted"
                    : "Project failed"}
                </h2>

                <p
                  className={`mt-1 text-sm ${
                    interrupted
                      ? "text-orange-800"
                      : "text-red-800"
                  }`}
                >
                  {interrupted
                    ? "The workflow stopped before it could complete."
                    : "The workflow could not complete successfully."}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onRerun}
              disabled={rerunning}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-black px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {rerunning ? (
                <>
                  <Loader2
                    size={16}
                    className="animate-spin"
                  />
                  Running Again...
                </>
              ) : (
                <>
                  <RotateCcw size={16} />
                  Run Again
                </>
              )}
            </button>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <FailureDetail
              label="Failure point"
              value={prettyAgentName(
                failureAgent
              )}
              icon={<Terminal size={16} />}
            />

            {failureCompany && (
              <FailureDetail
                label="Company"
                value={failureCompany}
                icon={<Search size={16} />}
              />
            )}

            <FailureDetail
              label={
                interrupted
                  ? "Interrupted at"
                  : "Recorded at"
              }
              value={formatTimestamp(
                failureTime
              )}
              icon={<Clock3 size={16} />}
            />
          </div>

          <div className="mt-5 rounded-xl border border-black/10 bg-white/70 p-5">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">
              Actual reason
            </p>

            <p className="break-words text-sm leading-6 text-gray-900">
              {reason}
            </p>
          </div>
        </section>

        <section className="mb-6 rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-5 py-4">
            <div className="flex items-center gap-2">
              <Terminal
                size={18}
                className="text-gray-600"
              />

              <h2 className="font-bold text-gray-900">
                Agent execution history
              </h2>
            </div>

            <p className="mt-1 text-xs text-gray-500">
              All recorded agent results up to the point
              where the project stopped.
            </p>
          </div>

          {agentRuns.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {agentRuns.map((run, index) => (
                <ExecutionAgentRow
                  key={`${run.agent || "agent"}-${index}`}
                  run={run}
                  isFailed={isFailedAgent(
                    run,
                    failureAgent
                  )}
                  defaultOpen={isFailedAgent(
                    run,
                    failureAgent
                  )}
                />
              ))}
            </div>
          ) : (
            <div className="p-6 text-sm text-gray-500">
              No agent execution records were saved
              for this project.
            </div>
          )}
        </section>

        <ExecutionLogsPanel
          logs={logs}
          title="Workflow activity"
          description="Recorded execution logs, including the events immediately before the project stopped."
          defaultOpen
        />

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onRerun}
            disabled={rerunning}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-800 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {rerunning ? (
              <>
                <Loader2
                  size={16}
                  className="animate-spin"
                />
                Starting...
              </>
            ) : (
              <>
                <Play size={16} />
                Run Project Again
              </>
            )}
          </button>
        </div>
      </main>
    </PageShell>
  );
}

/* ============================================================
   PROJECT INFORMATION
============================================================ */

function ProjectInformationCard({ project }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="font-bold text-gray-900">
        Project information
      </h2>

      <div className="mt-5 space-y-4">
        <InfoRow
          label="Industry"
          value={project.industry}
        />

        <InfoRow
          label="Target audience"
          value={project.targetAudience}
        />

        <InfoRow
          label="Geographic focus"
          value={project.geographicFocus}
        />

        <InfoRow
          label="Research focus"
          value={project.researchFocus}
        />

        <InfoRow
          label="Target companies"
          value={project.targetCompanies}
        />
      </div>
    </section>
  );
}

function InfoRow({ label, value }) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </p>

      <p className="mt-1 break-words text-sm text-gray-700">
        {Array.isArray(value)
          ? value.join(", ")
          : String(value)}
      </p>
    </div>
  );
}

function FailureDetail({
  label,
  value,
  icon,
}) {
  return (
    <div className="rounded-xl border border-black/10 bg-white/70 p-4">
      <div className="flex items-center gap-2 text-gray-500">
        {icon}

        <span className="text-xs font-semibold uppercase tracking-wide">
          {label}
        </span>
      </div>

      <p className="mt-2 break-words text-sm font-semibold text-gray-900">
        {value || "Unknown"}
      </p>
    </div>
  );
}

/* ============================================================
   AGENT EXECUTION ROW
============================================================ */

function ExecutionAgentRow({
  run,
  isCurrent = false,
  isFailed = false,
  defaultOpen = false,
}) {
  const [open, setOpen] =
    useState(defaultOpen);

  const status = normalizeAgentStatus(
    run?.status
  );

  const failed =
    isFailed ||
    status === "failed" ||
    status === "error";

  const discarded =
    status === "discarded" ||
    status === "skipped";

  const success =
    status === "success" ||
    status === "completed";

  return (
    <div
      className={`${
        failed
          ? "bg-red-50"
          : isCurrent
          ? "bg-blue-50/60"
          : "bg-white"
      }`}
    >
      <button
        type="button"
        onClick={() =>
          setOpen((value) => !value)
        }
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        <div className="shrink-0">
          {open ? (
            <ChevronDown
              size={17}
              className="text-gray-400"
            />
          ) : (
            <ChevronRight
              size={17}
              className="text-gray-400"
            />
          )}
        </div>

        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
          <Terminal size={17} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-bold text-gray-900">
              {prettyAgentName(
                run?.agent
              )}
            </p>

            {isCurrent && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700">
                Current
              </span>
            )}

            {failed && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700">
                Failed
              </span>
            )}
          </div>

          <p className="mt-0.5 text-xs text-gray-500">
            {formatAgentStatus(status)}
            {run?.timestamp
              ? ` · ${formatTimestamp(
                  run.timestamp
                )}`
              : ""}
          </p>
        </div>

        <ExecutionStatusBadge
          status={status}
          failed={failed}
          discarded={discarded}
          success={success}
        />
      </button>

      {open && (
        <div className="border-t border-gray-100 px-5 py-5">
          <div className="grid gap-4 md:grid-cols-2">
            <ExecutionDataBlock
              label="Input"
              value={run?.input}
            />

            <ExecutionDataBlock
              label="Output"
              value={run?.output}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ExecutionStatusBadge({
  status,
  failed,
  discarded,
  success,
}) {
  if (failed) {
    return (
      <span className="shrink-0 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
        Failed
      </span>
    );
  }

  if (discarded) {
    return (
      <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
        Discarded
      </span>
    );
  }

  if (success) {
    return (
      <span className="shrink-0 rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700">
        Completed
      </span>
    );
  }

  return (
    <span className="shrink-0 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-600">
      {formatAgentStatus(status)}
    </span>
  );
}

function ExecutionDataBlock({ label, value }) {
  const text = useMemo(() => formatTechnicalValue(value), [value]);

  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">
        {label}
      </p>

      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs leading-5 text-gray-700">
        {text}
      </pre>
    </div>
  );
}

/* ============================================================
   LOGS
============================================================ */

function ExecutionLogsPanel({
  logs,
  title,
  description,
  defaultOpen = true,
}) {
  const [open, setOpen] =
    useState(defaultOpen);

  return (
    <section className="mt-6 rounded-2xl border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() =>
          setOpen((value) => !value)
        }
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        {open ? (
          <ChevronDown
            size={18}
            className="text-gray-400"
          />
        ) : (
          <ChevronRight
            size={18}
            className="text-gray-400"
          />
        )}

        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
          <Terminal size={17} />
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-gray-900">
            {title}
          </h2>

          {description && (
            <p className="mt-1 text-xs text-gray-500">
              {description}
            </p>
          )}
        </div>

        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">
          {logs.length}
        </span>
      </button>

      {open && (
        <div className="border-t border-gray-200">
          {logs.length > 0 ? (
            <div className="max-h-[520px] overflow-auto">
              {logs.map((log, index) => (
                <LogRow
                  key={`${log.timestamp || "log"}-${index}`}
                  log={log}
                />
              ))}
            </div>
          ) : (
            <div className="p-6 text-sm text-gray-500">
              No workflow activity has been
              recorded yet.
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function LogRow({ log }) {
  const level = String(
    log?.level || "info"
  ).toLowerCase();

  const levelClass =
    level === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : level === "warn" || level === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : level === "success"
      ? "border-green-200 bg-green-50 text-green-700"
      : "border-gray-200 bg-gray-50 text-gray-600";

  const message = String(
    log?.message || "Workflow event"
  );

  // Split the main message from the metric/details section.
  const parts = message.split(" • ");

  const mainMessage = parts[0];
  const details = parts.slice(1);

  return (
    <div className="border-b border-gray-100 px-5 py-3 last:border-b-0">
      {/* Header row: level + agent */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${levelClass}`}
        >
          {level}
        </span>

        {log?.agent && (
          <span className="text-xs font-semibold text-gray-700">
            {prettyAgentName(log.agent)}
          </span>
        )}
      </div>

      {/* Main message */}
      <div className="mt-2 min-w-0">
        <p className="break-words text-sm font-medium leading-6 text-gray-800">
          {mainMessage}
        </p>

        {/* Details appear underneath instead of in the same row */}
        {details.length > 0 && (
          <div className="mt-1.5 space-y-1">
            {details.map((detail, index) => (
              <p
                key={`${detail}-${index}`}
                className="break-words text-xs leading-5 text-gray-500"
              >
                {detail}
              </p>
            ))}
          </div>
        )}

        {log?.timestamp && (
          <p className="mt-2 text-[11px] text-gray-400">
            {formatTimestamp(log.timestamp)}
          </p>
        )}
      </div>
    </div>
  );
}

function RefreshWarning({ message }) {
  return (
    <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <AlertTriangle
        size={17}
        className="mt-0.5 shrink-0"
      />

      <div>
        <p className="font-semibold">
          Temporary refresh issue
        </p>

        <p className="mt-0.5">
          {message}
        </p>
      </div>
    </div>
  );
}

/* ============================================================
   HELPERS FOR EXECUTION DATA
============================================================ */

function getAgentRuns(project) {
  if (
    Array.isArray(project?.agentRuns) &&
    project.agentRuns.length > 0
  ) {
    return project.agentRuns;
  }

  if (
    Array.isArray(
      project?.report?.agentResults
    ) &&
    project.report.agentResults.length > 0
  ) {
    return project.report.agentResults.map(
      (item) => ({
        agent:
          item.agent || item.name,
        input:
          item.input ??
          item.inputSummary ??
          item.request ??
          "",
        output:
          item.output ??
          item.outputSummary ??
          item.result ??
          "",
        status:
          item.status || "success",
        timestamp: item.timestamp,
      })
    );
  }

  return [];
}

function getProjectLogs(project) {
  if (
    Array.isArray(project?.agentLogs) &&
    project.agentLogs.length > 0
  ) {
    return [
      ...project.agentLogs,
    ]
      .reverse()
      .slice(0, 100);
  }

  if (
    Array.isArray(project?.logs) &&
    project.logs.length > 0
  ) {
    return [...project.logs]
      .reverse()
      .slice(0, 100);
  }

  return [];
}

function getLastAgentName(agentRuns) {
  if (
    !Array.isArray(agentRuns) ||
    agentRuns.length === 0
  ) {
    return null;
  }

  for (
    let index = agentRuns.length - 1;
    index >= 0;
    index -= 1
  ) {
    if (agentRuns[index]?.agent) {
      return agentRuns[index].agent;
    }
  }

  return null;
}

function isFailedAgent(
  run,
  failureAgent
) {
  if (!run) return false;

  const sameAgent =
    normalizeAgentName(run.agent) ===
    normalizeAgentName(failureAgent);

  const status =
    normalizeAgentStatus(run.status);

  return (
    sameAgent &&
    (status === "failed" ||
      status === "error" ||
      status === "running" ||
      status === "started" ||
      status === "in_progress" ||
      !run.status)
  );
}

function normalizeAgentName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/agent$/i, "")
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeAgentStatus(value) {
  return String(value || "unknown")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function formatAgentStatus(status) {
  const normalized =
    normalizeAgentStatus(status);

  const labels = {
    success: "Completed",
    completed: "Completed",
    failed: "Failed",
    error: "Error",
    discarded: "Discarded",
    skipped: "Skipped",
    running: "Running",
    started: "Started",
    in_progress: "In progress",
    pending: "Pending",
    queued: "Queued",
    unknown: "Recorded",
  };

  return (
    labels[normalized] ||
    normalized
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) =>
        char.toUpperCase()
      )
  );
}

function prettyAgentName(value) {
  if (!value) {
    return "Unknown Agent";
  }

  const cleaned = String(value)
    .replace(/\bAgent\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || "Unknown Agent";
}

function formatTimestamp(value) {
  if (!value) return "Unknown";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString();
}

const MAX_TECH_CHARS = 20000;

function formatTechnicalValue(value) {
  if (value === undefined || value === null || value === "") {
    return "No data recorded.";
  }

  let text;
  if (typeof value === "string") {
    text = value;
  } else {
    try {
      text = JSON.stringify(value, null, 2);
    } catch {
      text = String(value);
    }
  }

  return text.length > MAX_TECH_CHARS
    ? `${text.slice(0, MAX_TECH_CHARS)}\n\n… truncated (${text.length.toLocaleString()} characters total)`
    : text;
}