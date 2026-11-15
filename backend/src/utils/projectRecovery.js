/**
 * Keeps project status honest.
 *
 * A run lives inside the Node process. If that process stops (nodemon restart, crash, Ctrl+C) the run
 * dies, but MongoDB still says "running". This module fixes that in three ways:
 *
 *   1. recoverInterruptedProjects()  at startup: no run can be active in a fresh process, so every
 *      project still marked "running" was interrupted. Mark it failed with a clear reason.
 *   2. installShutdownHandlers()     on SIGINT / SIGTERM / nodemon's SIGUSR2: mark the runs this
 *      process was executing as interrupted before it exits.
 *   3. startStaleWatchdog()          every minute: a "running" project that no active run owns (and is
 *      older than a minute) is marked failed. Covers crashes that skip the handlers above.
 *
 * Interrupted projects get status "failed" plus report.failure { interrupted: true, reason, agent },
 * a "System" error line in agentLogs, and keep every agent step already saved, so the project page
 * can show where it stopped.
 */

import Project from "../models/Project.js";

const activeRuns = new Set();

const WATCHDOG_INTERVAL_MS = 60 * 1000;
const WATCHDOG_MIN_AGE_MS = 60 * 1000;

export function registerRun(projectId) {
  activeRuns.add(String(projectId));
}

export function unregisterRun(projectId) {
  activeRuns.delete(String(projectId));
}

async function markInterrupted(filter, reason) {
  const projects = await Project.find({ ...filter, status: "running" })
    .select("_id report currentAgent")
    .lean();

  for (const project of projects) {
    const now = new Date();

    const failure = {
      agent: project.currentAgent ?? null,
      company: null,
      reason,
      interrupted: true,
      at: now.toISOString(),
    };

    const entry = {
      agent: "System",
      message: `Run interrupted${project.currentAgent ? ` while "${project.currentAgent}" was running` : ""}: ${reason}`,
      level: "error",
      timestamp: now.toISOString(),
    };

    await Project.updateOne(
      { _id: project._id, status: "running" },
      {
        status: "failed",
        currentAgent: null,
        report: {
          ...(project.report && typeof project.report === "object" ? project.report : {}),
          status: "failed",
          failure,
          updatedAt: now.toISOString(),
        },
        $push: { agentLogs: entry },
      },
    );

    console.warn(`[recovery] project ${project._id} marked as interrupted: ${reason}`);
  }

  return projects.length;
}

/** Call once after the database connects, before the server starts accepting requests. */
export async function recoverInterruptedProjects() {
  try {
    const count = await markInterrupted({}, "the server restarted while this project was running.");

    if (count) {
      console.warn(`[recovery] ${count} interrupted project(s) were marked as failed.`);
    }

    return count;
  } catch (error) {
    console.error("[recovery] could not check for interrupted projects:", error?.message || error);
    return 0;
  }
}

/** Marks the runs this process owns as interrupted when the process is told to stop. */
export function installShutdownHandlers() {
  let shuttingDown = false;

  const markOwnRuns = async () => {
    if (!activeRuns.size) return;

    try {
      await markInterrupted(
        { _id: { $in: [...activeRuns] } },
        "the server was stopped or restarted while this project was running.",
      );
    } catch (error) {
      console.error("[recovery] shutdown cleanup failed:", error?.message || error);
    }
  };

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, async () => {
      if (shuttingDown) return;

      shuttingDown = true;

      await markOwnRuns();

      process.exit(0);
    });
  }

  // nodemon restarts the app by sending SIGUSR2 and expects the process to re-send it when ready.
  process.once("SIGUSR2", async () => {
    await markOwnRuns();

    process.kill(process.pid, "SIGUSR2");
  });
}

/** Safety net for runs that vanished without the handlers above firing. */
export function startStaleWatchdog() {
  const timer = setInterval(async () => {
    try {
      await markInterrupted(
        {
          _id: { $nin: [...activeRuns] },
          createdAt: { $lt: new Date(Date.now() - WATCHDOG_MIN_AGE_MS) },
        },
        "no active worker was found for this project (the run stopped unexpectedly).",
      );
    } catch (error) {
      console.error("[recovery] watchdog check failed:", error?.message || error);
    }
  }, WATCHDOG_INTERVAL_MS);

  timer.unref?.();

  return timer;
}
