import { Link } from "react-router-dom";
import { useState } from "react";

const AGENCY_CONFIG = {
  "smart-lead-finder": {
    icon: "⌕",
    eyebrow: "B2B LEAD RESEARCH & OUTREACH",
    accent: "blue",
    statusText: "LIVE",

    description:
       "Find relevant companies, understand their latest business signals, identify where your offer can help, and turn that research into personalized, evidence-backed outreach.",

    outcome:
      "Turn a business goal into researched, CRM-ready prospects with evidence-backed outreach.",

    purpose:
      "Smart Lead Finder & Pitcher discovers target companies, validates public evidence, and creates personalized outreach messages, reducing the time required to build qualified prospect lists.",

    why:
      "The agency divides the work between specialized agents. Research, opportunity analysis, outreach writing, quality checking, and CRM structuring are handled as coordinated tasks rather than one generic chatbot response.",
    llm:
      "LLMs like ChatGPT and Claude can hallucinate facts, invent companies, or make claims that cannot be verified. They also do not reliably perform structured live company research on their own. This agency uses dedicated research, evidence verification, and QA steps so outreach is based on real, traceable information.",
    result:
      "You receive a researched shortlist of companies, source-backed evidence, relevant business opportunities, personalized outreach, and structured CRM-ready lead data.",

    agents: [
      "Target Profiler — converts the business goal into clear prospecting criteria.",
      "Candidate Discovery Agent — discovers real target companies using live Brave Search and public web data.",
      "Company Scraper Agent — gathers public company information, website content, and supporting evidence.",
      "Content Relevance Filter — identifies evidence relevant to the client's service and outreach objective.",
      "Evidence Verification Agent — validates facts and supporting evidence before outreach is allowed.",
      "Outreach Writer — creates personalized outreach using verified company evidence.",
      "Outreach QA Gate — verifies outreach quality and removes unsupported claims before approval.",
      "CRM Structurer — organizes approved leads into structured CRM records.",
      
    ],
  },

  "deep-market-intelligence": {
    icon: "◈",
    eyebrow: "MARKET RESEARCH",
    accent: "blue",
    statusText: "COMING SOON",

    description:
      "Research markets, competitors, pricing, and trends to uncover opportunities and strategic insights.",

    outcome:
      "Transform scattered market activity into organized competitive intelligence.",

    purpose:
      "Deep Market Intelligence is designed for businesses that need a structured view of what competitors and the wider market are doing.",

    why:
      "Specialized agents can focus on different intelligence tasks and combine their findings into one organized research package.",

    result:
      "The planned output includes competitor intelligence, market changes, pricing observations, emerging trends, and actionable business insights.",

    agents: [
      "Market Researcher — collects relevant industry signals.",
      "Competitor Monitor — tracks important competitor activities.",
      "Pricing Analyst — identifies pricing and positioning changes.",
      "Trend Analyst — connects recurring signals into broader trends.",
      "Insight Synthesizer — converts research into business insights.",
      "Intelligence Coordinator — organizes the final intelligence package.",
    ],
  },

  "seo-content-squad": {
    icon: "✦",
    eyebrow: "SEO & CONTENT",
    accent: "blue",
    statusText: "COMING SOON",

    description:
      "Research, plan, write, and optimize search-focused content around topics, intent, and measurable growth.",

    outcome:
      "Turn search opportunities into structured, optimized, quality-checked content.",

    purpose:
      "SEO Content Squad is designed for businesses that need a repeatable process for producing search-focused content.",

    why:
      "Different agents specialize in research, planning, writing, optimization, and quality control so each part of the workflow has a clear responsibility.",

    result:
      "The planned output includes keyword opportunities, content structures, optimized drafts, and quality-checked SEO content.",

    agents: [
      "Keyword Researcher — identifies relevant search opportunities.",
      "Content Strategist — organizes keywords into content clusters.",
      "Content Writer — creates structured audience-focused drafts.",
      "SEO Optimizer — improves search-focused structure and relevance.",
      "Quality Auditor — reviews content for consistency and quality.",
      "Content Coordinator — organizes the final content package.",
    ],
  },

  "technical-rfp-generator": {
    icon: "▣",
    eyebrow: "TECHNICAL PROPOSALS",
    accent: "blue",
    statusText: "COMING SOON",

    description:
      "Turn complex requirements into clear, structured, professional technical proposals.",

    outcome:
      "Reduce the manual effort required to understand and respond to technical RFPs.",

    purpose:
      "Technical RFP Generator is designed for teams responding to complex technical requests for proposals.",

    why:
      "Specialized agents separate requirement extraction, technical interpretation, solution planning, writing, and compliance review.",

    result:
      "The planned output is a structured technical proposal aligned with the original RFP requirements.",

    agents: [
      "Requirements Extractor — identifies requirements, constraints, and deliverables.",
      "Technical Analyst — interprets the technical scope.",
      "Solution Planner — organizes the proposed technical approach.",
      "Proposal Writer — produces the structured proposal.",
      "Compliance Reviewer — checks the proposal against the RFP.",
      "Proposal Coordinator — organizes the final proposal package.",
    ],
  },
};

