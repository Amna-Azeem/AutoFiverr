/**
 * @file companyScraperAgent.js
 * Agent 3 — Company Scraper
 *
 * Reads the company's own website and runs the deterministic need checks
 * (needCheckEngine) that decide whether the company really needs the client's service.
 *
 * Evidence sources (a company is qualified if ANY of them produces verifiable evidence):
 *  - website need checks (when the company has a reachable website)
 *  - web sources through Brave: news, LinkedIn, reviews, jobs, social (webEvidenceAgent)
 * No website, an unreachable website, or no public email no longer rejects a lead.
 */

import * as cheerio from 'cheerio';
import { emitAgentLog } from '../utils/liveLog.js';
import { runNeedChecks } from './needCheckEngine.js';
import { gatherWebEvidence } from './webEvidenceAgent.js';

const AGENT_NAME = 'CompanyScraper';
const LIVE_LABEL = 'Company Scraper';
const FETCH_TIMEOUT_MS = 12000;

const BOILERPLATE_RE =
  /\b(skip to (?:main )?content|cookie settings|accept all(?: cookies)?|manage cookies|we use cookies[^.]*\.|book a demo|request a demo|log ?in|sign ?in|sign ?up|get started)\b/gi;

function log(level, message, meta = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), agent: AGENT_NAME, level, message, ...meta });
  (level === 'error' ? console.error : console.log)(line);
  emitAgentLog(LIVE_LABEL, level, message, meta);
}

function clean(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

export function stripBoilerplate(text) {
  return clean(String(text ?? '').replace(BOILERPLATE_RE, ' '));
}

async function fetchPage(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AutoFiverrBot/1.0)', Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false };
    const html = (await res.text()).slice(0, 500000);
    return { ok: true, html, url: res.url || url };
  } catch {
    return { ok: false };
  }
}

export async function runCompanyScraper(input) {
  const startedAt = Date.now();
  const company = input?.company ?? input;
  const profile = input?.profile;

  const { companyName, website } = company ?? {};
  log('info', 'Agent started: collecting evidence from the website and the wider web', { company: companyName, website: website || 'none' });

  const needTests = profile?.targetingSpec?.needTests ?? [];
  const evidence = [];
  let needResults = null;
  let siteNote = '';

  // Website checks and web-source search run side by side. Neither one is required on its own:
  // a company with no website, or one we cannot reach, can still be qualified from news, LinkedIn, reviews or jobs.
  const siteTask = (async () => {
    if (!website) { siteNote = 'no website'; return; }
    if (!needTests.length) { siteNote = 'no buying signs configured for the website'; return; }

    const home = await fetchPage(website);
    if (home.ok) {
      const $ = cheerio.load(home.html);
      $('script, style, noscript, nav, footer, svg, iframe').remove();
      const text = stripBoilerplate($('body').text()).slice(0, 3000);
      if (text) {
        evidence.push({
          sourceTitle: clean($('title').text()) || companyName,
          sourceUrl: home.url,
          content: text,
          retrievalMethod: 'page_fetch',
          sourceType: 'website',
        });
      }
    }

    try {
      needResults = await runNeedChecks(website, needTests);
    } catch (error) {
      siteNote = `website check failed: ${error?.message || error}`;
      return;
    }
    if (!needResults?.ok) siteNote = `website could not be inspected: ${needResults?.reason || 'unreachable'}`;
    else if (!needResults.findings.length && needResults.scanIncomplete) siteNote = 'website scan incomplete';
  })();

  const webTask = gatherWebEvidence({ company, profile }).catch((error) => {
    log('warn', 'Web evidence failed', { company: companyName, error: error?.message || String(error) });
    return { items: [], profiles: {}, searches: 0, method: 'error' };
  });

  const [, web] = await Promise.all([siteTask, webTask]);

  const needItems = needResults?.ok && needResults.findings?.length ? needResults.evidence : [];
  if (needItems.length) {
    log('success', 'Verifiable service needs detected on website', {
      company: companyName,
      findings: needResults.findings.map((f) => f.id),
    });
    evidence.push(...needItems);
  } else if (website) {
    log('info', `No service need confirmed on website${siteNote ? ` (${siteNote})` : ''}`, { company: companyName });
  }

  evidence.push(...web.items);

  const usable = evidence.filter((e) => e.sourceType === 'need_check' || e.sourceType === 'web_source');
  if (!usable.length) {
    return {
      status: 'discarded',
      output: null,
      reason: `No evidence about this company could be found on its website${siteNote ? ` (${siteNote})` : ''} or in news, LinkedIn, reviews or job posts.`,
    };
  }

  // Search-snippet mentions from discovery (context only).
  if (Array.isArray(company.discoverySources)) {
    for (const src of company.discoverySources) {
      if (src?.description) {
        evidence.push({
          sourceTitle: src.title || companyName,
          sourceUrl: src.url,
          content: src.description,
          retrievalMethod: 'search_snippet',
          sourceType: 'mention',
        });
      }
    }
  }

  return {
    status: 'success',
    output: {
      companyName,
      website: website || null,
      evidence,
      profiles: web.profiles || {},
      place: company.place || null,
      needFindings: (needResults?.findings || []).map((f) => ({ id: f.id, text: f.text, sourceUrl: f.sourceUrl })),
      checkedTests: needResults?.checkedTestIds || [],
      unavailableTests: needResults?.unavailableTests || [],
    },
    metrics: {
      evidenceCount: usable.length,
      websiteFindings: needItems.length,
      webSourceItems: web.items.length,
      pagesRead: needResults?.pagesRead || 0,
      durationMs: Date.now() - startedAt,
    },
  };
}

export default runCompanyScraper;
