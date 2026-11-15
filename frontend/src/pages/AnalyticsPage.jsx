import { useEffect, useMemo, useState } from "react";
import "./analytics.css";
import { api } from "../api/client.js";

const RUNNING_TIMEOUT_MS = 5 * 60 * 1000;

const AGENCY_META = {
  blue: {
    icon: "✦",
    color: "blue",
  },
  purple: {
    icon: "◈",
    color: "purple",
  },
  green: {
    icon: "◆",
    color: "green",
  },
  orange: {
    icon: "⌁",
    color: "orange",
  },
  pink: {
    icon: "▣",
    color: "pink",
  },
};

/* -------------------------------------------------------
   ICONS
------------------------------------------------------- */

function Icon({ type }) {
  const paths = {
    calendar:
      "M6 3v3m12-3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",

    clock:
      "M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",

    folder2:
      "M4 5h6l2 2h8v12H4V5Z",

    robot:
      "M8 9h8a3 3 0 0 1 3 3v5H5v-5a3 3 0 0 1 3-3Zm4-5v5m-5 8v3m10-3v3M9 13h.01M15 13h.01",

    gear:
      "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5 1 2.1 2.2.6 1.9-1.1 2.1 2.1-1.1 1.9.6 2.2L21 12l-2.1 1 .6 2.2 1.1 1.9-2.1 2.1-1.9-1.1-2.2.6L12 21l-1-2.1-2.2-.6-1.9 1.1-2.1-2.1 1.1-1.9-.6-2.2L3 12l2.1-1-.6-2.2-1.1-1.9 2.1-2.1 1.9 1.1 2.2-.6L12 3Z",
  };

  return (
    <svg
      className="af-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[type]} />
    </svg>
  );
}

/* -------------------------------------------------------
   SUMMARY CARD ICON
------------------------------------------------------- */

function Spark({ type }) {
  const iconType =
    type === "projects"
      ? "folder2"
      : type === "agencies"
      ? "robot"
      : type === "leads"
      ? "gear"
      : "clock";

  return (
    <div className="af-card-icon">
      <Icon type={iconType} />
    </div>
  );
}

/* -------------------------------------------------------
   PROJECT STATUS
------------------------------------------------------- */

function isTimedOut(project) {
  if (
    project.status !== "running" &&
    project.status !== "queued"
  ) {
    return false;
  }

  const startedAt =
    project.stats?.startedAt ||
    project.startedAt ||
    project.updatedAt ||
    project.createdAt;

  if (!startedAt) return false;

  const time = new Date(startedAt).getTime();

  if (Number.isNaN(time)) return false;

  return Date.now() - time > RUNNING_TIMEOUT_MS;
}

function displayStatus(project) {
  if (project.status === "completed") {
    return "completed";
  }

  if (
    (project.status === "running" ||
      project.status === "queued") &&
    !isTimedOut(project)
  ) {
    return "running";
  }

  return "failed";
}

/* -------------------------------------------------------
   AGENCY HELPERS
------------------------------------------------------- */

function getAgency(project) {
  return (
    project.agencyName ||
    project.agency ||
    project.agencySlug ||
    "Unknown Agency"
  );
}

function getAgencySlug(project) {
  return (
    project.agencySlug ||
    project.agency ||
    "unknown"
  );
}

function formatAgencyName(name) {
  if (!name) return "Unknown Agency";

  return name
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}

/* -------------------------------------------------------
   RUNTIME HELPERS
------------------------------------------------------- */

function formatRuntime(ms) {
  if (!ms || Number.isNaN(Number(ms))) {
    return "—";
  }

  return `${Math.round(Number(ms) / 1000)}s`;
}

function getProjectRuntime(project) {
  if (project.stats?.durationMs) {
    return project.stats.durationMs;
  }

  if (
    project.stats?.startedAt &&
    project.stats?.completedAt
  ) {
    return (
      new Date(
        project.stats.completedAt
      ).getTime() -
      new Date(
        project.stats.startedAt
      ).getTime()
    );
  }

  return 0;
}

/* -------------------------------------------------------
   PROJECT ACTIVITY LINE CHART
------------------------------------------------------- */

