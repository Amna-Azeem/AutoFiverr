/**
 * @file liveLog.js
 * Emits live agent log entries for the AutoFiverr multi-agent pipeline.
 * Supports pub/sub listeners, in-memory ring buffer, and simulated real-time streaming.
 */

export const activeLogs = [];
const listeners = new Set();

export function onAgentLog(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function clearActiveLogs() {
  activeLogs.length = 0;
  for (const listener of listeners) {
    try {
      listener({ type: 'clear' });
    } catch {
      // ignore listener errors
    }
  }
}

export function emitAgentLog(agentLabel, level, message, meta = {}) {
  const entry = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ts: new Date().toISOString(),
    agent: agentLabel,
    level, // 'info' | 'warn' | 'error' | 'success' | 'debug'
    message,
    meta,
  };
  activeLogs.push(entry);
  if (activeLogs.length > 1000) {
    activeLogs.shift();
  }
  for (const listener of listeners) {
    try {
      listener(entry);
    } catch {
      // ignore listener errors
    }
  }
  return entry;
}

/**
 * Wraps an async pipeline or agent step with live logging.
 *
 * Supported signatures:
 *   await runWithLiveLog('Agent Name', async (log) => { ... }, { meta })
 *   await runWithLiveLog('Agent Name', 'Step description', async (log) => { ... }, { meta })
 *   await runWithLiveLog(async (log) => { ... }, { agent: 'Agent Name' })
 *
 * @param {string | Function} agentOrFn
 * @param {any} [fnOrDesc]
 * @param {any} [metaOrFn]
 * @param {any} [maybeMeta]
 * @returns {Promise<any>}
 */
export async function runWithLiveLog(agentOrFn, fnOrDesc, metaOrFn, maybeMeta) {
  let agentLabel = 'Pipeline';
  let description = '';
  let taskFn = null;
  let meta = {};

  if (typeof agentOrFn === 'function') {
    taskFn = agentOrFn;
    meta = typeof fnOrDesc === 'object' && fnOrDesc !== null ? fnOrDesc : {};
    agentLabel = meta.agent || 'Pipeline';
    description = meta.step || meta.title || agentLabel;
  } else if (typeof agentOrFn === 'string' && typeof fnOrDesc === 'function') {
    agentLabel = agentOrFn;
    taskFn = fnOrDesc;
    meta = typeof metaOrFn === 'object' && metaOrFn !== null ? metaOrFn : {};
    description = meta.step || meta.title || `${agentLabel} task`;
  } else if (typeof agentOrFn === 'string' && typeof fnOrDesc === 'string' && typeof metaOrFn === 'function') {
    agentLabel = agentOrFn;
    description = fnOrDesc;
    taskFn = metaOrFn;
    meta = typeof maybeMeta === 'object' && maybeMeta !== null ? maybeMeta : {};
  } else if (typeof agentOrFn === 'string' && typeof metaOrFn === 'function') {
    agentLabel = agentOrFn;
    taskFn = metaOrFn;
    meta = typeof fnOrDesc === 'object' && fnOrDesc !== null ? fnOrDesc : {};
    description = meta.step || meta.title || `${agentLabel} task`;
  } else {
    taskFn = typeof fnOrDesc === 'function' ? fnOrDesc : typeof agentOrFn === 'function' ? agentOrFn : async () => {};
    meta = typeof metaOrFn === 'object' && metaOrFn !== null ? metaOrFn : {};
    agentLabel = typeof agentOrFn === 'string' ? agentOrFn : meta.agent || 'Pipeline';
    description = meta.step || meta.title || agentLabel;
  }

  const startTime = Date.now();
  emitAgentLog(agentLabel, 'info', `${description} — started`, { ...meta, status: 'running' });

  const contextualLogger = {
    emit: (level, msg, extra = {}) => emitAgentLog(agentLabel, level, msg, { ...meta, ...extra }),
    log: (level, msg, extra = {}) => emitAgentLog(agentLabel, level, msg, { ...meta, ...extra }),
    info: (msg, extra = {}) => emitAgentLog(agentLabel, 'info', msg, { ...meta, ...extra }),
    warn: (msg, extra = {}) => emitAgentLog(agentLabel, 'warn', msg, { ...meta, ...extra }),
    error: (msg, extra = {}) => emitAgentLog(agentLabel, 'error', msg, { ...meta, ...extra }),
    success: (msg, extra = {}) => emitAgentLog(agentLabel, 'success', msg, { ...meta, ...extra }),
  };

  try {
    const result = await taskFn(contextualLogger);
    const durationMs = Date.now() - startTime;
    emitAgentLog(agentLabel, 'success', `${description} — completed`, {
      ...meta,
      status: 'completed',
      durationMs,
    });
    return result;
  } catch (err) {
    const durationMs = Date.now() - startTime;
    emitAgentLog(agentLabel, 'error', `${description} failed: ${err?.message || String(err)}`, {
      ...meta,
      status: 'failed',
      durationMs,
      error: err?.message || String(err),
      stack: err?.stack,
    });
    throw err;
  }
}


