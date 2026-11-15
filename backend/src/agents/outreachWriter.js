/**
 * @file outreachWriter.js
 * Agent 6 — Outreach Writer
 *
 * Writes a short consultative email grounded ONLY in verified need findings.
 *
 *  - LLM draft first (strict prompt that mirrors the QA rules)
 *  - deterministic template when the LLM is unavailable, returns junk, or leaves placeholders
 *  - the only bracketed text ever allowed is the "[Your Name]" sign-off
 *
 * Changes vs. the old version:
 *  - callLlm() works with BOTH generateText(prompt, opts) and generateText({ prompt, ...opts }),
 *    so a signature mismatch can no longer silently push every lead onto the template.
 *  - the template now uses BOTH observations, and has far more wording variety (5 structures).
 *  - every fallback to the template logs the REAL reason.
 */

import { generateText, safeParseJson } from '../agents/geminiClient.js';
import { emitAgentLog } from '../utils/liveLog.js';
import { isCopyrightTest } from './needCheckEngine.js';

const AGENT_NAME = 'OutreachWriter';
const LIVE_LABEL = 'Outreach Writer';

const SIGNOFF = 'Best regards,\n[Your Name]';
const MAX_OBSERVATIONS = 2;

/* ------------------------------------------------------------------ */
/* Wording pools (rotated per company so emails do not read alike)     */
/* ------------------------------------------------------------------ */

const SUBJECTS = [
  (name) => `Quick note about ${name}'s website`,
  (name) => `A small website observation for ${name}`,
  (name, host) => `Something I noticed on ${host}`,
  (name) => `A thought on ${name}'s site`,
  (name, host) => `Small finding on ${host}`,
  (name) => `${name}: a quick website pointer`,
];

const OPENERS = [
  (host, obs) => `While reviewing ${host}, I noticed ${obs}.`,
  (host, obs) => `On a quick look at ${host}, it looks like ${obs}.`,
  (host, obs) => `I was browsing ${host} and saw that ${obs}.`,
  (host, obs) => `Looking through ${host}, I spotted that ${obs}.`,
  (host, obs) => `Something caught my eye on ${host}: ${obs}.`,
];

const SECOND_OBS = [
  (obs) => `I also noticed that ${obs}.`,
  (obs) => `Separately, ${obs}.`,
  (obs) => `On top of that, ${obs}.`,
];

const FLAGS = [
  'It is a quick thing to verify, and I thought it was worth flagging.',
  'It may be easy to double-check, so I wanted to mention it.',
  'This is simple to confirm, and I figured it was worth a mention.',
  'It should only take a minute to check, so I thought I would pass it on.',
  'Small details like this are easy to overlook, so I wanted to point it out.',
];

const CTAS = [
  'Would it be useful if I sent over a short, no-pressure note on how this could be handled?',
  'Would it help if I shared a brief, no-pressure note on how this is usually approached?',
  'Would you like me to send a short note on how this could be looked at?',
  'Happy to send a few lines on how this is typically fixed, if that would help.',
  'If it is useful, I can share a short note on options for this. Would that be welcome?',
];

const INTROS = [
  "Here's a quick summary of what we do:",
  'In short, our work covers:',
  'A quick word on what we do:',
  'For context, we focus on:',
  'About us in one line:',
];

/* Sentence orders. Each returns the paragraph parts in a different arrangement. */
const STRUCTURES = [
  (p) => [p.obs, p.flag, p.who, p.cta],
  (p) => [p.obs, p.who, p.flag, p.cta],
  (p) => [p.obs, p.flag, p.cta, p.who],
  (p) => [p.obs, p.who, p.cta],
  (p) => [p.obs, p.flag, p.who, p.cta],
];

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function seedOf(name) {
  let h = 7;
  for (const ch of String(name ?? '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

function log(level, message, meta = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), agent: AGENT_NAME, level, message, ...meta });
  (level === 'error' ? console.error : console.log)(line);
  emitAgentLog(LIVE_LABEL, level, message, meta);
}

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

function hostOf(website) {
  try {
    return new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).hostname.replace(/^www\./i, '');
  } catch {
    return clean(website);
  }
}