function LineChart({ projects, dateRange }) {
  const chartData = useMemo(() => {
    const validProjects = projects.filter(
      (project) => project.createdAt
    );

    /*
     * ALL TIME
     */
    if (dateRange === "all") {
      if (!validProjects.length) {
        return {
          days: [],
          values: [],
          mode: "day",
        };
      }

      const dates = validProjects
        .map(
          (project) =>
            new Date(project.createdAt)
        )
        .filter(
          (date) =>
            !Number.isNaN(date.getTime())
        )
        .sort((a, b) => a - b);

      const firstDate = new Date(dates[0]);

      firstDate.setHours(0, 0, 0, 0);

      const lastDate = new Date();

      lastDate.setHours(0, 0, 0, 0);

      const difference =
        Math.ceil(
          (lastDate.getTime() -
            firstDate.getTime()) /
            (1000 * 60 * 60 * 24)
        ) + 1;

      /*
       * If the history is longer than 120 days,
       * use monthly buckets.
       */
      if (difference > 120) {
        const months = [];

        const current = new Date(
          firstDate.getFullYear(),
          firstDate.getMonth(),
          1
        );

        while (current <= lastDate) {
          months.push(
            new Date(current)
          );

          current.setMonth(
            current.getMonth() + 1
          );
        }

        const values = months.map(
          (month) => {
            const nextMonth =
              new Date(month);

            nextMonth.setMonth(
              nextMonth.getMonth() + 1
            );

            return validProjects.filter(
              (project) => {
                const created =
                  new Date(
                    project.createdAt
                  );

                return (
                  created >= month &&
                  created < nextMonth
                );
              }
            ).length;
          }
        );

        return {
          days: months,
          values,
          mode: "month",
        };
      }

      /*
       * If all-time history is short,
       * use daily points.
       */
      const days = [];

      for (
        let i = difference - 1;
        i >= 0;
        i--
      ) {
        const date = new Date(
          lastDate
        );

        date.setDate(
          date.getDate() - i
        );

        days.push(date);
      }

      const values = days.map((day) => {
        const nextDay = new Date(day);

        nextDay.setDate(
          nextDay.getDate() + 1
        );

        return validProjects.filter(
          (project) => {
            const created =
              new Date(
                project.createdAt
              );

            return (
              created >= day &&
              created < nextDay
            );
          }
        ).length;
      });

      return {
        days,
        values,
        mode: "day",
      };
    }

    /*
     * 7 / 30 / 90 DAYS
     */
    const days = [];

    for (
      let i = dateRange - 1;
      i >= 0;
      i--
    ) {
      const date = new Date();

      date.setHours(0, 0, 0, 0);

      date.setDate(
        date.getDate() - i
      );

      days.push(date);
    }

    const values = days.map((day) => {
      const nextDay = new Date(day);

      nextDay.setDate(
        nextDay.getDate() + 1
      );

      return validProjects.filter(
        (project) => {
          const created =
            new Date(
              project.createdAt
            );

          return (
            created >= day &&
            created < nextDay
          );
        }
      ).length;
    });

    return {
      days,
      values,
      mode: "day",
    };
  }, [projects, dateRange]);

  const { days, values, mode } =
    chartData;

  const maxValue = Math.max(
    5,
    ...values
  );

  const width = 600;
  const height = 190;

  const left = 38;
  const right = 14;
  const top = 12;
  const bottom = 30;

  const x = (index) =>
    left +
    index *
      ((width - left - right) /
        Math.max(
          values.length - 1,
          1
        ));

  const y = (value) =>
    top +
    (maxValue - value) *
      ((height - top - bottom) /
        maxValue);

  const line = values
    .map(
      (value, index) =>
        `${x(index)},${y(value)}`
    )
    .join(" ");

  const area =
    values.length > 0
      ? `${left},${
          height - bottom
        } ${line} ${x(
          values.length - 1
        )},${height - bottom}`
      : "";

  /*
   * Generate up to 5 labels regardless
   * of selected date range.
   */
  const labelIndexes = [];

  if (days.length === 1) {
    labelIndexes.push(0);
  } else if (days.length > 1) {
    const count = Math.min(
      5,
      days.length
    );

    for (let i = 0; i < count; i++) {
      const index = Math.round(
        (i * (days.length - 1)) /
          (count - 1)
      );

      if (
        !labelIndexes.includes(index)
      ) {
        labelIndexes.push(index);
      }
    }
  }

  return (
    <svg
      className="af-line-chart"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      {[0, 25, 50, 75, 100].map(
        (percentage) => {
          const value =
            (maxValue *
              percentage) /
            100;

          return (
            <g key={percentage}>
              <line
                x1={left}
                x2={width - right}
                y1={y(value)}
                y2={y(value)}
                className="grid-line"
              />

              <text
                x="4"
                y={y(value) + 4}
                className="axis-label"
              >
                {Math.round(value)}
              </text>
            </g>
          );
        }
      )}

      {labelIndexes.map(
        (index) => (
          <line
            key={`vertical-${index}`}
            x1={x(index)}
            x2={x(index)}
            y1={top}
            y2={height - bottom}
            className="grid-line vertical"
          />
        )
      )}

      {values.length > 0 && (
        <>
          <polygon
            points={area}
            className="chart-area"
          />

          <polyline
            points={line}
            className="chart-line"
          />

          {values.map(
            (value, index) => (
              <circle
                key={index}
                cx={x(index)}
                cy={y(value)}
                r="3.1"
                className="chart-dot"
              />
            )
          )}
        </>
      )}

      {labelIndexes.map(
        (index) => (
          <text
            key={`label-${index}`}
            x={x(index)}
            y={height - 8}
            className="axis-label"
            textAnchor={
              index ===
              labelIndexes[
                labelIndexes.length - 1
              ]
                ? "end"
                : "middle"
            }
          >
            {formatChartDate(
              days[index],
              mode
            )}
          </text>
        )
      )}
    </svg>
  );
}

