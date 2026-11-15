import { useState } from "react";

const STATUS_STYLES = {
  SUCCESS: "bg-emerald-50 text-emerald-700",
  DISCARDED: "bg-amber-50 text-amber-700",
  FAILED: "bg-red-50 text-red-700",
};

const ROW_BORDER = {
  SUCCESS: "border-slate-200",
  DISCARDED: "border-amber-200",
  FAILED: "border-red-300",
};

const MAX_JSON_CHARS = 6000;

function pretty(value) {
  if (value === null || value === undefined) return "—";

  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);

  return text.length > MAX_JSON_CHARS ? `${text.slice(0, MAX_JSON_CHARS)}\n… (truncated)` : text;
}

function StepRow({ step, index, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);

  const status = String(step.status || "").toUpperCase();
  const problem = status !== "SUCCESS";
  const seconds = step.durationMs != null ? `${(step.durationMs / 1000).toFixed(1)}s` : null;

  return (
    <li className={`rounded-xl border bg-white ${ROW_BORDER[status] ?? "border-slate-200"}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-3">
          <span className="text-xs font-mono text-slate-400">{index + 1}</span>
          <span className="font-medium text-slate-900">
            {step.name}
            {step.company ? ` — ${step.company}` : ""}
          </span>
        </span>

        <span className="flex items-center gap-3">
          {seconds && <span className="text-xs text-slate-400">{seconds}</span>}
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? "bg-slate-100 text-slate-600"}`}>
            {status || "UNKNOWN"}
          </span>
          <span className="text-slate-400">{open ? "−" : "+"}</span>
        </span>
      </button>

      {problem && step.reason && (
        <p className="border-t border-slate-100 px-4 py-2 text-sm text-slate-700">
          <span className="font-medium">Why: </span>
          {step.reason}
        </p>
      )}

      {open && (
        <div className="space-y-3 border-t border-slate-100 px-4 py-3">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Input</p>
            <pre className="max-h-64 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{pretty(step.input)}</pre>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Output</p>
            <pre className="max-h-64 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{pretty(step.output)}</pre>
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * Shows every agent step the project has produced so far.
 * Works for running, failed, interrupted and completed projects.
 * Steps that did not succeed are outlined and show their reason; the last problem step opens by default.
 */
export default function AgentResultsPanel({ report, failedCompanies }) {
  const steps = Array.isArray(report?.agentResults) ? report.agentResults : [];
  const failure = report?.failure;

  if (!steps.length && !failure) return null;

  let lastProblem = -1;

  steps.forEach((step, index) => {
    if (String(step.status || "").toUpperCase() !== "SUCCESS") lastProblem = index;
  });

  const discarded = Array.isArray(failedCompanies) ? failedCompanies : [];

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">Agent results</h3>
        <p className="text-sm text-slate-500">What each agent received, produced and, if it stopped, why.</p>
      </div>

      {failure && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-medium">
            {failure.interrupted ? "The run was interrupted" : "The run stopped"}
            {failure.agent ? ` at ${failure.agent}` : ""}
          </p>
          {failure.reason && <p className="mt-1">{failure.reason}</p>}
          {failure.at && <p className="mt-1 text-xs text-red-600">{new Date(failure.at).toLocaleString()}</p>}
        </div>
      )}

      {steps.length > 0 && (
        <ol className="space-y-2">
          {steps.map((step, index) => (
            <StepRow
              key={`${step.agent}-${step.company ?? ""}-${index}`}
              step={step}
              index={index}
              defaultOpen={index === lastProblem && Boolean(failure)}
            />
          ))}
        </ol>
      )}

      {discarded.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-slate-900">Companies that did not make it</h4>
          <ul className="space-y-1 text-sm text-slate-700">
            {discarded.map((item, index) => (
              <li key={`${item.companyName}-${index}`} className="rounded-lg bg-slate-50 px-3 py-2">
                <span className="font-medium">{item.companyName}</span>
                <span className="text-slate-500"> — stopped at {item.stage}: </span>
                {item.error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