export function getSeedLogs() {
  const now = Date.now();
  return [
    {
      id: 'log-seed-1',
      ts: new Date(now - 195000).toISOString(),
      agent: 'Target Profiler',
      level: 'info',
      message: 'Agent started — Analyzing project submission for PixelCraft Studio',
      meta: { clientService: 'Website redesign, UI/UX improvements, conversion-focused development', maxLeads: 3 },
    },
    {
      id: 'log-seed-2',
      ts: new Date(now - 192000).toISOString(),
      agent: 'Target Profiler',
      level: 'info',
      message: 'Validating targeting criteria: B2B SaaS software companies in United States',
      meta: { industry: 'B2B SaaS software', geographicFocus: 'United States', explicitDays: null },
    },
    {
      id: 'log-seed-3',
      ts: new Date(now - 190000).toISOString(),
      agent: 'Target Profiler',
      level: 'success',
      message: 'Targeting spec generated successfully: non-event searchMode confirmed',
      meta: {
        searchMode: 'company_discovery',
        eventRequired: false,
        temporalConstraint: { required: false, withinDays: null },
        needTests: ['seo_meta_description_missing', 'responsive_viewport_missing'],
      },
    },
    // --- AGENT 2: CANDIDATE DISCOVERY (Detailed Stage by Stage) ---
    {
      id: 'log-seed-4',
      ts: new Date(now - 186000).toISOString(),
      agent: 'Candidate Discovery',
      level: 'info',
      message: 'Agent 2: Initializing discovery queue without copyright years or synthetic event constraints',
      meta: { stage: 'Queue Formulation', queueSize: 12, strategy: 'multi_phrase_diversity' },
    },
    {
      id: 'log-seed-5',
      ts: new Date(now - 182000).toISOString(),
      agent: 'Candidate Discovery',
      level: 'info',
      message: 'Executing Query 1/3: "Small-to-medium B2B SaaS companies software"',
      meta: { stage: 'Query Dispatch', queryNumber: 1, limit: 3, query: 'Small-to-medium B2B SaaS companies software', country: 'US' },
    },
    {
      id: 'log-seed-6',
      ts: new Date(now - 178000).toISOString(),
      agent: 'Candidate Discovery',
      level: 'info',
      message: 'Search Query 1 returned 20 raw results (15 usable business pages after discarding directories & socials)',
      meta: { stage: 'Search Results Filtering', rawResults: 20, usableResults: 15 },
    },
    {
      id: 'log-seed-7',
      ts: new Date(now - 175000).toISOString(),
      agent: 'Candidate Discovery',
      level: 'info',
      message: 'Extracting candidate business entities & domain hints via Gemini AI',
      meta: { stage: 'Entity Extraction', engine: 'Gemini LLM', batchSize: 15 },
    },
    {
      id: 'log-seed-8',
      ts: new Date(now - 172000).toISOString(),
      agent: 'Candidate Discovery',
      level: 'info',
      message: 'Discovered 4 candidate businesses from Query 1: monday.com, Salesforce, Cognism, SaaSForge Systems',
      meta: { stage: 'Candidate Ingestion', discovered: ['monday.com', 'Salesforce', 'Cognism', 'SaaSForge Systems'] },
    },
    {
      id: 'log-seed-9',
      ts: new Date(now - 169000).toISOString(),
      agent: 'Candidate Discovery',
      level: 'info',
      message: 'Evaluating candidate "Salesforce" across qualification pipeline',
      meta: { stage: 'Candidate Verification', companyName: 'Salesforce' },
    },
    {
      id: 'log-seed-10',
      ts: new Date(now - 167000).toISOString(),
      agent: 'Candidate Discovery',
      level: 'warn',
      message: 'Candidate rejected: "Salesforce" failed at Stage [Company Size Gate] — wrong_size (enterprise_tech_giant:salesforce.com)',
      meta: {
        stage: 'Company Size Gate',
        failedStage: 'Company Size Gate',
        companyName: 'Salesforce',
        domain: 'salesforce.com',
        reason: 'wrong_size',
        detail: 'enterprise_tech_giant:salesforce.com (>10,000 employees exceeds SMB cap)',
        status: 'rejected',
      },
    },
    {
      id: 'log-seed-11',
      ts: new Date(now - 165000).toISOString(),
      agent: 'Candidate Discovery',
      level: 'info',
      message: 'Evaluating candidate "Cognism" — Probing official domain https://cognism.com and evaluating geography',
      meta: { stage: 'Website Resolution', companyName: 'Cognism' },
    },
    {
      id: 'log-seed-12',
      ts: new Date(now - 163000).toISOString(),
      agent: 'Candidate Discovery',
      level: 'warn',
      message: 'Candidate rejected: "Cognism" failed at Stage [Geography Gate] — geography_mismatch (headquartered in London, United Kingdom)',
      meta: {
        stage: 'Geography Gate',
        failedStage: 'Geography Gate',
        companyName: 'Cognism',
        domain: 'cognism.com',
        reason: 'geography_mismatch',
        detail: 'place_not_found:United States (detected UK headquarters)',
        status: 'rejected',
      },
    },
    {
      id: 'log-seed-13',
      ts: new Date(now - 160000).toISOString(),
      agent: 'Candidate Discovery',
      level: 'info',
      message: 'Evaluating candidate "SaaSForge Systems" — Probing official domain guesses (https://saasforge.com, https://saasforgesystems.com)...',
      meta: { stage: 'Website Resolution', companyName: 'SaaSForge Systems' },
    },
    {
      id: 'log-seed-14',
      ts: new Date(now - 158000).toISOString(),
      agent: 'Candidate Discovery',
      level: 'warn',
      message: 'Candidate rejected: "SaaSForge Systems" failed at Stage [Website Resolution] — insufficient_company_evidence (no active canonical homepage resolved)',
      meta: {
        stage: 'Website Resolution',
        failedStage: 'Website Resolution',
        companyName: 'SaaSForge Systems',
        reason: 'insufficient_company_evidence',
        detail: 'no_company_website_confirmed (connection timed out)',
        status: 'rejected',
      },
    },
    {
      id: 'log-seed-15',
      ts: new Date(now - 156000).toISOString(),
      agent: 'Candidate Discovery',
      level: 'info',
      message: 'Evaluating candidate "monday.com" — Probing official domain https://monday.com...',
      meta: { stage: 'Website Resolution', companyName: 'monday.com' },
    },
    {
      id: 'log-seed-16',
      ts: new Date(now - 154000).toISOString(),
      agent: 'Candidate Discovery',
      level: 'info',
      message: 'Official website resolved for "monday.com": https://monday.com (HTTP 200, title: "monday.com | A new way of working")',
      meta: { stage: 'Website Resolution', companyName: 'monday.com', domain: 'monday.com' },
    },
    {
      id: 'log-seed-17',
      ts: new Date(now - 152000).toISOString(),
      agent: 'Candidate Discovery',
      level: 'info',
      message: 'Checking geography & identity terms for "monday.com" -> Soft gap US presence accepted',
      meta: { stage: 'Geography Verification', companyName: 'monday.com', geoCheck: 'soft_gap_us_pass' },
    },
    {
      id: 'log-seed-18',
      ts: new Date(now - 150000).toISOString(),
      agent: 'Candidate Discovery',
      level: 'success',
      message: 'Candidate qualified: "monday.com" (Tier: verified, Domain: https://monday.com)',
      meta: { stage: 'Candidate Accepted', companyName: 'monday.com', tier: 'verified' },
    },
    // Query 2
    {
      id: 'log-seed-19',
      ts: new Date(now - 147000).toISOString(),
      agent: 'Candidate Discovery',
      level: 'info',
      message: 'Executing Query 2/3: "B2B SaaS software official website"',
      meta: { stage: 'Query Dispatch', queryNumber: 2, limit: 3, query: 'B2B SaaS software official website' },
    },
    {
      id: 'log-seed-20',
      ts: new Date(now - 144000).toISOString(),
      agent: 'Candidate Discovery',
      level: 'info',
      message: 'Search Query 2 returned 20 raw results — Extracting candidate businesses',
      meta: { stage: 'Search Results Filtering', rawResults: 20 },
    },
    {
      id: 'log-seed-21',
      ts: new Date(now - 142000).toISOString(),
      agent: 'Candidate Discovery',
      level: 'warn',
      message: 'Candidate rejected: "Capterra / G2 Reviews" failed at Stage [Website Classification] — directory (site_is_source: directory/review portal)',
      meta: {
        stage: 'Website Classification',
        failedStage: 'Website Classification',
        companyName: 'Capterra / G2 Reviews',
        domain: 'capterra.com',
        reason: 'directory',
        detail: 'site_is_source (aggregator directory filtered)',
        status: 'rejected',
      },
    },
    {
      id: 'log-seed-22',
      ts: new Date(now - 140000).toISOString(),
      agent: 'Candidate Discovery',
      level: 'warn',
      message: 'Candidate rejected: "GrowthWave Digital" failed at Stage [Industry Exclusion Filter] — wrong_industry (site_describes_agency)',
      meta: {
        stage: 'Industry Exclusion Filter',
        failedStage: 'Industry Exclusion Filter',
        companyName: 'GrowthWave Digital',
        reason: 'wrong_industry',
        detail: 'site_describes_agency (marketing agency lookalike)',
        status: 'rejected',
      },
    },
    {
      id: 'log-seed-23',
      ts: new Date(now - 138000).toISOString(),
      agent: 'Candidate Discovery',
      level: 'info',
      message: 'Official website resolved for "PagerDuty": https://www.pagerduty.com (HTTP 200, title: "PagerDuty: Digital Operations Management")',
      meta: { stage: 'Website Resolution', companyName: 'PagerDuty', domain: 'pagerduty.com' },
    },
    {
      id: 'log-seed-24',
      ts: new Date(now - 136000).toISOString(),
      agent: 'Candidate Discovery',
      level: 'success',
      message: 'Candidate qualified: "PagerDuty" (Tier: verified, Domain: https://www.pagerduty.com, US presence confirmed)',
      meta: { stage: 'Candidate Accepted', companyName: 'PagerDuty', tier: 'verified' },
    },
    // Query 3
    {
      id: 'log-seed-25',
      ts: new Date(now - 133000).toISOString(),
      agent: 'Candidate Discovery',
      level: 'info',
      message: 'Executing Query 3/3: "B2B SaaS software contact us"',
      meta: { stage: 'Query Dispatch', queryNumber: 3, limit: 3, query: 'B2B SaaS software contact us' },
    },
    {
      id: 'log-seed-26',
      ts: new Date(now - 130000).toISOString(),
      agent: 'Candidate Discovery',
      level: 'info',
      message: 'Official website resolved for "Algolia": https://www.algolia.com (HTTP 200, title: "Algolia | Search and Discovery Platform")',
      meta: { stage: 'Website Resolution', companyName: 'Algolia', domain: 'algolia.com' },
    },
    {
      id: 'log-seed-27',
      ts: new Date(now - 128000).toISOString(),
      agent: 'Candidate Discovery',
      level: 'success',
      message: 'Candidate qualified: "Algolia" (Tier: verified, Domain: https://www.algolia.com, US presence confirmed)',
      meta: { stage: 'Candidate Accepted', companyName: 'Algolia', tier: 'verified' },
    },
    {
      id: 'log-seed-28',
      ts: new Date(now - 125000).toISOString(),
      agent: 'Candidate Discovery',
      level: 'info',
      message: 'Candidate Discovery stage completed: 3 target candidates qualified, 5 discarded across gates (Size: 1, Geo: 1, Domain: 1, Dir: 1, Agency: 1)',
      meta: { stage: 'Discovery Summary', qualified: 3, discarded: 5 },
    },

    // --- AGENT 3: CONTACT FINDER ---
    {
      id: 'log-seed-29',
      ts: new Date(now - 120000).toISOString(),
      agent: 'Contact Finder',
      level: 'info',
      message: 'Scanning official domain paths (/contact, /about, /team, footer) for official mailboxes',
      meta: { stage: 'Contact Scraping', candidatesCount: 4 },
    },
    {
      id: 'log-seed-30',
      ts: new Date(now - 117000).toISOString(),
      agent: 'Contact Finder',
      level: 'warn',
      message: 'Candidate rejected: "CloudPeak Analytics" failed at Stage [Contact Mailbox Discovery] — missing_contact_email (only protected web form with reCAPTCHA; no direct inbox)',
      meta: {
        stage: 'Contact Mailbox Discovery',
        failedStage: 'Contact Mailbox Discovery',
        companyName: 'CloudPeak Analytics',
        domain: 'cloudpeakanalytics.com',
        reason: 'missing_contact_email',
        detail: 'no_public_inbox_found (only form submissions allowed)',
        status: 'rejected',
      },
    },
    {
      id: 'log-seed-31',
      ts: new Date(now - 114000).toISOString(),
      agent: 'Contact Finder',
      level: 'success',
      message: 'Cleaned HTML entity escapes and decoded mailto for monday.com: support@monday.com',
      meta: { primary: 'support@monday.com', score: 90, sanitizedFrom: 'u003esupport@monday.com' },
    },
    {
      id: 'log-seed-32',
      ts: new Date(now - 110000).toISOString(),
      agent: 'Contact Finder',
      level: 'success',
      message: 'Found primary contact email for PagerDuty: sales@pagerduty.com',
      meta: { primary: 'sales@pagerduty.com', score: 95 },
    },
    {
      id: 'log-seed-33',
      ts: new Date(now - 106000).toISOString(),
      agent: 'Contact Finder',
      level: 'success',
      message: 'Found primary contact email for Algolia: contact@algolia.com',
      meta: { primary: 'contact@algolia.com', score: 95 },
    },

    // --- AGENT 4: NEED CHECK ENGINE ---
    {
      id: 'log-seed-34',
      ts: new Date(now - 100000).toISOString(),
      agent: 'Need Check Engine',
      level: 'info',
      message: 'Running deterministic markup tests on homepages and subpages (SEO meta, mobile viewport, layout tags)',
      meta: { testsChecked: ['seo_meta_description_missing', 'responsive_viewport_missing'] },
    },
    {
      id: 'log-seed-35',
      ts: new Date(now - 96000).toISOString(),
      agent: 'Need Check Engine',
      level: 'warn',
      message: 'Candidate rejected: "Veloce Data" failed at Stage [Deterministic DOM Audit] — no_service_need (site already fully responsive with valid SEO meta tags)',
      meta: {
        stage: 'Deterministic DOM Audit',
        failedStage: 'Deterministic DOM Audit',
        companyName: 'Veloce Data',
        domain: 'velocedata.io',
        reason: 'no_service_need',
        detail: 'zero_service_gaps_detected (all technical tests passed, redesign pitch not applicable)',
        status: 'rejected',
      },
    },
    {
      id: 'log-seed-36',
      ts: new Date(now - 92000).toISOString(),
      agent: 'Need Check Engine',
      level: 'success',
      message: '2 verified evidence signals recorded for monday.com',
      meta: { signals: ['Website has a mobile viewport meta tag', 'Website has a meta description tag'] },
    },
    {
      id: 'log-seed-37',
      ts: new Date(now - 88000).toISOString(),
      agent: 'Need Check Engine',
      level: 'success',
      message: '2 verified evidence signals recorded for PagerDuty',
      meta: { signals: ['Website has a mobile viewport meta tag', 'Website has a meta description tag'] },
    },
    {
      id: 'log-seed-38',
      ts: new Date(now - 84000).toISOString(),
      agent: 'Need Check Engine',
      level: 'success',
      message: '2 verified evidence signals recorded for Algolia',
      meta: { signals: ['Website has a mobile viewport meta tag', 'Website has a meta description tag'] },
    },

    // --- AGENT 5: EVIDENCE VERIFIER ---
    {
      id: 'log-seed-39',
      ts: new Date(now - 78000).toISOString(),
      agent: 'Evidence Verifier',
      level: 'info',
      message: 'Validating grounding evidence against raw HTML snapshots to eliminate hallucination vectors',
      meta: { stage: 'Evidence Verification' },
    },
    {
      id: 'log-seed-40',
      ts: new Date(now - 74000).toISOString(),
      agent: 'Evidence Verifier',
      level: 'warn',
      message: 'Candidate rejected: "Nexis Security" failed at Stage [Signal Grounding Gate] — unverified_grounding (DOM evidence could not be deterministically corroborated)',
      meta: {
        stage: 'Signal Grounding Gate',
        failedStage: 'Signal Grounding Gate',
        companyName: 'Nexis Security',
        domain: 'nexissecurity.com',
        reason: 'unverified_grounding',
        detail: 'evidence_fact_unsubstantiated (prevented outreach hallucination)',
        status: 'rejected',
      },
    },

    // --- AGENT 6: OUTREACH WRITER ---
    {
      id: 'log-seed-41',
      ts: new Date(now - 68000).toISOString(),
      agent: 'Outreach Writer',
      level: 'info',
      message: 'Drafting personalized outreach emails based strictly on verified facts (monday.com, PagerDuty, Algolia, Apex Flow)',
      meta: { leadsCount: 4, clientBrand: 'PixelCraft Studio' },
    },

    // --- AGENT 6.5: OUTREACH QA ---
    {
      id: 'log-seed-42',
      ts: new Date(now - 60000).toISOString(),
      agent: 'Outreach QA',
      level: 'warn',
      message: 'Candidate rejected: "Apex Flow Studio" failed at Stage [Outreach QA Quality Gate] — qa_unrepairable (unsubstantiated specific database claims exceeded 2 repair iterations)',
      meta: {
        stage: 'Outreach QA Quality Gate',
        failedStage: 'Outreach QA Quality Gate',
        companyName: 'Apex Flow Studio',
        domain: 'apexflowstudio.com',
        reason: 'qa_unrepairable',
        detail: 'claims_not_supported_by_verified_evidence (rejected to safeguard sender reputation)',
        status: 'rejected',
      },
    },
    {
      id: 'log-seed-43',
      ts: new Date(now - 54000).toISOString(),
      agent: 'Outreach QA',
      level: 'info',
      message: 'Starting Outreach QA check for monday.com',
      meta: { candidate: 'monday.com', evidenceCount: 2 },
    },
    {
      id: 'log-seed-44',
      ts: new Date(now - 50000).toISOString(),
      agent: 'Outreach QA',
      level: 'warn',
      message: 'monday.com draft needs attention (2 issues detected: missing sign-off & weak evidence terms)',
      meta: { issues: ['missing final "Best regards" sign-off', 'company-specific sentence has weak evidence support'] },
    },
    {
      id: 'log-seed-45',
      ts: new Date(now - 45000).toISOString(),
      agent: 'Outreach QA',
      level: 'info',
      message: 'Attempting QA auto-repair pass 1/2 using verified evidence facts',
      meta: { revision: 2 },
    },
    {
      id: 'log-seed-46',
      ts: new Date(now - 40000).toISOString(),
      agent: 'Outreach QA',
      level: 'info',
      message: 'Starting Outreach QA check for PagerDuty',
      meta: { candidate: 'PagerDuty' },
    },
    {
      id: 'log-seed-47',
      ts: new Date(now - 34000).toISOString(),
      agent: 'Outreach QA',
      level: 'success',
      message: 'Final email passed QA for PagerDuty (Revisions: 1, Issues: 0)',
      meta: { candidate: 'PagerDuty', qaStatus: 'passed' },
    },
    {
      id: 'log-seed-48',
      ts: new Date(now - 26000).toISOString(),
      agent: 'Outreach QA',
      level: 'info',
      message: 'Starting Outreach QA check for Algolia — Verifying proper noun possessives',
      meta: { candidate: 'Algolia' },
    },
    {
      id: 'log-seed-49',
      ts: new Date(now - 20000).toISOString(),
      agent: 'Outreach QA',
      level: 'success',
      message: 'Proper noun "Algolia\'s" possessive stripped; "B2B" digit preserved; business correspondence terms allowed',
      meta: { cleanedWord: 'Algolia', passed: true },
    },
    {
      id: 'log-seed-50',
      ts: new Date(now - 14000).toISOString(),
      agent: 'Outreach QA',
      level: 'success',
      message: 'Final email passed QA for Algolia (Revisions: 1, Issues: 0)',
      meta: { candidate: 'Algolia', qaStatus: 'passed' },
    },
    {
      id: 'log-seed-51',
      ts: new Date(now - 4000).toISOString(),
      agent: 'Target Profiler',
      level: 'success',
      message: 'Pipeline completed successfully: 3 leads qualified, 9 candidates filtered across gates, 6 evidence verified, 3 queries executed, 181.9s runtime',
      meta: { qualifiedLeads: 3, candidatesFiltered: 9, evidenceVerified: 6, queries: 3, runtimeSeconds: 181.9 },
    },
  ];
}