const LEGAL_SUFFIX_RE =
  /[,\s]+(?:ltd|limited|pvt|private|inc|incorporated|llc|llp|corp|corporation|co|company|plc|gmbh|pte|bv|sa|ag)\.?$/i;

/** "Acme Plumbing LLC" -> "Acme Plumbing" for greetings and subjects. */
export function displayName(name) {
  let trimmed = clean(name);
  for (let i = 0; i < 3; i += 1) {
    const next = trimmed.replace(LEGAL_SUFFIX_RE, '').trim();
    if (next === trimmed) break;
    trimmed = next;
  }
  return trimmed || clean(name);
}

/**
 * Calls Gemini regardless of which generateText signature geminiClient.js exposes.
 * Tries generateText(prompt, opts) first, then generateText({ prompt, ...opts }).
 * Returns the raw result (string or object). Throws only if both forms fail.
 */
async function callLlm(prompt, opts = {}) {
  const errors = [];

  try {
    const res = await generateText(prompt, opts);
    if (res !== undefined && res !== null && res !== '') return res;
    errors.push('positional form returned empty');
  } catch (e) {
    errors.push(`positional form: ${e?.message}`);
    // A real Gemini failure already used its retries; trying the other call form would only double the wait.
    if (/Gemini failed|GEMINI_API_KEY/i.test(String(e?.message))) throw new Error(`generateText failed (${errors.join(' | ')})`);
  }

  try {
    const res = await generateText({ prompt, ...opts });
    if (res !== undefined && res !== null && res !== '') return res;
    errors.push('object form returned empty');
  } catch (e) {
    errors.push(`object form: ${e?.message}`);
  }

  throw new Error(`generateText failed (${errors.join(' | ')})`);
}

/** Pulls the text out of whatever generateText returned. */
function asText(raw) {
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object') {
    if (typeof raw.text === 'string') return raw.text;
    if (typeof raw.output === 'string') return raw.output;
    return JSON.stringify(raw);
  }
  return String(raw ?? '');
}

/** Returns a parsed object whatever shape came back. */
function toParsed(raw) {
  if (raw && typeof raw === 'object' && (raw.body || raw.subject || raw.email)) return raw;
  return safeParseJson(asText(raw), {}) || {};
}

/* ------------------------------------------------------------------ */
/* Observations                                                         */
/* ------------------------------------------------------------------ */

const SCOPE_TEXT = {
  home: 'the homepage',
  site: 'the pages I reviewed',
  product_pages: 'the product pages I checked',
  category_pages: 'the category pages I checked',
};

/** One plain, factual clause per verified need finding. */
export function describeObservation(evidence) {
  const test = evidence?.needCheck?.test;
  if (!test) return null;

  const where = SCOPE_TEXT[test.scope] || 'the site';
  const plural = ['site', 'product_pages', 'category_pages'].includes(test.scope);

  if (test.kind === 'absent') return `${where} ${plural ? 'are' : 'is'} missing ${test.claim}`;
  if (isCopyrightTest(test)) return 'the footer still shows an outdated copyright year';
  return `${where} ${plural ? 'show' : 'shows'} ${test.claim}`;
}

/** Service text made safe to quote: no second person, no trailing punctuation, bounded length. */
function serviceSnippet(service, maxWords) {
  let text = clean(service)
    .replace(/\b(?:you|your|yours|you're|you've)\b/gi, 'clients')
    .replace(/[.!\s]+$/g, '');
  return cutAtBoundary(text, maxWords);
}

const DANGLING = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'with', 'that', 'which', 'their', 'its', 'our', 'by', 'on', 'at', 'from', 'as', 'is', 'are', 'help', 'helps', 'reduce', 'reduces', 'improve', 'improves', 'into', 'than']);

