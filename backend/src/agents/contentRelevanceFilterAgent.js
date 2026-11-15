/**
 * @file contentRelevanceFilterAgent.js
 * Agent 4 — Content Relevance Filter
 *
 * A company survives ONLY if a deterministic need check found a real gap that the client's
 * service addresses. Generic homepage text is never enough (that is how companies with no
 * need used to slip through).
 */

import { emitAgentLog } from '../utils/liveLog.js';
import { CHANNEL_LABEL } from './webEvidenceAgent.js';

const AGENT_NAME = 'ContentRelevanceFilter';
const LIVE_LABEL = 'Content Relevance Filter';
const MAX_NEED_ITEMS = 3;

function log(level, message, meta = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), agent: AGENT_NAME, level, message, ...meta });
  (level === 'error' ? console.error : console.log)(line);
  emitAgentLog(LIVE_LABEL, level, message, meta);
}

export async function runContentRelevanceFilter(input) {
  const startedAt = Date.now();
  const { company } = input ?? {};
  const companyName = company?.companyName;

  log('info', 'Agent started: Evaluating evidence relevance to service', { company: companyName });

  const all = (company?.evidence || []).filter((e) => e.content && e.sourceUrl);
  const siteNeeds = all.filter((e) => e.sourceType === 'need_check');
  const webItems = all.filter((e) => e.sourceType === 'web_source');

  if (!siteNeeds.length && !webItems.length) {
    return {
      status: 'discarded',
      output: null,
      reason: 'No evidence about this company was found on its website or in web sources (news, LinkedIn, reviews, jobs).',
    };
  }

  // Website findings first (strongest, deterministic), then web sources; web items with an LLM-drawn problem go first.
  const RANK = { strong: 0, moderate: 1, weak: 2 };
  const goodWeb = webItems.filter((i) => i.strength !== 'weak');
  const webSorted = [...(goodWeb.length ? goodWeb : webItems)].sort(
    (a, b) => (RANK[a.strength] ?? 1) - (RANK[b.strength] ?? 1) || Number(Boolean(b.problem)) - Number(Boolean(a.problem)),
  );
  const picked = [...siteNeeds.slice(0, 2), ...webSorted.slice(0, 2)].slice(0, MAX_NEED_ITEMS + 1);

  const relevantEvidence = picked.map((item) =>
    item.sourceType === 'need_check'
      ? {
          signal: 'observable service need',
          reason: 'A deterministic check found a verifiable website gap related to the offered service',
          sourceTitle: item.sourceTitle,
          sourceUrl: item.sourceUrl,
          excerpt: item.content,
          retrievalMethod: item.retrievalMethod,
          sourceType: 'need_check',
          needCheck: item.needCheck,
        }
      : {
          signal: `${CHANNEL_LABEL[item.channel] || 'web mention'}${item.date ? ` (${item.date})` : ''}${item.strength === 'weak' ? ' - weak source' : ''}`,
          reason: item.problem ? `Our inference: ${item.problem}` : 'Public source about this company. It shows the company is active; it does not prove a need.',
          sourceTitle: item.sourceTitle,
          sourceUrl: item.sourceUrl,
          excerpt: item.content,
          retrievalMethod: item.retrievalMethod,
          sourceType: 'web_source',
          channel: item.channel,
          strength: item.strength || 'moderate',
          date: item.date || null,
          problem: item.problem || '',
          fullSnippet: item.fullSnippet,
          pageAge: item.pageAge,
        },
  );

  log('success', 'Relevant evidence approved', { company: companyName, items: relevantEvidence.length });

  return {
    status: 'success',
    output: { companyName, website: company.website || null, relevantEvidence, profiles: company.profiles || {}, place: company.place || null },
    metrics: { relevantCount: relevantEvidence.length, durationMs: Date.now() - startedAt },
  };
}

export default runContentRelevanceFilter;