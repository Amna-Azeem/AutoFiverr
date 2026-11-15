import { useEffect, useRef } from "react";

const levelColor = {
  info: "text-slate-600",
  success: "text-emerald-600",
  warn: "text-blue-600",
  error: "text-red-500",
};

export default function AgentLogStream({ logs, currentAgent, status }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs.length]);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5">
        <span className="text-xs font-mono text-slate-500">agent_log_stream</span>
        <span className="flex items-center gap-2 text-xs font-mono">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              status === "running"
                ? "bg-blue-600 animate-pulse"
                : status === "completed"
                ? "bg-emerald-500"
                : status === "failed"
                ? "bg-red-500"
                : "bg-slate-300"
            }`}
          />
          <span className="text-slate-500">
            {status === "running" ? currentAgent || "orchestrating..." : status}
          </span>
        </span>
      </div>
      <div ref={scrollRef} className="h-72 space-y-1.5 overflow-y-auto px-4 py-3 font-mono text-xs">
        {logs.length === 0 && <p className="text-slate-400">Waiting for the first agent to start...</p>}
        {logs.map((entry, i) => (
          <p key={i} className={levelColor[entry.level] || "text-slate-600"}>
            <span className="text-slate-400">{new Date(entry.timestamp).toLocaleTimeString()}</span>{" "}
            <span className="text-blue-600">[{entry.agent}]</span> {entry.message}
          </p>
        ))}
      </div>
    </div>
  );
}