/** Shortens text to about `max` words without leaving a sentence hanging ("... help companies reduce"). */
function cutAtBoundary(text, max) {
  const words = clean(text).split(' ');
  if (words.length <= max) return words.join(' ');
  const head = words.slice(0, max);
  // Prefer the last natural break (comma, "that", "which", "and") inside the limit, if it leaves enough words.
  for (let i = head.length - 1; i >= Math.min(4, head.length - 1); i -= 1) {
    const w = head[i].toLowerCase();
    if (/,$/.test(head[i - 1] ?? '') || w === 'that' || w === 'which' || w === 'and') {
      return head.slice(0, i).join(' ').replace(/[,;:\s]+$/, '');
    }
  }
  while (head.length > 3 && DANGLING.has(head[head.length - 1].toLowerCase().replace(/[^a-z]/g, ''))) head.pop();
  return head.join(' ').replace(/[,;:\s]+$/, '');
}

/* ------------------------------------------------------------------ */
/* Web-source emails (news, LinkedIn, reviews, jobs ...)                */
/* ------------------------------------------------------------------ */

const isWeb = (e) => e?.sourceType === 'web_source';

const WEB_OPENERS = {
  news: (n, q) => `I came across a mention of ${n} online: "${q}"`,
  linkedin: (n, q) => `I was reading ${possessive(n)} LinkedIn page, which says "${q}"`,
  reviews: (n, q) => `I read some customer feedback about ${n}: "${q}"`,
  jobs: (n, q) => `I saw that ${n} has been hiring: "${q}"`,
  social: (n, q) => `I came across ${possessive(n)} social page: "${q}"`,
  listing: (n, q) => `I found ${possessive(n)} business listing: "${q}"`,
  directory: (n, q) => `I found ${n}'s company profile: "${q}"`,
  rating: (n, q) => `I saw ${n}'s Google listing: "${q}"`,
  linkedin_post: (n, q) => `I saw a LinkedIn post about ${n}: "${q}"`,
  web: (n, q) => `I came across this about ${n}: "${q}"`,
};

const WEB_SUBJECTS = [
  (n) => `A thought for ${n}`,
  (n) => `Saw ${n} online`,
  (n) => `Quick idea for ${n}`,
  (n) => `About ${n}`,
];

const GENERIC_PROBLEMS = [
  'It made me think this is an area where a bit of outside help could free up your team.',
  'That looks like the kind of work that is easy to put off when a team is busy.',
  'My guess is this takes more of your time than it should.',
];

const SERVICE_LEADS = [
  'That is the kind of thing we help with:',
  'This is where we come in:',
  'What we do is simple:',
  'Here is how we help:',
];