const DEFAULT_CONFIG = {
  icon: "◇",
  eyebrow: "AI AGENCY",
  accent: "blue",
  statusText: "COMING SOON",
  description: "A specialized AI workflow for a specific business task.",
  outcome: "",
  purpose: "",
  why: "",
  result: "",
  agents: [],
};

const ACCENT = {
  blue: {
    icon: "bg-blue-600 text-white",
    text: "text-blue-600",
    button:
      "bg-blue-600 text-white hover:bg-blue-700",
  },
};

export default function AgencyCard({ agency }) {
  const config =
    AGENCY_CONFIG[agency.slug] || DEFAULT_CONFIG;

  const styles =
    ACCENT[config.accent] || ACCENT.blue;

  const isActive = agency.status === "active";

  const [open, setOpen] = useState(false);
  const [openPanels, setOpenPanels] = useState({});

  function togglePanel(key) {
    setOpenPanels((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }

  const agentCount = config.agents.length;

  return (
    <article
      className="
        group
        w-full
        overflow-hidden
        rounded-2xl
        border border-slate-200
        bg-white
        shadow-sm
        transition-all duration-200
        hover:border-blue-200
        hover:shadow-md
      "
    >
      {/* TOP STATUS BAR */}
      <div
        className="
          flex
          items-center
          justify-between
          border-b border-slate-100
          px-6 py-3.5
        "
      >
        <div className="flex items-center gap-2.5">
          <span
            className={`
              h-2 w-2 rounded-full
              ${
                isActive
                  ? "bg-blue-600"
                  : "bg-slate-300"
              }
            `}
          />

          <span
            className={`
              text-[10px]
              font-bold
              tracking-[0.16em]
              ${
                isActive
                  ? "text-blue-600"
                  : "text-slate-400"
              }
            `}
          >
            {config.statusText}
          </span>
        </div>

        <span
          className="
            text-[10px]
            font-semibold
            uppercase
            tracking-[0.14em]
            text-slate-400
          "
        >
          {agentCount} agents
        </span>
      </div>

      {/* MAIN CARD */}
      <div className="px-6 py-6">
        {/* ICON + CATEGORY */}
        <div className="flex items-center gap-3">
          <div
            className={`
              flex h-11 w-11
              shrink-0
              items-center justify-center
              rounded-xl
              text-lg
              font-semibold
              ${styles.icon}
            `}
          >
            {config.icon}
          </div>

          <p
            className={`
              text-[10px]
              font-bold
              uppercase
              tracking-[0.16em]
              ${styles.text}
            `}
          >
            {config.eyebrow}
          </p>
        </div>

        {/* TITLE */}
        <h3
          className="
            mt-5
            text-xl
            font-semibold
            tracking-tight
            text-slate-950
          "
        >
          {agency.name}
        </h3>

        {/* DESCRIPTION */}
        <p
          className="
            mt-2
            max-w-4xl
            text-sm
            leading-6
            text-slate-500
          "
        >
          {config.description}
        </p>

        {/* DETAILS */}
        {open && (
          <div
            className="
              mt-6
              border-t border-slate-100
              pt-5
            "
          >
            <div className="grid gap-2">
              <QuestionRow
                question="What is this agency for?"
                open={!!openPanels.purpose}
                onToggle={() =>
                  togglePanel("purpose")
                }
                answer={config.purpose}
              />

              <QuestionRow
                question="How do the agents work?"
                open={!!openPanels.how}
                onToggle={() =>
                  togglePanel("how")
                }
                answer={
                  <ul className="space-y-3">
                    {config.agents.map(
                      (agent, index) => (
                        <li
                          key={agent}
                          className="
                            flex gap-3
                            text-xs
                            leading-5
                            text-slate-600
                          "
                        >
                          <span
                            className="
                              shrink-0
                              font-semibold
                              text-blue-600
                            "
                          >
                            {String(index + 1).padStart(
                              2,
                              "0"
                            )}
                          </span>

                          <span>{agent}</span>
                        </li>
                      )
                    )}
                  </ul>
                }
              />

              <QuestionRow
                question="Why use a specialized agency?"
                open={!!openPanels.why}
                onToggle={() =>
                  togglePanel("why")
                }
                answer={config.why}
              />

              <QuestionRow
                question="Why not just use an LLM?"
                open={!!openPanels.llm}
                onToggle={() =>
                  togglePanel("llm")
                }
                answer={config.llm}
              />

              <QuestionRow
                question="What do you get?"
                open={!!openPanels.result}
                onToggle={() =>
                  togglePanel("result")
                }
                answer={config.result}
              />
            </div>
          </div>
        )}

        {/* FOOTER */}
        <div
          className="
            mt-6
            flex
            items-center
            justify-between
            border-t border-slate-100
            pt-4
          "
        >
          {/* VIEW DETAILS */}
          <button
            type="button"
            onClick={() =>
              setOpen((value) => !value)
            }
            className="
              inline-flex
              items-center
              gap-1.5
              text-xs
              font-semibold
              text-slate-600
              transition-colors
              hover:text-blue-600
            "
          >
            {open
              ? "Hide Details"
              : "View Details"}

            <span
              className={`
                transition-transform
                duration-200
                ${open ? "rotate-180" : ""}
              `}
            >
              ↓
            </span>
          </button>

          {/* RIGHT ACTION */}
          {isActive ? (
            <Link
              to={`/agencies/${agency.slug}/new`}
              className={`
                inline-flex
                items-center
                gap-2
                rounded-lg
                px-4 py-2.5
                text-xs
                font-semibold
                shadow-sm
                transition-colors
                ${styles.button}
              `}
            >
              Open Workspace
              <span>→</span>
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="
                rounded-lg
                border border-slate-200
                bg-slate-50
                px-4 py-2.5
                text-xs
                font-semibold
                text-slate-400
              "
            >
              Coming Soon
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function QuestionRow({
  question,
  answer,
  open,
  onToggle,
}) {
  return (
    <div
      className="
        overflow-hidden
        rounded-xl
        border border-slate-200
        bg-white
      "
    >
      <button
        type="button"
        onClick={onToggle}
        className="
          flex w-full
          items-center
          justify-between
          px-4 py-3.5
          text-left
          transition-colors
          hover:bg-slate-50
        "
      >
        <span
          className="
            text-xs
            font-semibold
            text-slate-800
          "
        >
          {question}
        </span>

        <span
          className={`
            text-xs
            text-slate-400
            transition-transform
            duration-200
            ${open ? "rotate-90" : ""}
          `}
        >
          →
        </span>
      </button>

      {open && (
        <div
          className="
            border-t border-slate-100
            px-4 py-4
          "
        >
          {typeof answer === "string" ? (
            <p
              className="
                text-xs
                leading-6
                text-slate-600
              "
            >
              {answer}
            </p>
          ) : (
            answer
          )}
        </div>
      )}
    </div>
  );
}