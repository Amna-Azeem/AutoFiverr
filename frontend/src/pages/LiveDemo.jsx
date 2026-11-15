
import { useEffect, useState } from "react";

const GENERAL_EVENTS = [
  {
    type: "Workflow",
    text: "Initializing a new AI agency workflow...",
  },
  {
    type: "Orchestrator",
    text: "Coordinating specialized agents for the requested task...",
  },
  {
    type: "Research",
    text: "Gathering relevant information and available sources...",
  },
  {
    type: "Analysis",
    text: "Analyzing collected information and identifying useful insights...",
  },
  {
    type: "Agent",
    text: "A specialized agent is processing its assigned task...",
  },
  {
    type: "Collaboration",
    text: "Passing results between agents for the next workflow stage...",
  },
  {
    type: "Quality",
    text: "Reviewing generated results for accuracy and consistency...",
  },
  {
    type: "Refinement",
    text: "Refining the output based on workflow requirements...",
  },
  {
    type: "Output",
    text: "Structuring the final results into usable deliverables...",
  },
  {
    type: "Complete",
    text: "Workflow completed and results are ready...",
  },
];

export default function LiveDemo() {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    let idx = 0;

    setEvents([]);

    const timer = setInterval(() => {
      setEvents((current) => [
        ...current,
        GENERAL_EVENTS[idx % GENERAL_EVENTS.length],
      ]);

      idx += 1;
    }, 1800);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-6 py-0">
      <div className="mb-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
          AutoFiverr
        </p>

        <h1 className="text-2xl font-semibold text-slate-900">
          Live Workflow Activity
        </h1>

        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
          A preview of how AutoFiverr coordinates specialized AI agents
          across its different agency workflows.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />

            <span className="text-xs font-medium text-slate-600">
              Agents active
            </span>
          </div>

          <span className="text-xs text-slate-400">
            {events.length} workflow events
          </span>
        </div>

        {/* Scrollable activity area */}
        <div className="h-72 overflow-y-auto pr-2">
          {events.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Initializing AI workflow...
            </div>
          ) : (
            <ul className="space-y-3">
              {events
                .slice()
                .reverse()
                .map((event, index) => (
                  <li
                    key={`${event.type}-${index}`}
                    className={`rounded-lg border px-4 py-3 ${
                      index === 0
                        ? "border-blue-100 bg-white shadow-sm"
                        : "border-transparent bg-white/50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                          index === 0
                            ? "animate-pulse bg-blue-500"
                            : "bg-slate-300"
                        }`}
                      />

                      <div className="min-w-0">
                        <span className="mr-2 text-xs font-semibold uppercase tracking-wide text-blue-600">
                          [{event.type}]
                        </span>

                        <span className="text-sm text-slate-700">
                          {event.text}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </div>

        {/* Footer hint */}
        <div className="mt-4 border-t border-slate-200 pt-3 text-center">
          <span className="text-xs text-slate-400">
            Scroll to view workflow activity
          </span>
        </div>
      </div>
    </div>
  );
}

