import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import CrmExportMenu from "./CrmExportMenu.jsx";


export default function DeliverablesDashboard({
  project: initialProject,
}) {
  const [project, setProject] =
    useState(initialProject);

  const [error, setError] = useState(null);
  const [copiedLeadId, setCopiedLeadId] =
    useState(null);
  const [expandedAgents, setExpandedAgents] =
    useState({});
  const [editingLeadId, setEditingLeadId] =
    useState(null);
  const [editSubject, setEditSubject] =
    useState("");
  const [editEmail, setEditEmail] =
    useState("");

   
  async function handleDownloadReport() {
    if (!project) return;

    try {
      downloadBlob(
        await api.downloadCrmExportDocx(
          project._id
        ),
        `${project.title}-report.docx`
      );
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDownloadCsv() {
    if (!project) return;

    try {
      downloadBlob(
        await api.downloadCrmExportCsv(
          project._id
        ),
        `${project.title}-leads.csv`
      );
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCopyEmail(lead) {
    try {
      await navigator.clipboard.writeText(
        buildEmailCopyText(lead)
      );

      setCopiedLeadId(lead.leadId);

      setTimeout(() => {
        setCopiedLeadId(null);
      }, 1800);
    } catch (err) {
      setError(
        `Could not copy email: ${err.message}`
      );
    }
  }

  function startEditing(lead) {
    setEditingLeadId(lead.leadId);
    setEditSubject(
      lead.subject || ""
    );
    setEditEmail(lead.email || "");
  }

  function cancelEditing() {
    setEditingLeadId(null);
    setEditSubject("");
    setEditEmail("");
  }

  function saveEditing(lead) {
    const updatedLeads = (
      project.leads || []
    ).map((item) =>
      item.leadId === lead.leadId
        ? {
            ...item,
            subject: editSubject,
            email: editEmail,
            manuallyEdited: true,
          }
        : item
    );

    setProject({
      ...project,
      leads: updatedLeads,
    });

    setEditingLeadId(null);
  }

  function toggleAgent(index) {
    setExpandedAgents((current) => ({
      ...current,
      [index]: !current[index],
    }));
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-14">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
          <p className="text-sm text-red-700">
            {error}
          </p>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-14">
        <p className="text-sm text-slate-400">
          Loading project...
        </p>
      </div>
    );
  }

  const agentResults =
    project.agentRuns?.length
      ? project.agentRuns
      : (
          project.report?.agentResults ||
          []
        ).map((result) => ({
          agent:
            result.name ||
            result.agent,
          status: result.status,
          input: result.input,
          output: result.output,
        }));

  const leads = project.leads || [];

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0 overflow-x-hidden px-4 py-7 lg:px-6">
      {/* HEADER */}
      <div className="mb-6">
        <Link
          to="/projects"
          className="mb-5 inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-900"
        >
          ← Back to projects
        </Link>

        <div className="min-w-0 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 md:flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
              Smart Lead Finder & Pitcher
            </p>

            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
              {project.title}
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              {project.clientCompanyName ||
                "Lead generation project"}
            </p>
          </div>
          <div className="flex flex-col items-start gap-3  md:shrink-0 md:items-end">
  <CrmExportMenu leads={leads} projectName={project.title}>
    <button
      type="button"
      onClick={handleDownloadReport}
      className="inline-flex h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-blue-600 px-5 text-sm font-medium text-white transition hover:bg-blue-700"
    >
      Download Report
    </button>
  </CrmExportMenu>
</div>

          
          </div>
      </div>

      {/* SUMMARY */}
      <div className="mb-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Leads qualified"
          value={leads.length}
          icon="✓"
          positive
        />

        <SummaryCard
          label="Evidence verified"
          value={leads.reduce(
            (total, lead) =>
              total +
              (lead.verifiedEvidence
                ?.length || 0),
            0
          )}
          icon="✓"
        />

        <SummaryCard
          label="Search queries"
          value={
            project.stats
              ?.searchQueriesRun || 0
          }
          icon="⌕"
        />

        <SummaryCard
          label="Runtime"
          value={`${(
            (project.stats
              ?.durationMs || 0) /
            1000
          ).toFixed(1)}s`}
          icon="◷"
        />
      </div>

            {project.report?.shortfall && (
        <div className="mb-7 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">{project.report.shortfall.summary}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {project.report.shortfall.details.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </div>
      )}

      {leads.length === 0 ? (
        <EmptyLeads />
      ) : (
        <div className="space-y-7">
          {leads.map((lead, index) => (
            <LeadCard
              key={
                lead.leadId || index
              }
              lead={lead}
              editing={
                editingLeadId ===
                lead.leadId
              }
              editSubject={editSubject}
              editEmail={editEmail}
              copied={
                copiedLeadId ===
                lead.leadId
              }
              onStartEdit={() =>
                startEditing(lead)
              }
              onCancelEdit={
                cancelEditing
              }
              onSaveEdit={() =>
                saveEditing(lead)
              }
              onSubjectChange={
                setEditSubject
              }
              onEmailChange={
                setEditEmail
              }
              onCopy={() =>
                handleCopyEmail(lead)
              }
            />
          ))}
        </div>
      )}

      {/* AGENT RESULTS */}
      <section className="mt-9">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Agent results
          </p>

          <h2 className="mt-1 text-xl font-semibold text-slate-900">
            See how the workflow produced this
            result
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            The detailed inputs and outputs are
            hidden by default. Open an agent only
            when you want to inspect its work.
          </p>
        </div>

        <div className="space-y-2">
          {agentResults.map(
            (run, index) => {
              const isOpen =
                expandedAgents[index];

              return (
                <div
                  key={`${run.agent}-${index}`}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                >
                  <button
                    type="button"
                    onClick={() =>
                      toggleAgent(index)
                    }
                    className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition hover:bg-slate-50"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <AgentNumber
                        number={
                          index + 1
                        }
                      />

                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {prettyAgentName(
                            run.agent
                          )}
                        </p>

                        <p className="mt-0.5 text-xs text-slate-400">
                          View input and
                          output
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      <AgentStatus
                        status={
                          run.status
                        }
                      />

                      <span className="text-lg text-slate-400">
                        {isOpen
                          ? "−"
                          : "+"}
                      </span>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-slate-200 bg-slate-50 p-4">
                      <div className="grid gap-4 lg:grid-cols-2">
                        <TechnicalPanel
                          title="Input"
                          value={
                            run.input
                          }
                        />

                        <TechnicalPanel
                          title="Output"
                          value={
                            run.output
                          }
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            }
          )}
        </div>
      </section>

      {/* ORCHESTRATION LOG */}
      {(project.agentLogs || [])
        .length > 0 && (
        <section className="mt-9">
          <details className="group rounded-xl border border-slate-200 bg-white">
            <summary className="cursor-pointer list-none px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Workflow activity
                  </p>

                  <p className="mt-1 text-xs text-slate-400">
                    Technical execution log
                  </p>
                </div>

                <span className="text-slate-400 group-open:rotate-180">
                  ↓
                </span>
              </div>
            </summary>

            <div className="border-t border-slate-200 p-4 space-y-2">
              <div className="h-[500px] overflow-y-auto">
                {(
                  project.agentLogs ||
                  []
                )
                  .slice(-12)
                  .reverse()
                  .map(
                    (
                      entry,
                      index
                    ) => (
                      <div
                        key={index}
                        className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-blue-600">
                            {
                              entry.agent
                            }
                          </span>

                          {entry.level && (
                            <span className="text-[10px] uppercase tracking-wider text-slate-400">
                              {
                                entry.level
                              }
                            </span>
                          )}
                        </div>

                        <p className="mt-1 text-xs leading-5 text-slate-600">
                          {
                            entry.message
                          }
                        </p>
                      </div>
                    )
                  )}
              </div>
            </div>
          </details>
        </section>
      )}

      <Link
        to="/projects"
        className="mt-8 inline-flex text-sm font-medium text-slate-500 hover:text-slate-900"
      >
        ← Back to projects
      </Link>
    </div>
  );
}

/* =========================================================
   LEAD CARD
   ========================================================= */

function LeadCard({
  lead,
  editing,
  editSubject,
  editEmail,
  copied,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onSubjectChange,
  onEmailChange,
  onCopy,
}) {
  const qa = getQAInfo(lead);

  const evidence =
    lead.verifiedEvidence || [];

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-semibold text-slate-900">
                {lead.companyName}
              </h2>

              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                Lead qualified
              </span>
            </div>

                        <p className="mt-1 text-sm text-slate-600">
              {lead.contactEmail ? (
                <>
                  Send to:{" "}
                  <a
                    href={`mailto:${lead.contactEmail}?subject=${encodeURIComponent(lead.subject || "")}&body=${encodeURIComponent(lead.email || "")}`}
                    className="break-all font-medium text-blue-600 hover:underline"
                  >
                    {lead.contactEmail}
                  </a>
                </>
              ) : (
                <span className="text-amber-700">
                  No public email found. Use the website's contact form.
                </span>
              )}
            </p>

            {lead.website && (
              <a
  href={lead.website}
  target="_blank"
  rel="noreferrer"
  className="mt-1 inline-block max-w-full break-all text-sm text-blue-600 hover:underline"
>
  {lead.website}
</a>
            )}
          </div>

          <div className="text-left sm:text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Evidence
            </p>

            <p className="mt-1 text-lg font-semibold text-slate-900">
              {evidence.length}{" "}
              verified
            </p>
          </div>
        </div>
      </div>

      {/* OUTREACH */}
      <div className="px-5 py-6 sm:px-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Outreach email
            </p>

            <h3 className="mt-1 text-lg font-semibold text-slate-900">
              Final message
            </h3>
          </div>

          {!editing && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={
                  onStartEdit
                }
                className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:border-blue-500 hover:text-blue-600"
              >
                Edit email
              </button>

              <button
                type="button"
                onClick={onCopy}
                className="rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-700"
              >
                {copied
                  ? "Copied"
                  : "Copy email"}
              </button>
            </div>
          )}
        </div>

        {editing ? (
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Subject
              </label>

              <input
                value={
                  editSubject
                }
                onChange={(event) =>
                  onSubjectChange(
                    event.target
                      .value
                  )
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Email
              </label>

              <textarea
                value={
                  editEmail
                }
                onChange={(event) =>
                  onEmailChange(
                    event.target
                      .value
                  )
                }
                rows={10}
                className="w-full resize-y rounded-lg border border-slate-300 px-3 py-3 text-sm leading-6 text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={
                  onSaveEdit
                }
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Save changes
              </button>

              <button
                type="button"
                onClick={
                  onCancelEdit
                }
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>

            <p className="text-xs text-amber-600">
              Manually editing this email changes the
              displayed version. The previous AI QA
              result does not automatically re-check
              your manual changes.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-slate-50">
            {lead.subject && (
              <div className="border-b border-slate-200 px-4 py-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Subject
                </span>

                <p className="mt-1 text-sm font-semibold text-slate-800">
                  {lead.subject}
                </p>
              </div>
            )}

            <div className="px-4 py-5">
              <p className="whitespace-pre-line text-sm leading-7 text-slate-700">
                {lead.email}
              </p>
            </div>
          </div>
        )}
      </div>

      <QASection qa={qa} />

      {/* VERIFIED EVIDENCE */}
      <section className="border-t border-slate-200 px-5 py-6 sm:px-6">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Verified evidence
          </p>

          <h3 className="mt-1 text-lg font-semibold text-slate-900">
            Facts used to write the outreach
          </h3>

          <p className="mt-1 text-sm text-slate-500">
            These are the verified signals the outreach
            process was allowed to use.
          </p>
        </div>

        {evidence.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            No verified evidence was recorded for
            this lead.
          </div>
        ) : (
          <div className="grid gap-3">
            {evidence.map(
              (item, index) => (
                <EvidenceCard
                  key={`${item.citationId || item.sourceTitle}-${index}`}
                  evidence={item}
                  index={index}
                />
              )
            )}
          </div>
        )}
      </section>

      {/* SOURCES */}
      {lead.sources?.length > 0 && (
        <section className="border-t border-slate-200 px-5 py-5 sm:px-6">
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-slate-800">
              View source list
            </summary>

            <div className="mt-3 space-y-2">
              {lead.sources.map(
                (source, index) => (
                  <a
                    key={
                      source.id ||
                      index
                    }
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
className="block max-w-full break-all rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-blue-600 hover:bg-blue-50"
                  >
                    {source.title ||
                      source.url}
                  </a>
                )
              )}
            </div>
          </details>
        </section>
      )}
    </article>
  );
}

/* =========================================================
   QA SECTION
   ========================================================= */

function QASection({ qa }) {
  if (!qa.hasData) {
    return (
      <section className="border-t border-slate-200 bg-slate-50 px-5 py-5 sm:px-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm text-emerald-700">
            ✓
          </span>

          <div>
            <p className="text-sm font-semibold text-slate-900">
              Outreach generated
            </p>

            <p className="mt-1 text-sm leading-6 text-slate-600">
              The final outreach email is ready. Detailed QA
              information was not stored with this lead.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const passed = qa.passed !== false;

  return (
    <section className="border-t border-slate-200 bg-slate-50 px-5 py-6 sm:px-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-3">
          <span
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
              passed
                ? "bg-emerald-100 text-emerald-700"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {passed ? "✓" : "!"}
          </span>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Outreach quality check
            </p>

            <h3 className="mt-1 text-lg font-semibold text-slate-900">
              {passed
                ? "Final email passed QA"
                : "Email needs attention"}
            </h3>

            {qa.repaired ? (
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                The first draft did not pass the quality check,
                so the Outreach QA agent regenerated it using the
                verified evidence. The revised version was checked
                again before being used.
              </p>
            ) : (
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                The generated email was checked against the
                verified evidence before being used.
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <QAMetric
            label="Final"
            value={
              passed
                ? "Passed"
                : "Review"
            }
          />

          <QAMetric
            label="Revisions"
            value={
              qa.repairAttempts ?? 0
            }
          />

          <QAMetric
            label="Issues"
            value={
              qa.mistakes?.length ||
              0
            }
          />
        </div>
      </div>

      {qa.repaired && (
        <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <QAStep
              number="1"
              title="Original draft"
              text="Generated by the Outreach Writer."
              status="Needs review"
            />

            <QAStep
              number="2"
              title="QA review"
              text="The email was checked against verified evidence."
              status="Issue found"
            />

            <QAStep
              number="3"
              title="Regenerated draft"
              text="The QA agent repaired the detected issue."
              status={
                passed
                  ? "Passed"
                  : "Still needs review"
              }
            />
          </div>
        </div>
      )}

      {qa.mistakes?.length > 0 && (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">
            Items to review
          </p>

          <ul className="mt-2 space-y-1.5">

            {qa.mistakes.map(
              (mistake, index) => (
                <li
                  key={index}
                  className="text-sm leading-6 text-amber-800"
                >
                  •{" "}
                  {formatMistake(
                    mistake
                  )}
                </li>
              )
            )}
          </ul>

          <p className="mt-3 text-xs leading-5 text-amber-700">
            These checks are based on the verified evidence shown
            below. If the email is manually edited, it should be
            checked again before sending.
          </p>
        </div>
      )}
    </section>
  );
}

/* =========================================================
   EVIDENCE
   ========================================================= */

function EvidenceCard({
  evidence,
  index,
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-xs font-semibold text-blue-700">
          {index + 1}
        </span>

        <div className="min-w-0 flex-1">
          {evidence.signal && (
            <span className="inline-block rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
              {formatSignal(
                evidence.signal
              )}
            </span>
          )}

          <p className="mt-2 text-sm leading-6 text-slate-700">
            {evidence.excerpt ||
              "Verified evidence recorded without an excerpt."}
          </p>

          {evidence.reason && (
            <div className="mt-3 rounded-lg bg-slate-50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Why this was used
              </p>

              <p className="mt-1 text-xs leading-5 text-slate-600">
                {evidence.reason}
              </p>
            </div>
          )}

          {evidence.sourceUrl && (
            <a
              href={
                evidence.sourceUrl
              }
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex max-w-full break-all text-xs font-semibold text-blue-600 hover:underline"
            >
              {evidence.sourceTitle ||
                "View source"}{" "}
              ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   HELPERS
   ========================================================= */

function getQAInfo(lead) {
  const candidates = [
    lead.qa,
    lead.outreachQA,
    lead.qualityGate,
    lead.outreachQualityGate,
    lead.agentResults?.find(
      (item) =>
        /outreach.*qa|quality.*gate/i.test(
          String(
            item.name ||
              item.agent ||
              ""
          )
        )
    )?.output,
    lead.agentResults?.find(
      (item) =>
        /outreach.*qa|quality.*gate/i.test(
          String(
            item.name ||
              item.agent ||
              ""
          )
        )
    )?.qa,
  ].filter(Boolean);

  const data = candidates[0];

  if (!data) {
    return {
      hasData: false,
      passed: true,
      repaired: false,
      repairAttempts: 0,
      mistakes: [],
    };
  }

  return {
    hasData: true,
    passed:
      data.passed ??
      data.valid ??
      data.qa?.passed ??
      true,
    repaired:
      data.repaired ??
      data.qa?.repaired ??
      false,
    repairAttempts:
      data.repairAttempts ??
      data.qa?.repairAttempts ??
      0,
    mistakes:
      (data.mistakes?.length ? data.mistakes : null) ??
      (lead.outreachMistakes?.length ? lead.outreachMistakes : null) ??
      data.remainingMistakes ??
      [],
  };
}

function formatMistake(value) {
  if (!value)
    return "Quality issue detected.";

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object") {
    return (
      value.detail ||
      value.message ||
      value.reason ||
      value.problem ||
      JSON.stringify(value)
    );
  }

  return String(value);
}

function buildEmailCopyText(lead) {
  const subject = lead.subject
    ? `Subject: ${lead.subject}\n\n`
    : "";

  return `${subject}${lead.email || ""}`;
}

function formatSignal(signal) {
  return String(signal)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) =>
      char.toUpperCase()
    );
}

function prettyAgentName(name) {
  if (!name) return "Agent";

  return String(name)
    .replace(/Agent$/i, "")
    .replace(
      /([a-z])([A-Z])/g,
      "$1 $2"
    )
    .replace(
      /[_-]+/g,
      " "
    )
    .trim();
}

/* =========================================================
   SMALL UI COMPONENTS
   ========================================================= */

function SummaryCard({
  label,
  value,
  icon,
  positive,
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          {label}
        </p>

        <span
          className={`flex h-7 w-7 items-center justify-center rounded-full text-xs ${
            positive
              ? "bg-emerald-50 text-emerald-600"
              : "bg-slate-100 text-slate-500"
          }`}
        >
          {icon}
        </span>
      </div>

      <p className="mt-3 text-2xl font-semibold text-slate-900">
        {value}
      </p>
    </div>
  );
}

function AgentNumber({
  number,
}) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-500">
      {number}
    </span>
  );
}

function AgentStatus({
  status,
}) {
  const normalized = String(
    status || "success"
  ).toLowerCase();

  const isSuccess =
    normalized === "success" ||
    normalized === "completed" ||
    normalized === "passed";

  return (
    <span
      className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${
        isSuccess
          ? "bg-emerald-50 text-emerald-700"
          : "bg-slate-100 text-slate-500"
      }`}
    >
      {isSuccess
        ? "Complete"
        : normalized}
    </span>
  );
}

function TechnicalPanel({
  title,
  value,
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          {title}
        </p>
      </div>

      <pre className="max-h-96 max-w-full overflow-auto whitespace-pre-wrap break-all p-3 text-[11px] leading-5 text-slate-600">
        {formatTechnicalValue(value)}
      </pre>
    </div>
  );
}

function QAMetric({
  label,
  value,
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>

      <p className="mt-1 text-sm font-semibold text-slate-800">
        {value}
      </p>
    </div>
  );
}

function QAStep({
  number,
  title,
  text,
  status,
}) {
  return (
    <div className="rounded-lg border border-blue-100 bg-white p-3">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-[10px] font-semibold text-blue-700">
          {number}
        </span>

        <p className="text-xs font-semibold text-slate-800">
          {title}
        </p>
      </div>

      <p className="mt-2 text-xs leading-5 text-slate-500">
        {text}
      </p>

      <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-blue-600">
        {status}
      </p>
    </div>
  );
}

function EmptyLeads() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        —
      </div>

      <h2 className="mt-4 text-lg font-semibold text-slate-900">
        No qualified leads
      </h2>

      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
        The workflow completed, but no company passed
        all of the required quality checks.
      </p>
    </div>
  );
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
function downloadBlob(
  blob,
  filename
) {
  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}