function formatChartDate(
  date,
  mode
) {
  if (!date) return "";

  if (mode === "month") {
    return date.toLocaleDateString(
      "en-US",
      {
        month: "short",
        year: "numeric",
      }
    );
  }

  return date.toLocaleDateString(
    "en-US",
    {
      month: "short",
      day: "numeric",
    }
  );
}

/* -------------------------------------------------------
   DONUT
------------------------------------------------------- */

function Donut({ usage }) {
  const total =
    usage.reduce(
      (sum, item) =>
        sum + item.value,
      0
    ) || 1;

  let current = 0;

  const colors = [
    "#1967dd",
    "#7138db",
    "#13a66a",
    "#f28b22",
    "#8798b2",
  ];

  const gradient = usage
    .map((item, index) => {
      const start = current;

      const end =
        current +
        (item.value / total) *
          100;

      current = end;

      return `${
        colors[
          index % colors.length
        ]
      } ${start}% ${end}%`;
    })
    .join(", ");

  return (
    <div className="donut-wrap">
      <div
        className="donut"
        style={{
          background: `conic-gradient(${gradient})`,
        }}
      >
        <div className="donut-hole">
          <strong>{total}</strong>

          <span>
            Total Projects
          </span>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------
   RECENT ACTIVITY
------------------------------------------------------- */

function getRecentActivity(projects) {
  return [...projects]
    .filter((project) => project.createdAt || project.updatedAt)
    .sort((a, b) => {
      const dateA = new Date(
        a.updatedAt || a.createdAt
      ).getTime();

      const dateB = new Date(
        b.updatedAt || b.createdAt
      ).getTime();

      return dateB - dateA;
    })
    .slice(0, 5)
    .map((project) => ({
      id: project._id || project.id,

      title:
        project.title ||
        "Untitled Project",

      description:
        project.status === "completed"
          ? "Project completed"
          : project.status === "running"
          ? "Project is running"
          : project.status === "failed"
          ? "Project failed"
          : "Project created",

      timestamp: new Date(
        project.updatedAt ||
        project.createdAt
      ),

      level:
        project.status === "completed"
          ? "success"
          : project.status === "failed"
          ? "error"
          : "info",
    }));
}
function timeAgo(date) {
  const seconds = Math.floor(
    (Date.now() -
      date.getTime()) /
      1000
  );

  if (seconds < 60) {
    return `${Math.max(
      seconds,
      1
    )} sec ago`;
  }

  const minutes = Math.floor(
    seconds / 60
  );

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.floor(
    minutes / 60
  );

  if (hours < 24) {
    return `${hours} hr ago`;
  }

  return `${Math.floor(
    hours / 24
  )} days ago`;
}

/* -------------------------------------------------------
   MAIN ANALYTICS PAGE
------------------------------------------------------- */

export default function Analytics() {
  const [
    projects,
    setProjects,
  ] = useState([]);

  const [
    agencies,
    setAgencies,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState("");

  /*
   * 7, 30, 90 or "all"
   */
  const [
    dateRange,
    setDateRange,
  ] = useState(30);

  const [
    showRangeMenu,
    setShowRangeMenu,
  ] = useState(false);

  /* -----------------------------------------------------
     LOAD DATA
  ----------------------------------------------------- */

  useEffect(() => {
    let active = true;

    async function loadAnalytics() {
      try {
        const [
          projectResponse,
          agencyResponse,
        ] = await Promise.all([
          api.listProjects(),
          api.listAgencies(),
        ]);

        if (!active) return;

        setProjects(
          projectResponse.projects ||
            []
        );

        setAgencies(
          agencyResponse.agencies ||
            []
        );
      } catch (err) {
        if (!active) return;

        setError(
          err.message ||
            "Failed to load analytics."
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadAnalytics();

    return () => {
      active = false;
    };
  }, []);

  /* -----------------------------------------------------
     FILTER PROJECTS BY DATE RANGE
  ----------------------------------------------------- */

  const filteredProjects =
    useMemo(() => {
      if (dateRange === "all") {
        return projects;
      }

      const cutoff =
        new Date();

      cutoff.setHours(
        0,
        0,
        0,
        0
      );

      /*
       * Include today plus the
       * previous selected-1 days.
       */
      cutoff.setDate(
        cutoff.getDate() -
          dateRange +
          1
      );

      return projects.filter(
        (project) => {
          const createdAt =
            new Date(
              project.createdAt
            );

          if (
            Number.isNaN(
              createdAt.getTime()
            )
          ) {
            return false;
          }

          return (
            createdAt >= cutoff
          );
        }
      );
    }, [
      projects,
      dateRange,
    ]);

  /* -----------------------------------------------------
     STATUS COUNTS
  ----------------------------------------------------- */

  const completed = useMemo(
    () =>
      filteredProjects.filter(
        (project) =>
          displayStatus(
            project
          ) === "completed"
      ),
    [filteredProjects]
  );

  const running = useMemo(
    () =>
      filteredProjects.filter(
        (project) =>
          displayStatus(
            project
          ) === "running"
      ),
    [filteredProjects]
  );

  const failed = useMemo(
    () =>
      filteredProjects.filter(
        (project) =>
          displayStatus(
            project
          ) === "failed"
      ),
    [filteredProjects]
  );

  /* -----------------------------------------------------
     AVERAGE RUNTIME
  ----------------------------------------------------- */

  const averageRuntime =
    useMemo(() => {
      const runtimes =
        completed
          .map(
            getProjectRuntime
          )
          .filter(
            (runtime) =>
              runtime > 0
          );

      if (!runtimes.length) {
        return 0;
      }

      return (
        runtimes.reduce(
          (sum, runtime) =>
            sum + runtime,
          0
        ) /
        runtimes.length
      );
    }, [completed]);

  /* -----------------------------------------------------
     LEADS GENERATED
     
     Only completed projects count.
  ----------------------------------------------------- */

  const leadCount = useMemo(
    () =>
      completed.reduce(
        (total, project) =>
          total +
          (project.leads
            ?.length ||
            project.stats
              ?.leadsFound ||
            0),
        0
      ),
    [completed]
  );

  /* -----------------------------------------------------
     AGENCY PERFORMANCE
  ----------------------------------------------------- */

 const agencyPerformance = useMemo(() => {
  /*
   * Start with every configured agency.
   * This makes all agencies appear even
   * when they have 0 projects.
   */
  const grouped = {};

  agencies.forEach((agency) => {
    const slug = agency.slug;

    if (!slug) return;

    grouped[slug] = {
      slug,
      name: agency.name || formatAgencyName(slug),
      projects: 0,
      runtimes: [],
      completed: 0,
    };
  });

  /*
   * Add project statistics to the
   * corresponding configured agency.
   */
  filteredProjects.forEach((project) => {
    const slug = getAgencySlug(project);

    /*
     * If a project belongs to an agency
     * that is not currently in the agencies
     * collection, create it as a fallback.
     */
    if (!grouped[slug]) {
      grouped[slug] = {
        slug,
        name: getAgency(project),
        projects: 0,
        runtimes: [],
        completed: 0,
      };
    }

    grouped[slug].projects += 1;

    const runtime = getProjectRuntime(project);

    if (runtime > 0) {
      grouped[slug].runtimes.push(runtime);
    }

    if (displayStatus(project) === "completed") {
      grouped[slug].completed += 1;
    }
  });

  /*
   * Return every agency exactly once.
   */
  return Object.values(grouped).sort((a, b) => {
    /*
     * Agencies with projects come first.
     * Agencies with 0 projects stay underneath.
     */
    if (b.projects !== a.projects) {
      return b.projects - a.projects;
    }

    return a.name.localeCompare(b.name);
  });
}, [agencies, filteredProjects]);

  /* -----------------------------------------------------
     AGENCY USAGE
  ----------------------------------------------------- */

  const usage = useMemo(
    () =>
      agencyPerformance
        .map((agency) => ({
          name: formatAgencyName(
            agency.name
          ),
          value:
            agency.projects,
        }))
        .slice(0, 5),
    [agencyPerformance]
  );

  /* -----------------------------------------------------
     RECENT ACTIVITY
  ----------------------------------------------------- */

  const recentActivity =
    useMemo(
      () =>
        getRecentActivity(
          filteredProjects
        ),
      [filteredProjects]
    );

  /* -----------------------------------------------------
     ACTIVE AGENCIES
     
     This remains platform-level and
     is NOT affected by date range.
  ----------------------------------------------------- */

  const activeAgencyCount =
    agencies.length
      ? agencies.filter(
          (agency) =>
            agency.status ===
            "active"
        ).length
      : new Set(
          projects.map(
            getAgencySlug
          )
        ).size;

  /* -----------------------------------------------------
     LOADING
  ----------------------------------------------------- */

  if (loading) {
    return (
      <div className="af-loading">
        Loading analytics...
      </div>
    );
  }

  /* -----------------------------------------------------
     ERROR
  ----------------------------------------------------- */

  if (error) {
    return (
      <div className="af-error">
        {error}
      </div>
    );
  }

  /* -----------------------------------------------------
     PAGE
  ----------------------------------------------------- */

  return (
    <div className="autofiverr-analytics">
      <main className="af-main">
        <div className="af-content">

          {/* -------------------------------------------
              TITLE
          ------------------------------------------- */}

          <div className="af-title-row">
            <div>
              <h1>
                Analytics
              </h1>

              <p>
                Platform insights and
                agency performance.
              </p>
            </div>

            {/* DATE RANGE DROPDOWN */}

            <div className="af-range-wrapper">
              <button
                type="button"
                className="af-range"
                onClick={() =>
                  setShowRangeMenu(
                    (prev) =>
                      !prev
                  )
                }
              >
                <Icon type="calendar" />

                <span>
                  {dateRange ===
                  "all"
                    ? "All time"
                    : `Last ${dateRange} days`}
                </span>

                <span className="range-arrow">
                  {showRangeMenu
                    ? "⌃"
                    : "⌄"}
                </span>
              </button>

              {showRangeMenu && (
                <div className="af-range-menu">

                  {[7, 30, 90].map(
                    (days) => (
                      <button
                        type="button"
                        key={days}
                        className={
                          dateRange ===
                          days
                            ? "active"
                            : ""
                        }
                        onClick={() => {
                          setDateRange(
                            days
                          );

                          setShowRangeMenu(
                            false
                          );
                        }}
                      >
                        <span>
                          Last{" "}
                          {days}{" "}
                          days
                        </span>

                        {dateRange ===
                          days && (
                          <span className="range-check">
                            ✓
                          </span>
                        )}
                      </button>
                    )
                  )}

                  <button
                    type="button"
                    className={
                      dateRange ===
                      "all"
                        ? "active"
                        : ""
                    }
                    onClick={() => {
                      setDateRange(
                        "all"
                      );

                      setShowRangeMenu(
                        false
                      );
                    }}
                  >
                    <span>
                      All time
                    </span>

                    {dateRange ===
                      "all" && (
                      <span className="range-check">
                        ✓
                      </span>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* -------------------------------------------
              SUMMARY
          ------------------------------------------- */}

          <section className="af-summary">

            {/* TOTAL PROJECTS */}

            <div className="af-summary-card">
              <Spark type="projects" />

              <span>
                Total Projects
              </span>

              <strong>
                {filteredProjects.length}
              </strong>

              <em className="up">
                {completed.length}{" "}
                completed
              </em>

              <small>
                {running.length}{" "}
                currently running
              </small>
            </div>

            {/* ACTIVE AGENCIES */}

            <div className="af-summary-card">
              <Spark type="agencies" />

              <span>
                Active Agencies
              </span>

              <strong>
                {activeAgencyCount}
              </strong>

              <em className="neutral">
                ● All systems running
              </em>

              <small>
                {agencies.length}{" "}
                configured
              </small>
            </div>

            {/* LEADS GENERATED */}

            <div className="af-summary-card">
              <Spark type="leads" />

              <span>
                Leads Generated
              </span>

              <strong>
                {leadCount.toLocaleString()}
              </strong>

              <em className="up">
                From completed
                projects
              </em>

              <small>
                In selected period
              </small>
            </div>

            {/* AVERAGE RUNTIME */}

            <div className="af-summary-card">
              <Spark type="runtime" />

              <span>
                Avg. Runtime
              </span>

              <strong>
                {formatRuntime(
                  averageRuntime
                )}
              </strong>

              <em className="neutral">
                ● Based on completed
              </em>

              <small>
                {failed.length}{" "}
                failed/interrupted
              </small>
            </div>
          </section>

          {/* -------------------------------------------
              CHARTS
          ------------------------------------------- */}

          <section className="af-chart-grid">

            {/* PROJECT TREND */}

            <div className="af-panel trend-panel">
              <div className="af-panel-head">
                <h2>
                  Project Activity
                  Trend
                </h2>

                <span className="chart-period-label">
                  {dateRange ===
                  "all"
                    ? "All time"
                    : `Last ${dateRange} days`}
                </span>
              </div>

              {filteredProjects.length ===
              0 ? (
                <div className="af-empty">
                  No projects found
                  for this period.
                </div>
              ) : (
                <LineChart
                  projects={
                    filteredProjects
                  }
                  dateRange={
                    dateRange
                  }
                />
              )}
            </div>

            {/* AGENCY USAGE */}

            <div className="af-panel usage-panel">
              <h2>
                Agency Usage
              </h2>

              {usage.length ===
              0 ? (
                <div className="af-empty">
                  No agency usage
                  data yet.
                </div>
              ) : (
                <div className="usage-body">

                  <Donut
                    usage={usage}
                  />

                  <div className="legend">
                    {usage.map(
                      (
                        item,
                        index
                      ) => {
                        const total =
                          usage.reduce(
                            (
                              sum,
                              value
                            ) =>
                              sum +
                              value.value,
                            0
                          );

                        const percentage =
                          Math.round(
                            (item.value /
                              total) *
                              100
                          );

                        const classes = [
                          "blue",
                          "purple",
                          "green",
                          "orange",
                          "gray",
                        ];

                        return (
                          <div
                            key={
                              item.name
                            }
                          >
                            <i
                              className={
                                classes[
                                  index
                                ]
                              }
                            />

                            <span>
                              {
                                item.name
                              }
                            </span>

                            <b>
                              {
                                percentage
                              }
                              %
                            </b>
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* -------------------------------------------
              AGENCY PERFORMANCE
          ------------------------------------------- */}

          <section className="af-panel performance">

            <div className="af-panel-head">
              <h2>
                Agency Performance
              </h2>

              <span className="chart-period-label">
                {dateRange ===
                "all"
                  ? "All time"
                  : `Last ${dateRange} days`}
              </span>
            </div>

            <div className="af-table">

              <div className="af-thead">
                <span>
                  Agency
                </span>

                <span>
                  Projects
                </span>

                <span>
                  Avg. Runtime
                </span>

                <span>
                  Success Rate
                </span>

                <span>
                  Status
                </span>
              </div>

              {agencyPerformance.map(
                (
                  agency,
                  index
                ) => {
                  const avgRuntime =
                    agency
                      .runtimes
                      .length
                      ? agency.runtimes.reduce(
                          (
                            sum,
                            runtime
                          ) =>
                            sum +
                            runtime,
                          0
                        ) /
                        agency
                          .runtimes
                          .length
                      : 0;

                  const successRate =
                    agency.projects
                      ? Math.round(
                          (agency.completed /
                            agency.projects) *
                            100
                        )
                      : 0;

                  const metaKeys =
                    Object.keys(
                      AGENCY_META
                    );

                  const meta =
                    AGENCY_META[
                      metaKeys[
                        index %
                          metaKeys.length
                      ]
                    ];

                  return (
                    <div
                      className="af-tr"
                      key={
                        agency.slug
                      }
                    >
                      <span className="agency-name">
                        <i
                          className={`agency-icon ${meta.color}`}
                        >
                          {
                            meta.icon
                          }
                        </i>

                        <strong>
                          {formatAgencyName(
                            agency.name
                          )}
                        </strong>
                      </span>

                      <span>
                        {
                          agency.projects
                        }
                      </span>

                      <span>
                        {formatRuntime(
                          avgRuntime
                        )}
                      </span>

                      <span>
                        {
                          successRate
                        }
                        %
                      </span>

                      <span className="healthy">
                        <i />
                        Healthy
                      </span>
                    </div>
                  );
                }
              )}

              {agencyPerformance.length ===
                0 && (
                <div className="af-empty">
                  No agency
                  projects for
                  this period.
                </div>
              )}
            </div>
          </section>

          {/* -------------------------------------------
              BOTTOM GRID
          ------------------------------------------- */}

         <section className="af-bottom-single">

            {/* RECENT ACTIVITY */}

            <div className="af-panel recent">

              <div className="af-panel-head">
                <h2>
                  Recent Activity
                </h2>

                <span className="chart-period-label">
                  {dateRange ===
                  "all"
                    ? "All time"
                    : `Last ${dateRange} days`}
                </span>
              </div>

              {recentActivity.length ===
              0 ? (
                <div className="af-empty">
                  No agent activity
                  for this period.
                </div>
              ) : (
                recentActivity.map(
                  (item) => {
                    const type =
                      item.level ===
                      "success"
                        ? "success"
                        : item.level ===
                          "error"
                        ? "warning"
                        : item.level ===
                          "warn"
                        ? "warning"
                        : "info";

                    return (
                      <div
                        className="activity-row"
                        key={
                          item.id
                        }
                      >
                        <div
                          className={`activity-icon ${type}`}
                        >
                          {type ===
                          "warning"
                            ? "△"
                            : type ===
                              "success"
                            ? "✓"
                            : "▤"}
                        </div>

                        <div>
                          <strong>
                            {
                              item.title
                            }
                          </strong>

                          <p>
                            {
                              item.description
                            }
                          </p>
                        </div>

                        <time>
                          {timeAgo(
                            item.timestamp
                          )}
                        </time>
                      </div>
                    );
                  }
                )
              )}
            </div>

            {/* SYSTEM HEALTH */}

        
          </section>
        </div>
      </main>
    </div>
  );
}