function trimWords(text, max) {
  const t = clean(text).replace(/["“”]/g, '');
  const cut = cutAtBoundary(t, max);
  return `${cut.replace(/[.,;:\s]+$/, '')}${cut.length < t.replace(/[.,;:\s]+$/, '').length ? '...' : ''}`;
}

const possessive = (n) => (/s$/i.test(n) ? `${n}'` : `${n}'s`);

function lowerFirst(t) {
  return /^[A-Z][a-z]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t;
}

function sentenceCase(text) {
  const t = clean(text);
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

function webFactsForPrompt(profile, verifiedEvidence, website) {
  return verifiedEvidence
    .slice(0, 3)
    .map((e, idx) => {
      if (isWeb(e)) {
        const label = { news: 'a news or web mention', linkedin: 'their LinkedIn page', reviews: 'customer reviews', jobs: 'a job posting', social: 'their social media page', listing: 'a business listing', directory: 'a company directory profile', rating: 'their Google rating', linkedin_post: 'a LinkedIn post' }[e.channel] || 'a web page';
        return `[${idx + 1}] Source: ${label} (${clean(e.sourceTitle)}). Text: "${clean(e.excerpt)}"${e.problem ? `\n    Possible issue this points to: ${clean(e.problem)}` : ''}`;
      }
      return `[${idx + 1}] Source: their own website${website ? ` (${hostOf(website)})` : ''}. Finding: ${describeObservation(e) || clean(e.excerpt)}`;
    })
    .join('\n');
}

function buildWebPrompt(profile, companyName, website, verifiedEvidence) {
  const seed = seedOf(companyName);
  const angle = [
    'Open with where you found them, then the specific thing you read.',
    'Open with the specific thing you read, and say where it was.',
    'Open with a short, direct sentence about what caught your attention.',
  ][seed % 3];
  const hostLine = website ? ` (${hostOf(website)})` : ' (no website found, so do not mention a website)';

  return `Write a short cold email from a small service provider to ${companyName}${hostLine}. It has to read like one person wrote it to one business owner.

OUR SERVICE (use only these words for what we do; never add claims):
${clean(profile.clientServiceSummary)}

FACTS ABOUT THEM (the only company facts you may use):
${webFactsForPrompt(profile, verifiedEvidence, website)}

STRUCTURE:
1. Start with exactly "Hello ${displayName(companyName)} team," on its own line.
2. Then 4 to 6 sentences, 70 to 115 words in total.
3. ${angle} Mention the source in plain words (for example "a news piece", "your LinkedIn page", "customer reviews"). Put it in your own words; never copy 8 or more words in a row.
4. Next, say what problem or gap that fact probably points to. Be tentative ("my guess is", "that often means", "it looks like"). Use only what the facts support.
5. Then say how our service deals with that exact problem, using only the service text. Be concrete: tie it to what you just said, do not list features.
6. Finish with one easy, low-pressure question.
7. End the body with exactly:
Best regards,
[Your Name]

STYLE (an automatic reviewer and the reader both punish breaking these):
- Plain spoken. Short sentences mixed with a longer one. Contractions are fine.
- No em dashes. No exclamation marks. No emojis. No bullet points.
- Never write: "I hope this finds you well", "I came across your impressive", "game-changer", "leverage", "streamline", "seamless", "unlock", "elevate", "cutting-edge", "tailored", "thrilled", "excited to", "in today's".
- No "not just X but Y" constructions. No lists of three things.
- No praise or hype (impressive, amazing, great, love, innovative, rapid, massive).
- No digits unless they appear in the facts above. No guarantees, no promised results.
- Do not say they "struggle" or "need" us. Do not invent customers, products, funding, tools or people.
- No brackets or placeholders except the sign-off.

Return JSON only:
{"subject":"specific subject, under 7 words, no clickbait","body":"the full email text","usedEvidence":[1]}`;
}

export function buildWebTemplateVariants(input) {
  const { profile = {}, companyName, website } = input ?? {};
  const evidence = input?.verifiedEvidence ?? [];
  const web = evidence.filter(isWeb);
  if (!companyName || !web.length) return [];

  const name = displayName(companyName);
  const seed = seedOf(companyName);
  const service = clean(profile.clientServiceSummary);
  const siteObs = evidence.find((e) => e?.needCheck?.test);
  const siteLine = siteObs && website ? `On ${hostOf(website)}, I also noticed that ${describeObservation(siteObs)}.` : '';

  const variants = [];
  const order = [...web];
  for (const item of order) {
    const open = WEB_OPENERS[item.channel] || WEB_OPENERS.web;
    for (const quoteWords of [18, 12]) {
      const quote = trimWords(item.excerpt, quoteWords);
      const problem = item.problem ? sentenceCase(item.problem) : GENERIC_PROBLEMS[(seed >>> 3) % GENERIC_PROBLEMS.length];
      const lead = SERVICE_LEADS[(seed >>> 5) % SERVICE_LEADS.length];
      const cta = CTAS[(seed >>> 7) % CTAS.length];
      for (const words of [30, 14, 0]) {
        const who = service && words ? `${lead} ${lowerFirst(serviceSnippet(service, words))}.` : "I'm reaching out because this falls in the area we work on.";
        const paragraph = [`${open(name, quote)}${quote.endsWith('...') ? '' : '.'}`, problem, siteLine, who, cta].filter(Boolean).join(' ');
        variants.push({
          subject: WEB_SUBJECTS[(seed >>> 1) % WEB_SUBJECTS.length](name),
          body: [`Hello ${name} team,`, '', paragraph, '', SIGNOFF].join('\n'),
          usedEvidence: siteLine ? [item, siteObs] : [item],
        });
      }
    }
  }
  return variants;
}

/* ------------------------------------------------------------------ */
/* Deterministic template variants                                      */
/* ------------------------------------------------------------------ */

/**
 * Deterministic emails, richest first. The orchestrator / QA picks the first one that passes.
 */
export function buildTemplateVariants(input) {
  if ((input?.verifiedEvidence ?? []).some(isWeb)) return buildWebTemplateVariants(input);
  const { profile = {}, companyName, website } = input ?? {};
  const evidence = (input?.verifiedEvidence ?? []).filter((e) => e?.needCheck?.test);
  if (!companyName || !evidence.length) return [];

  const host = hostOf(website);
  const used = evidence.slice(0, MAX_OBSERVATIONS);
  const observations = used.map(describeObservation).filter(Boolean);
  if (!observations.length) return [];

  const shortName = displayName(companyName);
  const seed = seedOf(companyName);

  const pick = (len, shift) => (seed >>> shift) % len;
  const chosen = {
    si: pick(SUBJECTS.length, 0),
    oi: pick(OPENERS.length, 2),
    fi: pick(FLAGS.length, 4),
    ci: pick(CTAS.length, 6),
    ii: pick(INTROS.length, 8),
    so: pick(SECOND_OBS.length, 10),
    st: pick(STRUCTURES.length, 12),
  };
  const base = { si: 0, oi: 0, fi: 0, ci: 0, ii: 0, so: 0, st: 0 };

  const build = (idx, clientText) => {
    let obs = OPENERS[idx.oi](host, observations[0]);
    if (observations[1]) obs = `${obs} ${SECOND_OBS[idx.so](observations[1])}`;

    const parts = {
      obs,
      flag: FLAGS[idx.fi],
      cta: CTAS[idx.ci],
      who: clientText
        ? `${INTROS[idx.ii]} ${clientText}.`
        : "I'm reaching out because this falls in the area we work on.",
    };

    const paragraph = STRUCTURES[idx.st](parts).join(' ');
    return {
      subject: SUBJECTS[idx.si](shortName, host),
      body: [`Hello ${shortName} team,`, '', paragraph, '', SIGNOFF].join('\n'),
      usedEvidence: used,
    };
  };

  const service = clean(profile.clientServiceSummary);
  const variants = [];
  for (const idx of [chosen, base]) {
    if (service) {
      variants.push(build(idx, serviceSnippet(service, 30)));
      variants.push(build(idx, serviceSnippet(service, 12)));
      variants.push(build(idx, serviceSnippet(service, 7)));
    }
    variants.push(build(idx, ''));
  }
  return variants;
}

/* ------------------------------------------------------------------ */
/* LLM prompt                                                           */
/* ------------------------------------------------------------------ */

const ANGLES = [
  'Lead with the specific page where the finding was seen.',
  'Lead with the finding itself, stated plainly.',
  'Lead with what you noticed while browsing, as a casual observation.',
];

function buildPrompt(profile, companyName, website, verifiedEvidence) {
  const seed = seedOf(companyName);
  const observations = verifiedEvidence
    .slice(0, MAX_OBSERVATIONS)
    .map((e, idx) => `[${idx + 1}] On ${hostOf(website)}, ${describeObservation(e) || clean(e.excerpt)}`)
    .join('\n');

  const opener = ['While reviewing', 'On a quick look at', 'Looking through'][seed % 3];
  const angle = ANGLES[(seed >>> 3) % ANGLES.length];

  return `Write a short, consultative cold email from a service provider to ${companyName} (${hostOf(website)}).

OUR SERVICE (describe it using ONLY these words, never add claims):
${clean(profile.clientServiceSummary)}

VERIFIED OBSERVATIONS (the only company facts you may use):
${observations}

RULES (an automatic reviewer rejects the email if any is broken):
1. Start with exactly "Hello ${displayName(companyName)} team," on its own line.
2. Body: 3 to 5 sentences after the greeting, 55-95 words total.
3. Sentence 1: state ONE observation above in your own words. Do not copy 8+ words in a row. Open it with "${opener}". ${angle}
4. Sentence 2: one short sentence saying what we do, using only the service text above.
5. Last sentence: one low-pressure question, e.g. "Would it be useful if I sent a short note on this?".
6. NO numbers or digits anywhere. NO brackets or placeholders except the sign-off.
7. NO praise or hype words (impressive, interesting, great, love, amazing, innovative, rapid, massive).
8. NEVER say or imply that they struggle, have problems, bottlenecks, pain points, or "need" our service. Never promise results.
9. Do not mention anything about the company that is not in the observations (no products, customers, growth, funding, technology).
   Do NOT add detail to the observation: no icons, buttons, links, sections, designs or pages that are not named in it.
   Never write "you do not have" or "you lack": say it the way the observation does (e.g. "the homepage is missing ...").
10. End the body with exactly:
Best regards,
[Your Name]

Return JSON only:
{"subject":"short subject under 7 words","body":"the full email text","usedEvidence":[1]}`;
}

function cleanDraft(parsed, companyName) {
  let subject = clean(parsed?.subject);
  let body = String(parsed?.body ?? parsed?.email ?? '').replace(/\r\n/g, '\n').trim();

  subject = subject.replace(/\[Company Name\]/gi, companyName).replace(/\[Recipient Name\]/gi, 'team');
  body = body.replace(/\[Company Name\]/gi, companyName).replace(/\[Recipient Name\]/gi, 'there');

  if (!/best regards/i.test(body)) body = `${body}\n\n${SIGNOFF}`;

  const stripped = `${subject} ${body}`.replace(/\[Your Name\]/g, '');
  const leftoverPlaceholder = /\[[^\]]*\]|\{\{|\}\}/.test(stripped);

  return { subject, body, ok: Boolean(subject && body) && !leftoverPlaceholder };
}

/* ------------------------------------------------------------------ */
/* Main                                                                 */
/* ------------------------------------------------------------------ */

export async function runOutreachWriter(input) {
  const startedAt = Date.now();
  const { profile = {}, companyName, website, verifiedEvidence = [] } = input ?? {};

  if (!verifiedEvidence.length) {
    return { status: 'discarded', output: null, reason: 'No verified evidence available to personalize outreach.' };
  }

  if (!clean(profile.clientServiceSummary)) {
    return {
      status: 'failed',
      output: null,
      reason: 'clientServiceSummary is missing: cannot describe the offered service.',
    };
  }

  log('info', 'Writing tailored outreach grounded in verified need evidence', { company: companyName });

  const useTemplate = (why) => {
    const [first] = buildTemplateVariants({ profile, companyName, website, verifiedEvidence });
    if (!first) return null;
    log('warn', 'Using deterministic template email', { company: companyName, why });
    return { ...first, source: 'template' };
  };

  let draft = null;

  if (process.env.GEMINI_API_KEY) {
    try {
      const hasWeb = verifiedEvidence.some(isWeb);
      const raw = await callLlm((hasWeb ? buildWebPrompt : buildPrompt)(profile, companyName, website, verifiedEvidence), {
        json: true,
        temperature: 0.9,
      });
      const parsed = toParsed(raw);
      const cleaned = cleanDraft(parsed, companyName);

      if (cleaned.ok) {
        const idx = (Array.isArray(parsed.usedEvidence) ? parsed.usedEvidence : [1])
          .map((n) => verifiedEvidence[Number(n) - 1])
          .filter(Boolean);
        draft = {
          subject: cleaned.subject,
          body: cleaned.body,
          usedEvidence: idx.length ? idx : [verifiedEvidence[0]],
          source: 'llm',
        };
      } else {
        draft = useTemplate('llm draft empty or contained placeholders');
      }
    } catch (error) {
      log('error', 'LLM outreach failed', { error: error?.message });
      draft = useTemplate(`llm error: ${error?.message}`);
    }
  } else {
    draft = useTemplate('GEMINI_API_KEY missing');
  }

  if (!draft) {
    return { status: 'failed', output: null, reason: 'Could not build an outreach email from the verified evidence.' };
  }

  log('success', 'Outreach drafted successfully', {
    company: companyName,
    subject: draft.subject,
    source: draft.source,
  });

  return {
    status: 'success',
    output: { companyName, website, ...draft },
    metrics: { source: draft.source, durationMs: Date.now() - startedAt },
  };
}

export default runOutreachWriter;