// Keep real live logs separate from demo seed logs.
/**
 * Runs a live streaming simulation of the full multi-agent pipeline with visible intervals.
 */
export async function simulateLivePipeline({
  campaignName = 'PixelCraft Studio',
  onLog = () => {},
  delayMs = 280,
  signal = null,
} = {}) {
  const steps = [
    {
      agent: 'Target Profiler',
      level: 'info',
      message: `Starting AutoFiverr pipeline for "${campaignName}"...`,
      meta: { timestamp: new Date().toISOString() },
    },
    {
      agent: 'Target Profiler',
      level: 'info',
      message: 'Agent 1: Checking project submission and identifying targeting parameters',
      meta: { mode: 'company_discovery', temporalConstraint: false },
    },
    {
      agent: 'Target Profiler',
      level: 'success',
      message: 'Targeting specification built: 0 copyright date restrictions, 2 deterministic need checks selected',
      meta: { needTests: ['seo_meta_description_missing', 'responsive_viewport_missing'] },
    },
    // Agent 2: Candidate Discovery Stages
    {
      agent: 'Candidate Discovery',
      level: 'info',
      message: 'Agent 2: Initializing Brave search queue (12 candidate queries synthesized)',
      meta: { stage: 'Queue Formulation', queryRefillSafety: 'guaranteed_no_bogus_events' },
    },
    {
      agent: 'Candidate Discovery',
      level: 'info',
      message: 'Query 1/3: "Small-to-medium B2B SaaS companies software" dispatched',
      meta: { stage: 'Query Dispatch', queryNumber: 1, limit: 3, status: 'running' },
    },
    {
      agent: 'Candidate Discovery',
      level: 'info',
      message: 'Search Query 1 returned 20 raw results (15 usable after filtering directories & social hosts)',
      meta: { stage: 'Search Results Filtering', rawResults: 20, usable: 15 },
    },
    {
      agent: 'Candidate Discovery',
      level: 'info',
      message: 'Extracting candidate business entities from snippets via Gemini AI',
      meta: { stage: 'Entity Extraction', engine: 'Gemini LLM' },
    },
    {
      agent: 'Candidate Discovery',
      level: 'info',
      message: 'Evaluating candidate "Salesforce" across qualification pipeline',
      meta: { stage: 'Candidate Verification', companyName: 'Salesforce' },
    },
    {
      agent: 'Candidate Discovery',
      level: 'warn',
      message: 'Candidate rejected: "Salesforce" failed at Stage [Company Size Gate] — wrong_size (enterprise_tech_giant:salesforce.com)',
      meta: {
        stage: 'Company Size Gate',
        failedStage: 'Company Size Gate',
        companyName: 'Salesforce',
        domain: 'salesforce.com',
        reason: 'wrong_size',
        detail: 'enterprise_tech_giant:salesforce.com (>10,000 employees exceeds SMB cap)',
        status: 'rejected',
      },
    },
    {
      agent: 'Candidate Discovery',
      level: 'info',
      message: 'Evaluating candidate "Cognism" — Probing domain https://cognism.com and evaluating location',
      meta: { stage: 'Website Resolution', companyName: 'Cognism' },
    },
    {
      agent: 'Candidate Discovery',
      level: 'warn',
      message: 'Candidate rejected: "Cognism" failed at Stage [Geography Gate] — geography_mismatch (headquartered in London, United Kingdom)',
      meta: {
        stage: 'Geography Gate',
        failedStage: 'Geography Gate',
        companyName: 'Cognism',
        domain: 'cognism.com',
        reason: 'geography_mismatch',
        detail: 'place_not_found:United States (detected UK headquarters)',
        status: 'rejected',
      },
    },
    {
      agent: 'Candidate Discovery',
      level: 'info',
      message: 'Evaluating candidate "SaaSForge Systems" — Probing official domain guesses...',
      meta: { stage: 'Website Resolution', companyName: 'SaaSForge Systems' },
    },
    {
      agent: 'Candidate Discovery',
      level: 'warn',
      message: 'Candidate rejected: "SaaSForge Systems" failed at Stage [Website Resolution] — insufficient_company_evidence (no active canonical homepage resolved)',
      meta: {
        stage: 'Website Resolution',
        failedStage: 'Website Resolution',
        companyName: 'SaaSForge Systems',
        reason: 'insufficient_company_evidence',
        detail: 'no_company_website_confirmed (connection timed out)',
        status: 'rejected',
      },
    },
    {
      agent: 'Candidate Discovery',
      level: 'info',
      message: 'Probing official website for "monday.com" at https://monday.com...',
      meta: { stage: 'Website Resolution', companyName: 'monday.com' },
    },
    {
      agent: 'Candidate Discovery',
      level: 'info',
      message: 'Official website resolved for "monday.com": https://monday.com (HTTP 200)',
      meta: { stage: 'Website Resolution', companyName: 'monday.com', domain: 'monday.com' },
    },
    {
      agent: 'Candidate Discovery',
      level: 'success',
      message: 'Candidate qualified: "monday.com" (Tier: verified, Domain: https://monday.com | Soft-gap US accepted)',
      meta: { stage: 'Candidate Accepted', companyName: 'monday.com', tier: 'verified' },
    },
    // Query 2
    {
      agent: 'Candidate Discovery',
      level: 'info',
      message: 'Query 2/3: "B2B SaaS software official website" dispatched',
      meta: { stage: 'Query Dispatch', queryNumber: 2, limit: 3, status: 'running' },
    },
    {
      agent: 'Candidate Discovery',
      level: 'warn',
      message: 'Candidate rejected: "Capterra / G2 Reviews" failed at Stage [Website Classification] — directory (site_is_source)',
      meta: {
        stage: 'Website Classification',
        failedStage: 'Website Classification',
        companyName: 'Capterra / G2 Reviews',
        domain: 'capterra.com',
        reason: 'directory',
        detail: 'site_is_source (aggregator directory filtered)',
        status: 'rejected',
      },
    },
    {
      agent: 'Candidate Discovery',
      level: 'warn',
      message: 'Candidate rejected: "GrowthWave Digital" failed at Stage [Industry Exclusion Filter] — wrong_industry (site_describes_agency)',
      meta: {
        stage: 'Industry Exclusion Filter',
        failedStage: 'Industry Exclusion Filter',
        companyName: 'GrowthWave Digital',
        reason: 'wrong_industry',
        detail: 'site_describes_agency (marketing agency lookalike)',
        status: 'rejected',
      },
    },
    {
      agent: 'Candidate Discovery',
      level: 'info',
      message: 'Probing official website for "PagerDuty" at https://www.pagerduty.com...',
      meta: { stage: 'Website Resolution', companyName: 'PagerDuty' },
    },
    {
      agent: 'Candidate Discovery',
      level: 'success',
      message: 'Candidate qualified: "PagerDuty" (Tier: verified, Domain: https://www.pagerduty.com | US headquarters confirmed)',
      meta: { stage: 'Candidate Accepted', companyName: 'PagerDuty', tier: 'verified' },
    },
    // Query 3
    {
      agent: 'Candidate Discovery',
      level: 'info',
      message: 'Query 3/3: "B2B SaaS software contact us" dispatched',
      meta: { stage: 'Query Dispatch', queryNumber: 3, limit: 3, status: 'running' },
    },
    {
      agent: 'Candidate Discovery',
      level: 'info',
      message: 'Probing official website for "Algolia" at https://www.algolia.com...',
      meta: { stage: 'Website Resolution', companyName: 'Algolia' },
    },
    {
      agent: 'Candidate Discovery',
      level: 'success',
      message: 'Candidate qualified: "Algolia" (Tier: verified, Domain: https://www.algolia.com | US presence confirmed)',
      meta: { stage: 'Candidate Accepted', companyName: 'Algolia', tier: 'verified' },
    },
    {
      agent: 'Candidate Discovery',
      level: 'info',
      message: 'Candidate Discovery complete: 3 qualified candidates found, 5 filtered across gate checks',
      meta: { stage: 'Discovery Summary', qualified: 3, filtered: 5 },
    },

    // Agent 3: Contact Finder
    {
      agent: 'Contact Finder',
      level: 'info',
      message: 'Agent 3: Scraping official company domain pages for contact mailboxes (/contact, /about, /team)',
      meta: { stage: 'Contact Scraping', candidatesCount: 4 },
    },
    {
      agent: 'Contact Finder',
      level: 'warn',
      message: 'Candidate rejected: "CloudPeak Analytics" failed at Stage [Contact Mailbox Discovery] — missing_contact_email (only protected web form with reCAPTCHA; no direct inbox)',
      meta: {
        stage: 'Contact Mailbox Discovery',
        failedStage: 'Contact Mailbox Discovery',
        companyName: 'CloudPeak Analytics',
        domain: 'cloudpeakanalytics.com',
        reason: 'missing_contact_email',
        detail: 'no_public_inbox_found',
        status: 'rejected',
      },
    },
    {
      agent: 'Contact Finder',
      level: 'success',
      message: 'Discovered primary contact email for monday.com: support@monday.com (cleaned unicode \\u003e)',
      meta: { email: 'support@monday.com', priorityScore: 90 },
    },
    {
      agent: 'Contact Finder',
      level: 'success',
      message: 'Discovered primary contact email for PagerDuty: sales@pagerduty.com',
      meta: { email: 'sales@pagerduty.com', priorityScore: 95 },
    },
    {
      agent: 'Contact Finder',
      level: 'success',
      message: 'Discovered primary contact email for Algolia: contact@algolia.com',
      meta: { email: 'contact@algolia.com', priorityScore: 95 },
    },

    // Agent 4: Need Check Engine
    {
      agent: 'Need Check Engine',
      level: 'info',
      message: 'Agent 4: Executing deterministic need checks on official web pages',
      meta: { totalTests: 6 },
    },
    {
      agent: 'Need Check Engine',
      level: 'warn',
      message: 'Candidate rejected: "Veloce Data" failed at Stage [Deterministic DOM Audit] — no_service_need (site already fully responsive with valid SEO meta tags)',
      meta: {
        stage: 'Deterministic DOM Audit',
        failedStage: 'Deterministic DOM Audit',
        companyName: 'Veloce Data',
        domain: 'velocedata.io',
        reason: 'no_service_need',
        detail: 'zero_service_gaps_detected (all technical tests passed)',
        status: 'rejected',
      },
    },
    {
      agent: 'Need Check Engine',
      level: 'success',
      message: 'monday.com: Verified mobile viewport meta tag & meta description presence (2 verified signals)',
      meta: { verifiedSignals: 2 },
    },
    {
      agent: 'Need Check Engine',
      level: 'success',
      message: 'PagerDuty: Verified mobile viewport meta tag & meta description presence (2 verified signals)',
      meta: { verifiedSignals: 2 },
    },
    {
      agent: 'Need Check Engine',
      level: 'success',
      message: 'Algolia: Verified mobile viewport meta tag & meta description presence (2 verified signals)',
      meta: { verifiedSignals: 2 },
    },

    // Agent 5: Evidence Verifier
    {
      agent: 'Evidence Verifier',
      level: 'info',
      message: 'Agent 5: Validating grounding evidence against raw HTML snapshots to eliminate hallucination vectors',
      meta: { stage: 'Evidence Verification' },
    },
    {
      agent: 'Evidence Verifier',
      level: 'warn',
      message: 'Candidate rejected: "Nexis Security" failed at Stage [Signal Grounding Gate] — unverified_grounding (DOM evidence could not be deterministically corroborated)',
      meta: {
        stage: 'Signal Grounding Gate',
        failedStage: 'Signal Grounding Gate',
        companyName: 'Nexis Security',
        domain: 'nexissecurity.com',
        reason: 'unverified_grounding',
        detail: 'evidence_fact_unsubstantiated',
        status: 'rejected',
      },
    },

    // Agent 6: Outreach Writer
    {
      agent: 'Outreach Writer',
      level: 'info',
      message: 'Agent 6: Generating custom outreach emails grounded strictly in verified evidence',
      meta: { templates: 'personalized_b2b_saas' },
    },

    // Agent 6.5: Outreach QA
    {
      agent: 'Outreach QA',
      level: 'warn',
      message: 'Candidate rejected: "Apex Flow Studio" failed at Stage [Outreach QA Quality Gate] — qa_unrepairable (unsubstantiated specific database claims exceeded 2 repair iterations)',
      meta: {
        stage: 'Outreach QA Quality Gate',
        failedStage: 'Outreach QA Quality Gate',
        companyName: 'Apex Flow Studio',
        domain: 'apexflowstudio.com',
        reason: 'qa_unrepairable',
        detail: 'claims_not_supported_by_verified_evidence',
        status: 'rejected',
      },
    },
    {
      agent: 'Outreach QA',
      level: 'info',
      message: 'Agent 6.5: Starting deterministic structure & grounding QA review on monday.com draft',
      meta: { candidate: 'monday.com' },
    },
    {
      agent: 'Outreach QA',
      level: 'warn',
      message: 'monday.com draft flagged: missing sign-off & weak evidence terms ("contacting", "technical", "configuration")',
      meta: { issuesCount: 2, action: 'triggering_repair_pass' },
    },
    {
      agent: 'Outreach QA',
      level: 'info',
      message: 'Repair pass 1/2 complete: email revised using allowed business vocabulary & sign-off appended',
      meta: { revisions: 2 },
    },
    {
      agent: 'Outreach QA',
      level: 'info',
      message: 'Agent 6.5: Starting QA review on PagerDuty draft',
      meta: { candidate: 'PagerDuty' },
    },
    {
      agent: 'Outreach QA',
      level: 'success',
      message: 'PagerDuty draft passed QA check on first pass (0 issues detected)',
      meta: { passed: true, revisions: 1 },
    },
    {
      agent: 'Outreach QA',
      level: 'info',
      message: 'Agent 6.5: Starting QA review on Algolia draft — checking possessive "Algolia\'s" and "B2B" terms',
      meta: { candidate: 'Algolia' },
    },
    {
      agent: 'Outreach QA',
      level: 'success',
      message: 'Algolia draft passed QA check: possessive stripped, digit "2" allowed, correspondence vocabulary recognized',
      meta: { passed: true, revisions: 1 },
    },
    {
      agent: 'Target Profiler',
      level: 'success',
      message: `Pipeline run complete! 3 qualified leads ready for outreach · 9 candidates filtered across gates · 6 evidence signals verified · 181.9s runtime`,
      meta: { status: 'complete', leadsCount: 3, candidatesFiltered: 9, evidenceCount: 6 },
    },
  ];

  for (const step of steps) {
    if (signal?.aborted) break;
    const entry = emitAgentLog(step.agent, step.level, step.message, step.meta);
    onLog(entry);
    await new Promise((res) => setTimeout(res, delayMs));
  }
}

export default emitAgentLog;
