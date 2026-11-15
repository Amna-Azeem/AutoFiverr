/**
 * @file webEvidenceAgent.js
 * Finds evidence about a company OUTSIDE its own website: news, LinkedIn, reviews, job posts, social pages.
 * It uses Brave web search, so it works for companies with no website at all.
 * Sources are classified (news, job posting, LinkedIn post, reviews, directory ...) and ranked by strength.
 * Employee reviews (Glassdoor, Indeed company reviews) are never used.
 *
 * Every evidence item carries:
 *   - the exact text Brave returned (a quote that really exists in the search result)
 *   - the URL it came from and the channel (news / linkedin / reviews / jobs / social / listing)
 *   - optionally a one-sentence "problem" that an LLM drew from that quote (never invented: the quote is checked)
 *
 * verifyWebEvidence() re-checks an item later (Agent 5): identity match, plus a live page fetch when the site allows it.
 *
 * ENV:
 *   BRAVE_API_KEY                required (without it the module returns only listing evidence)
 *   WEB_EVIDENCE_SEARCHES        searches per company, default 4 (1-4)
 *   WEB_EVIDENCE_LLM             "false" turns the LLM relevance judgement off (keyword fallback is always available)
 */

import * as cheerio from 'cheerio';
import { braveSearch } from './candidateDiscoveryAgent.js';
import { callGeminiJson, llmAvailable } from './Llmclient.js';
import { emitAgentLog } from '../utils/liveLog.js';

const AGENT = 'WebEvidence';
const LABEL = 'Web Evidence';
const MAX_ITEMS = 3;
const VERIFY_FETCH_TIMEOUT_MS = 7000;

