// Agent log emitter.
// Each project's log stream is pushed to Mongo (Project.agentLogs) and broadcast to any SSE
// subscribers watching that project in real time.

import { emitAgentLog } from "./liveLog.js";

const subscribers = new Map(); // projectKey -> Set<res>
const history = new Map(); // projectKey -> entry[]

const MAX_HISTORY = 500;
const HISTORY_TTL_MS = 10 * 60 * 1000;
const KEEPALIVE_MS = 15000;

const keyOf = (projectId) => String(projectId);

function writeChunk(res, chunk) {
  res.write(chunk);

  if (typeof res.flush === "function") {
    res.flush();
  }
}

function writeEntry(res, entry) {
  writeChunk(res, `data: ${JSON.stringify(entry)}\n\n`);
}

export function subscribe(projectId, res) {
  const key = keyOf(projectId);

  if (!subscribers.has(key)) {
    subscribers.set(key, new Set());
  }

  subscribers.get(key).add(res);

  // Replay what happened before this browser connected.
  for (const entry of history.get(key) ?? []) {
    try {
      writeEntry(res, entry);
    } catch {
      break;
    }
  }

  const timer = setInterval(() => {
    try {
      writeChunk(res, ": ping\n\n");
    } catch {
      clearInterval(timer);
    }
  }, KEEPALIVE_MS);

  timer.unref?.();

  res.once?.("close", () => {
    clearInterval(timer);
    unsubscribe(projectId, res);
  });
}

export function unsubscribe(projectId, res) {
  const key = keyOf(projectId);
  const set = subscribers.get(key);

  set?.delete(res);

  if (set && set.size === 0) {
    subscribers.delete(key);
  }
}

export function broadcast(projectId, logEntry) {
  const key = keyOf(projectId);

  const list = history.get(key) ?? [];
  list.push(logEntry);

  if (list.length > MAX_HISTORY) {
    list.splice(0, list.length - MAX_HISTORY);
  }

  history.set(key, list);

  // Free memory after the run ends.
  if (/^Run (completed|failed)/.test(String(logEntry.message ?? ""))) {
    const timer = setTimeout(() => history.delete(key), HISTORY_TTL_MS);
    timer.unref?.();
  }

  const set = subscribers.get(key);

  if (!set || set.size === 0) {
    return;
  }

  for (const res of set) {
    try {
      writeEntry(res, logEntry);
    } catch {
      set.delete(res);
    }
  }
}

export function makeLogger(projectId, ProjectModel) {
  // A new logger means a new run (or a re-run): start with a clean history.
  history.delete(keyOf(projectId));

  return async function log(agentOrObj, message, level = "info") {
    let cleanAgent = "Orchestrator";
    let cleanMessage = "";
    let cleanLevel = level;

    // Guard against object being passed as first argument
    if (typeof agentOrObj === "object" && agentOrObj !== null) {
      if (typeof agentOrObj.message === "string") {
        cleanMessage = agentOrObj.message;
        cleanAgent = typeof agentOrObj.agent === "string" ? agentOrObj.agent : "Orchestrator";
        cleanLevel = agentOrObj.level || level || "info";
      } else {
        cleanAgent = "Orchestrator";
        cleanMessage = typeof message === "string" ? message : "Workflow step in progress";
      }
    } else if (typeof agentOrObj === "string") {
      cleanAgent = agentOrObj;
      cleanMessage = typeof message === "string" ? message : "";
    }

    if (!cleanMessage) {
      cleanMessage = "Activity logged";
    }

    // Normalize level ("warning" -> "warn")
    if (cleanLevel === "warning") cleanLevel = "warn";

    const entry = {
  ...(typeof agentOrObj === "object" && agentOrObj !== null
    ? agentOrObj
    : {}),
  agent: String(cleanAgent),
  message: String(cleanMessage),
  level: String(cleanLevel === "warning" ? "warn" : cleanLevel),
  timestamp: new Date().toISOString(),
};

    console.log(`[${projectId}] [${entry.agent}] ${entry.message}`);

    // Emit live to browser SSE and in-memory liveLog bus
    broadcast(projectId, entry);
    try {
      if (typeof emitAgentLog === "function") {
        emitAgentLog(entry.agent, entry.level, entry.message);
      }
    } catch {}

    // Save safely to Mongo
    if (ProjectModel) {
      try {
        await ProjectModel.updateOne(
          { _id: projectId },
          { $push: { agentLogs: entry } }
        );
      } catch (error) {
        console.error(`[logger] could not save log for project ${projectId}:`, error?.message || error);
      }
    }

    return entry;
  };
}