const LEGAL_SUFFIX_RE = /[,\s]+(?:ltd|limited|pvt|private|inc|incorporated|llc|llp|corp|corporation|co|company|plc|gmbh|pte|bv|sa|ag|smc)\.?$/i;
const STOP = new Set(['the', 'and', 'for', 'with', 'our', 'your', 'that', 'this', 'from', 'their', 'services', 'service', 'company', 'business', 'clients', 'help', 'helps', 'provide', 'provides', 'offer', 'offers', 'solutions', 'solution', 'customers', 'including', 'also', 'more', 'every', 'using', 'based', 'across', 'within']);
const TRIGGER_RE = /\b(hiring|recruiting|we(?:'|’)re looking|job opening|launch(?:es|ed)?|expan(?:d|ds|ded|sion)|grow(?:s|ing|th)?|new (?:office|branch|store|location|product|service)|open(?:s|ed|ing)|funding|raised|partnership|announce[sd]?|award|complain\w*|slow|delay\w*|manual|outdated|poor|unresponsive|waiting|issue|problem)\b/i;

const log = (level, message, meta = {}) => {
  const line = JSON.stringify({ ts: new Date().toISOString(), agent: AGENT, level, message, ...meta });
  (level === 'error' ? console.error : console.log)(line);
  try { emitAgentLog(LABEL, level, message, meta); } catch { /* logging never breaks the pipeline */ }
};

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const norm = (s) => clean(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function shortName(name) {
  let t = clean(name);
  for (let i = 0; i < 3; i += 1) {
    const next = t.replace(LEGAL_SUFFIX_RE, '').trim();
    if (next === t) break;
    t = next;
  }
  return t || clean(name);
}

function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}

/** True when the text clearly talks about this company (full name, or every significant name word). */
export function mentionsCompany(text, companyName) {
  const hay = ` ${norm(text)} `;
  const full = norm(shortName(companyName));
  if (!full) return false;
  if (hay.includes(` ${full} `)) return true;
  const tokens = full.split(' ').filter((t) => t.length > 2);
  return tokens.length > 1 && tokens.every((t) => hay.includes(` ${t} `) || hay.includes(` ${t}`));
}

// Where a result really comes from decides how much it is worth. Search type alone is not enough:
// ZoomInfo or Crunchbase pages show up in a "news" search but are company directories, not news.
const DIRECTORY_RE = /(^|\.)(zoominfo|crunchbase|apollo|rocketreach|dnb|manta|bbb|yellowpages|clutch|goodfirms|tracxn|pitchbook|dealroom|growjo|owler|cbinsights|leadiq|contactout|signalhire|lusha|craft|opencorporates|buzzfile|mapquest|chamberofcommerce|cylex|hotfrog|superpages|bizapedia|corporationwiki|zaubacorp|similarweb|datanyze|globaldatabase)\./i;
const EMPLOYEE_REVIEW_RE = /(^|\.)(glassdoor|comparably|ambitionbox|payscale|salary)\./i;
const JOB_SITE_RE = /(^|\.)(indeed|ziprecruiter|rozee|bayt|wellfound|workable|lever|greenhouse|smartrecruiters|jobvite|monster|simplyhired|careerbuilder|naukri)\./i;
const REVIEW_SITE_RE = /(^|\.)(trustpilot|yelp|g2|capterra|tripadvisor|softwareadvice|getapp|sitejabber|consumeraffairs)\./i;

/** @returns {{channel:string, strength:'strong'|'moderate'|'weak', skip?:boolean}} */
export function classifySource(url, queryChannel) {
  const h = hostOf(url);
  const path = (() => { try { return new URL(url).pathname.toLowerCase(); } catch { return ''; } })();

  if (EMPLOYEE_REVIEW_RE.test(h)) {
    // Glassdoor: only an actual job listing is usable. Employee reviews are never used in outreach.
    return /\/job|\/jobs|job-listing/.test(path) ? { channel: 'jobs', strength: 'strong' } : { channel: 'employee_reviews', strength: 'weak', skip: true };
  }
  if (JOB_SITE_RE.test(h)) {
    // Indeed company pages (/cmp/..., especially /reviews) hold employee reviews: skip. Job pages are fine.
    if (/(^|\.)indeed\./.test(h) && /\/cmp\//.test(path)) return /\/jobs?(\/|$)/.test(path) && !/reviews|salaries|interviews|benefits|questions/.test(path) ? { channel: 'jobs', strength: 'strong' } : { channel: 'employee_reviews', strength: 'weak', skip: true };
    return { channel: 'jobs', strength: 'strong' };
  }
  if (/(^|\.)linkedin\.com$/.test(h)) {
    if (/\/jobs\//.test(path)) return { channel: 'jobs', strength: 'strong' };
    if (/\/posts\/|\/pulse\/|\/feed\/update/.test(path)) return { channel: 'linkedin_post', strength: 'strong' };
    return { channel: 'linkedin', strength: 'weak' }; // company "About" text is mostly boilerplate
  }
  if (DIRECTORY_RE.test(h)) return { channel: 'directory', strength: 'weak' };
  if (/(^|\.)(facebook|instagram|x|twitter|tiktok|youtube)\.com$/.test(h)) return { channel: 'social', strength: 'moderate' };
  if (REVIEW_SITE_RE.test(h) || (/(^|\.)google\./.test(h) && /review/.test(url))) return { channel: 'reviews', strength: 'moderate' };
  if (queryChannel === 'jobs') return { channel: 'jobs', strength: 'moderate' };
  if (queryChannel === 'reviews') return { channel: 'reviews', strength: 'moderate' };
  if (queryChannel === 'news') return { channel: 'news', strength: 'strong' };
  return { channel: queryChannel || 'web', strength: 'moderate' };
}

export const CHANNEL_LABEL = {
  news: 'news mention',
  linkedin: 'LinkedIn company page',
  linkedin_post: 'LinkedIn post',
  reviews: 'customer reviews',
  jobs: 'job posting',
  social: 'social media page',
  directory: 'company directory profile',
  rating: 'Google rating',
  listing: 'business listing',
  web: 'web mention',
};

function serviceKeywords(profile) {
  const text = [profile?.clientServiceSummary, profile?.researchFocus, ...(profile?.targetingSpec?.needTests || []).map((t) => t?.claim)].join(' ');
  const counts = new Map();
  for (const w of norm(text).split(' ')) {
    if (w.length < 5 || STOP.has(w)) continue;
    counts.set(w, (counts.get(w) || 0) + 1);
  }
  return [...counts.keys()].slice(0, 14);
}

function buildQueries(name, location, max) {
  const n = shortName(name);
  const loc = clean(location);
  const all = [
    // company page: gives us the LinkedIn address for the contact step
    { channel: 'linkedin', query: `"${n}" site:linkedin.com/company` },
    // recent news only, no city name (it pulls in directory pages)
    { channel: 'news', query: `"${n}" news OR announces OR expands OR launches OR partnership`, freshness: 'py' },
    { channel: 'jobs', query: `"${n}" hiring OR "job openings" OR careers ${loc}`.trim() },
    { channel: 'reviews', query: `"${n}" customer reviews ${loc}`.trim() },
    // posts and job pages on LinkedIn say far more than the company "About" text
    { channel: 'linkedin_post', query: `"${n}" site:linkedin.com/posts OR site:linkedin.com/jobs` },
  ];
  return all.slice(0, Math.max(1, Math.min(all.length, max)));
}

const PICK_SCHEMA = {
  type: 'OBJECT',
  properties: {
    picks: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { index: { type: 'INTEGER' }, problem: { type: 'STRING' }, quote: { type: 'STRING' } },
        required: ['index', 'problem', 'quote'],
      },
    },
  },
  required: ['picks'],
};

async function llmPick(profile, companyName, candidates) {
  const list = candidates
    .map((c, i) => `[${i}] (${CHANNEL_LABEL[c.channel] || c.channel}${c.pageAge ? `, ${String(c.pageAge).slice(0, 10)}` : ''}, source strength: ${c.strength}) ${c.title}\n${c.text}`)
    .join('\n\n');
  const prompt = `We sell this service: ${clean(profile?.clientServiceSummary)}
${clean(profile?.researchFocus) ? `Clues we care about: ${clean(profile.researchFocus)}\n` : ''}
Target company: ${companyName}

Below are web search snippets about this company. Pick up to ${MAX_ITEMS} that show something specific and current about THIS company (a launch, expansion, hiring, a customer complaint, a gap) that connects to our service.
Rules:
- Prefer news, job postings and LinkedIn posts. Prefer recent items.
- REJECT generic company descriptions ("provides freight forwarding services", "About us" text, directory profiles) unless nothing better exists. Returning fewer picks, or none, is fine.
- Never pick anything about employee pay, workplace complaints or staff reviews.
For each pick return:
- index: the snippet number
- problem: ONE plain sentence, at most 25 words, saying what in the snippet suggests they could use our service. Use only facts in the snippet. It is our inference, so word it as such ("suggests", "may"). No numbers unless they appear in the snippet. No hype.
- quote: 8 to 30 words copied EXACTLY, character for character, from that snippet.

${list}`;
  const out = await callGeminiJson({ prompt, schema: PICK_SCHEMA, timeoutMs: 25000, retries: 1, maxOutputTokens: 1500 });
  return Array.isArray(out?.picks) ? out.picks : [];
}

function scoreSnippet(c, keywords) {
  const t = norm(`${c.title} ${c.text}`);
  let s = 0;
  for (const k of keywords) if (t.includes(k)) s += 2;
  if (TRIGGER_RE.test(`${c.title} ${c.text}`)) s += 2;
  s += { strong: 3, moderate: 1, weak: -2 }[c.strength] ?? 0;
  if (c.pageAge) s += 1;
  return s;
}

/** First 8-30 words of the snippet that mention something useful: used when no LLM quote is available. */
function fallbackQuote(text) {
  const sentences = clean(text).split(/(?<=[.!?])\s+/).filter((s) => s.split(' ').length >= 5);
  const best = sentences.find((s) => TRIGGER_RE.test(s)) || sentences[0] || clean(text);
  return best.split(' ').slice(0, 30).join(' ');
}

/**
 * @param {{company:{companyName:string, website?:string|null, discoverySources?:any[], place?:any}, profile:any}} input
 * @returns {Promise<{items:any[], profiles:{linkedin:string|null,facebook:string|null}, searches:number, method:string}>}
 */
export async function gatherWebEvidence({ company, profile }) {
  const name = company?.companyName;
  const ownHost = hostOf(company?.website || '');
  const location = profile?.geographicFocus || profile?.spec?.geography?.label || '';
  const maxSearches = Number(process.env.WEB_EVIDENCE_SEARCHES) || 5;
  const profiles = { linkedin: null, facebook: null };
  const pool = [];
  const seen = new Set();
  let searches = 0;

  if (process.env.BRAVE_API_KEY && name) {
    const ctx = { run: 0, limit: 10 };
    const queries = buildQueries(name, typeof location === 'string' ? location : '', maxSearches);
    const results = await Promise.all(
      queries.map((q) =>
        braveSearch(q.query, ctx, q.freshness ? { freshness: q.freshness } : {}).then(
          (r) => ({ q, r }),
          (e) => { log('warn', 'Web evidence search failed', { company: name, query: q.query, error: String(e?.message || e).slice(0, 160) }); return { q, r: [] }; },
        ),
      ),
    );
    searches = ctx.run;

    for (const { q, r } of results) {
      for (const hit of r) {
        if (!hit.url || seen.has(hit.url)) continue;
        const host = hostOf(hit.url);
        if (ownHost && host === ownHost) continue;
        const text = clean([hit.description, ...(hit.extraSnippets || [])].filter(Boolean).join(' ')).slice(0, 700);
        const title = clean(hit.title);
        if (!text || !mentionsCompany(`${title} ${text}`, name)) continue;
        seen.add(hit.url);
        const { channel, strength, skip } = classifySource(hit.url, q.channel);
        if (/linkedin\.com\/company\//i.test(hit.url) && !profiles.linkedin && mentionsCompany(`${title} ${text}`, name)) profiles.linkedin = hit.url.split('?')[0];
        if (skip) continue; // employee reviews and the like are never used
        if (/facebook\.com\//i.test(hit.url) && !profiles.facebook) profiles.facebook = hit.url.split('?')[0];
        pool.push({ title, url: hit.url, text, channel, strength, pageAge: hit.pageAge || null });
      }
    }
  }

  // Google Places rating (for local businesses found through Places): real customer feedback, no scraping needed.
  const pl = company?.place;
  if (pl && typeof pl.rating === 'number' && pl.mapsUrl) {
    const text = `Google rating ${pl.rating} from ${pl.ratingCount ?? 0} reviews. ${pl.name || name}${pl.address ? `, ${pl.address}` : ''}.`;
    pool.push({ title: `${pl.name || name} on Google Maps`, url: pl.mapsUrl, text, channel: 'rating', strength: pl.rating < 4.2 ? 'moderate' : 'weak', pageAge: null });
  }

  let items = [];
  let method = 'none';

  const STRENGTH_ORDER = { strong: 0, moderate: 1, weak: 2 };
  pool.sort((a, b) => STRENGTH_ORDER[a.strength] - STRENGTH_ORDER[b.strength]);

  if (pool.length) {
    const keywords = serviceKeywords(profile);
    let picks = [];
    if (process.env.WEB_EVIDENCE_LLM !== 'false' && llmAvailable()) {
      try {
        picks = (await llmPick(profile, name, pool.slice(0, 14))).slice(0, MAX_ITEMS);
        method = 'llm';
      } catch (e) {
        log('warn', 'LLM relevance pick failed, using keyword fallback', { company: name, error: String(e?.message || e).slice(0, 160) });
      }
    }

    const used = new Set();
    for (const p of picks) {
      const c = pool[p.index];
      if (!c || used.has(p.index)) continue;
      used.add(p.index);
      const quote = clean(p.quote);
      const grounded = quote && norm(c.text).includes(norm(quote));
      items.push(makeItem(c, grounded ? quote : fallbackQuote(c.text), grounded ? clean(p.problem) : '', 'llm'));
    }

    if (!items.length) {
      method = method === 'llm' ? 'llm+keyword' : 'keyword';
      const ranked = pool
        .map((c, i) => ({ c, i, s: scoreSnippet(c, keywords) }))
        .sort((a, b) => b.s - a.s);
      // A company that exists is a lead: if nothing scores, still take the best identity-matched mention.
      const chosen = ranked.filter((r) => r.s > 0).slice(0, MAX_ITEMS);
      const final = chosen.length ? chosen : ranked.slice(0, 1);
      items = final.map(({ c, s }) => makeItem(c, fallbackQuote(c.text), '', s > 0 ? 'keyword' : 'identity'));
    }
  }

  // Last resort: what discovery already knew (Google listing, search mentions). Still a real URL and real text.
  if (!items.length && Array.isArray(company?.discoverySources)) {
    for (const src of company.discoverySources) {
      if (!src?.url || !src?.description || src.type === 'website') continue;
      items.push(makeItem({ title: src.title || name, url: src.url, text: clean(src.description).slice(0, 700), channel: 'listing', strength: 'weak', pageAge: null }, fallbackQuote(src.description), '', 'listing'));
      if (items.length >= 2) break;
    }
    if (items.length) method = 'listing';
  }

  if (items.some((i) => i.strength !== 'weak')) items = items.filter((i) => i.strength !== 'weak');

  log(items.length ? 'success' : 'info', items.length ? 'Web evidence collected' : 'No web evidence found', {
    company: name, items: items.length, method, searches, channels: items.map((i) => `${i.channel}:${i.strength}`),
  });

  return { items, profiles, searches, method };
}

function makeItem(c, quote, problem, relevance) {
  return {
    sourceTitle: c.title || 'Web result',
    sourceUrl: c.url,
    content: quote,
    retrievalMethod: c.channel === 'listing' || c.channel === 'rating' ? 'search_snippet' : 'brave_search',
    sourceType: 'web_source',
    channel: c.channel,
    strength: c.strength || 'moderate',
    problem: problem || '',
    fullSnippet: c.text,
    pageAge: c.pageAge,
    date: c.pageAge ? String(c.pageAge).slice(0, 10) : null,
    relevance,
  };
}

/** Re-checks a web evidence item. Never throws. */
export async function verifyWebEvidence(item, companyName) {
  try {
    const url = String(item?.sourceUrl || '');
    const excerpt = clean(item?.excerpt ?? item?.content);
    if (!/^https?:\/\//i.test(url) || !excerpt) return { verified: false, reason: 'missing source or excerpt' };

    const snippet = clean(item?.fullSnippet || excerpt);
    const sourceText = `${item?.sourceTitle || ''} ${snippet}`;
    if (!mentionsCompany(sourceText, companyName)) return { verified: false, reason: 'source does not mention the company' };
    if (item.fullSnippet && !norm(item.fullSnippet).includes(norm(excerpt).slice(0, 60))) {
      return { verified: false, reason: 'excerpt is not part of the retrieved snippet' };
    }

    // Live check where the site lets us in. LinkedIn and some news sites block bots: then the search-engine
    // snippet from this run is the proof, and the method says so.
    if (!/linkedin\.com|facebook\.com|instagram\.com|x\.com|twitter\.com/i.test(url) && item.channel !== 'listing' && item.channel !== 'rating') {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AutoFiverrBot/1.0)', Accept: 'text/html' },
          redirect: 'follow',
          signal: AbortSignal.timeout(VERIFY_FETCH_TIMEOUT_MS),
        });
        if (res.status === 404 || res.status === 410) return { verified: false, reason: `source page is gone (${res.status})` };
        if (res.ok) {
          const html = (await res.text()).slice(0, 400000);
          const $ = cheerio.load(html);
          $('script, style, noscript').remove();
          const pageText = clean($('title').text() + ' ' + $('body').text());
          if (pageText.length > 400 && !mentionsCompany(pageText, companyName)) {
            return { verified: false, reason: 'live page no longer mentions the company' };
          }
          if (pageText.length > 400) return { verified: true, method: 'live_page_match' };
        }
      } catch { /* blocked or slow: fall through to the snippet proof */ }
    }
    return { verified: true, method: 'search_snippet_match' };
  } catch (error) {
    return { verified: false, reason: error?.message || 'verification error' };
  }
}

export default gatherWebEvidence;