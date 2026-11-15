/**
 * Agent 6.5 — Outreach QA (Outreach Quality Gate Agent)
 *
 * Save this file as agents/outreachQualityGateAgent.js (the orchestrator imports that name).
 *
 * ROOT CAUSE of "QA agent did not return a result":
 *   The orchestrator's step() wrapper and processCandidate() read the QA result as
 *       { status: 'success', output: { subject, email: <string>, valid, mistakes, usedEvidence, qa } }
 *   The old QA returned { email, qa, metrics }: no `status`, no `output`. So
 *   `a65.status === "success" && a65.output` was always false and the orchestrator
 *   used its fallback text "QA agent did not return a result".
 *
 * THIS VERSION returns exactly that contract on EVERY path and never throws:
 *   {
 *     status: 'success',
 *     output: {
 *       companyName, website, subject,
 *       email,            // the email BODY as a string (what the orchestrator expects)
 *       body,             // same string, for convenience
 *       valid,            // true when the final email passed review
 *       mistakes,         // [{ rule, detail, type, message }] remaining problems
 *       usedEvidence,
 *       qa: { passed, valid, repaired, repairAttempts, revisions, issues, template }
 *     },
 *     metrics
 *   }
 *
 * Flow: review -> up to 2 repair passes (Gemini, then deterministic) -> if still failing, or the
 * draft is empty, or it is too similar to an earlier email (avoidEmails), fall back to the
 * writer's deterministic template variants and keep the best passing, distinct one.
 */

import { generateText, safeParseJson } from '../agents/geminiClient.js';
import { emitAgentLog } from '../utils/liveLog.js';
import { buildTemplateVariants } from './outreachWriter.js';

const AGENT_NAME = 'OutreachQA';
const LIVE_LABEL = 'Outreach QA';

const MAX_REPAIR_ATTEMPTS = 2;

const MIN_EMAIL_WORDS = 35;
const MAX_EMAIL_WORDS = 150;

const MIN_SENTENCES = 3;
const MAX_SENTENCES = 8;

const DISTINCT_THRESHOLD = 0.5; // shingle overlap at or above this counts as "too similar"

const LEGAL_SUFFIXES = new Set([
  'ltd', 'limited', 'pvt', 'private', 'inc', 'incorporated', 'llc', 'llp', 'corp', 'corporation', 'co', 'company',
  'plc', 'smc', 'gmbh', 'pte', 'fze', 'fzco', 'bv', 'sa', 'ag',
]);

const CERTAINTY_TERMS = [
  'definitely', 'clearly', 'obviously', 'guaranteed', 'certainly', 'without a doubt', 'undeniably',
];

const SIGN_OFF_PATTERNS = [
  /best\s+regards/i,
  /kind\s+regards/i,
  /warm\s+regards/i,
  /\bregards\b/i,
  /\bsincerely\b/i,
  /\bbest\b/i,
  /\bcheers\b/i,
  /thank\s+you/i,
  /\bthanks\b/i,
];

/* Words that never need evidence grounding. */
const ALLOWED_BUSINESS_TERMS = new Set([
  // business correspondence vocabulary
  'contacting', 'technical', 'configuration', 'configurations', 'gathered',
  'data', 'regarding', 'implementation', 'components', 'relevant', 'hello',
  'reaching', 'discuss', 'discussing', 'background', 'observations', 'foundations',
  'standards', 'insights', 'analysis', 'specialize', 'specializing', 'opportunity',

  // conversational connectors
  'hi', 'there', 'hey', 'dear', 'team', 'connect', 'connecting', 'brief',
  'conversation', 'noted', 'website', 'site', 'focuses', 'focused', 'focus',
  'elements', 'available', 'touch', 'looking', 'look', 'explain',
  'regards', 'sincerely', 'thanks', 'thank', 'inquiry', 'message', 'note',
  'question', 'curious', 'wanted', 'reach', 'out', 'introduce',
  'potential', 'possible', 'quick', 'chat', 'call', 'time', 'feedback',

  // scaffolding used by the writer's templates / describeObservation()
  'homepage', 'missing', 'seems', 'footer', 'outdated', 'copyright', 'year', 'pages',
  'reviewed', 'checked', 'product', 'category', 'shows', 'show', 'still', 'reviewing',
  'noticed', 'flagging', 'verify', 'browsing', 'spotted', 'caught', 'eye', 'saw',
  'small', 'thought', 'worth', 'mention', 'mentioning', 'pass', 'point', 'details',
  'easy', 'overlook', 'overlooked', 'minute', 'confirm', 'double', 'check', 'useful',
  'welcome', 'help', 'send', 'sent', 'share', 'shared', 'short', 'pressure', 'usually',
  'approached', 'handled', 'looked', 'typically', 'fixed', 'options', 'lines', 'few',
  'happy', 'context', 'summary', 'work', 'covers', 'falls', 'area', 'also', 'separately',
  'top', 'something', 'finding', 'pointer', 'would', 'like', 'just',

  // scaffolding used by web-source emails (news, LinkedIn, reviews, jobs)
  'came', 'across', 'mention', 'online', 'reading', 'read', 'page', 'says', 'linkedin',
  'customer', 'customers', 'feedback', 'found', 'business', 'listing', 'social', 'hiring',
  'news', 'piece', 'article', 'recently', 'guess', 'often', 'means', 'suggests', 'looks',
  'outside', 'free', 'time', 'busy', 'team', 'easy', 'put', 'kind', 'thing', 'comes', 'simple',
  'reviews', 'jobs', 'posting', 'post', 'role', 'roles', 'saw', 'seen', 'reaching',

  // common English stop words
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any',
  'are', "aren't", 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below',
  'between', 'both', 'but', 'by', 'can', "can't", 'cannot', 'could', "couldn't",
  'did', "didn't", 'do', 'does', "doesn't", 'doing', "don't", 'down', 'during',
  'each', 'for', 'from', 'further', 'had', "hadn't", 'has', "hasn't",
  'have', "haven't", 'having', 'he', 'her', 'here', "here's", 'hers', 'herself',
  'him', 'himself', 'his', 'how', 'i', "i'd", "i'll", "i'm", "i've", 'if', 'in',
  'into', 'is', "isn't", 'it', "it's", 'its', 'itself', "let's", 'me', 'more',
  'most', 'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only',
  'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'over', 'own', 'same', 'she',
  'should', "shouldn't", 'so', 'some', 'such', 'than', 'that', "that's", 'the',
  'their', 'theirs', 'them', 'themselves', 'then', "there's", 'these', 'they',
  'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was',
  'we', "we'd", "we'll", "we're", "we've", 'were', 'what', 'when', 'where', 'which',
  'while', 'who', 'whom', 'why', 'with', "won't", "wouldn't", 'you', "you'd",
  "you'll", "you're", "you've", 'your', 'yours', 'yourself', 'yourselves',
]);

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function log(level, message, meta = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), agent: AGENT_NAME, level, message, ...meta });
  (level === 'error' ? console.error : console.log)(line);
  try {
    emitAgentLog(LIVE_LABEL, level, message, meta);
  } catch {
    /* logging must never break QA */
  }
}

/** Works with generateText(prompt, opts) AND generateText({ prompt, ...opts }). */
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

function toParsed(raw) {
  if (raw && typeof raw === 'object' && (raw.body || raw.subject)) return raw;
  const text = typeof raw === 'string' ? raw : raw?.text ?? raw?.output ?? JSON.stringify(raw ?? '');
  return safeParseJson(text, {}) || {};
}

function hostOf(website) {
  if (!website) return '';
  try {
    return new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).hostname
      .replace(/^www\./i, '')
      .toLowerCase();
  } catch {
    return String(website).toLowerCase();
  }
}

/** Text of one evidence item, whatever shape the pipeline used. */
function evidenceText(ev) {
  if (!ev) return '';
  if (typeof ev === 'string') return ev;
  const test = ev.needCheck?.test;
  return [
    ev.claim, ev.text, ev.quote, ev.label, ev.reason, ev.excerpt, ev.summary, ev.problem, ev.fullSnippet, ev.sourceTitle,
    test?.claim, test?.kind, test?.scope, test?.label,
    ev.details ? JSON.stringify(ev.details) : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function cleanCompanyTokens(companyName) {
  if (!companyName) return new Set();
  const tokens = String(companyName)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/)
    .filter((t) => t && !LEGAL_SUFFIXES.has(t));
  return new Set(tokens);
}

/** Removes the "Hello X team," greeting and the sign-off so they do not count as sentences or words. */
function stripFraming(body) {
  const lines = String(body ?? '').replace(/\r\n/g, '\n').split('\n');
  const kept = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (/^(hello|hi|hey|dear)\b[^.!?]*,?$/i.test(t) && t.split(/\s+/).length <= 8) continue;
    if (SIGN_OFF_PATTERNS.some((p) => p.test(t)) && t.split(/\s+/).length <= 4) continue;
    if (/^\[your name\]$/i.test(t)) continue;
    kept.push(t);
  }
  return kept.join(' ');
}

function splitSentences(text) {
  if (!text) return [];
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function countWords(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function buildEvidenceVocabulary(evidenceList, candidate) {
  const words = new Set();

  const addFromText = (txt) => {
    if (!txt) return;
    String(txt)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2)
      .forEach((t) => words.add(t));
  };

  addFromText(candidate?.companyName);
  addFromText(candidate?.website);
  addFromText(candidate?.industry);
  addFromText(candidate?.serviceText);

  // "freighttank.com" shows up in emails as one token, so allow its compact form too
  const host = hostOf(candidate?.website);
  if (host) {
    words.add(host.replace(/[^a-z0-9]/g, ''));
    host.split('.').forEach((p) => p.length > 2 && words.add(p));
  }

  (Array.isArray(evidenceList) ? evidenceList : []).forEach((ev) => addFromText(evidenceText(ev)));
  return words;
}

/* ---- similarity (used to avoid sending near-identical emails) ---- */

function shingles(text) {
  const w = stripFraming(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const set = new Set();
  for (let i = 0; i <= w.length - 3; i += 1) set.add(w.slice(i, i + 3).join(' '));
  return set;
}

function overlap(a, b) {
  const A = shingles(a);
  const B = shingles(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  return inter / (A.size + B.size - inter);
}

function isDistinct(body, avoidEmails) {
  if (!avoidEmails?.length) return true;
  return avoidEmails.every((e) => overlap(body, e) < DISTINCT_THRESHOLD);
}

/* ------------------------------------------------------------------ */
/* Deterministic review                                                 */
/* ------------------------------------------------------------------ */

export function reviewEmail(email, candidate = {}, evidenceList = []) {
  const issues = [];
  const body = email?.body || (typeof email === 'string' ? email : '');

  const core = stripFraming(body);
  const wordCount = countWords(core);
  const sentences = splitSentences(core);

  // 1. Length
  if (wordCount < MIN_EMAIL_WORDS) {
    issues.push({ type: 'too_short', message: `Email body is too brief (${wordCount} words; minimum is ${MIN_EMAIL_WORDS}).` });
  } else if (wordCount > MAX_EMAIL_WORDS) {
    issues.push({ type: 'too_long', message: `Email body is too long (${wordCount} words; maximum is ${MAX_EMAIL_WORDS}).` });
  }

  if (sentences.length < MIN_SENTENCES) {
    issues.push({ type: 'too_few_sentences', message: `Email has only ${sentences.length} sentence(s); minimum is ${MIN_SENTENCES}.` });
  } else if (sentences.length > MAX_SENTENCES) {
    issues.push({ type: 'too_many_sentences', message: `Email has ${sentences.length} sentences; maximum is ${MAX_SENTENCES}.` });
  }

  // 2. Sign-off
  const hasSignOff = SIGN_OFF_PATTERNS.some((pat) => pat.test(body));
  if (!hasSignOff) {
    issues.push({ type: 'missing_sign_off', message: 'missing final "Best regards" sign-off' });
  }

  // 3. Numbers (ignore B2B, Web3, OAuth2 and years)
  const textWithoutKnown = core
    .replace(/\bB2B\b/gi, '')
    .replace(/\bWeb3\b/gi, '')
    .replace(/\bOAuth2\b/gi, '')
    .replace(/\b20\d{2}\b/g, '');

  const rawDigits = textWithoutKnown.match(/\b\d+(?:\.\d+)?%?\b/g);
  if (rawDigits?.length) {
    const evidenceBlob = JSON.stringify(evidenceList || []) + ' ' + String(candidate?.serviceText || '');
    const unverified = rawDigits.filter((d) => !evidenceBlob.includes(d));
    if (unverified.length) {
      issues.push({
        type: 'unverified_numbers',
        message: `Email includes specific numerical claims not found in verified evidence: ${unverified.join(', ')}`,
      });
    }
  }

  // 3b. Reads like AI: em dashes, exclamation marks, stock phrases
  if (/[\u2014\u2013]/.test(core)) issues.push({ type: 'em_dash', message: 'Email uses a dash as punctuation; use a comma or a full stop.' });
  if (/!/.test(core)) issues.push({ type: 'exclamation', message: 'Email uses an exclamation mark.' });
  if (/\b(hope this (?:email )?finds you|game-?changer|leverage|streamline|seamless(?:ly)?|unlock|elevate|cutting-edge|thrilled|excited to)\b/i.test(core)) {
    issues.push({ type: 'stock_phrase', message: 'Email uses a stock marketing phrase.' });
  }

  // 4. Certainty / overclaim
  for (const term of CERTAINTY_TERMS) {
    if (new RegExp(`\\b${term}\\b`, 'i').test(core)) {
      issues.push({ type: 'overclaim_language', message: `Email uses overly absolute certainty phrase: "${term}"` });
    }
  }

  // 5. Evidence grounding for company-specific sentences
  const companyTokens = cleanCompanyTokens(candidate?.companyName);
  const evidenceVocab = buildEvidenceVocabulary(evidenceList, candidate);

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    const mentionsCompany = [...companyTokens].some((t) => lower.includes(t));
    if (!mentionsCompany) continue;

    const unsupported = [];
    for (const rawWord of sentence.split(/\s+/)) {
      const w = rawWord.toLowerCase().replace(/['’]s$/i, '').replace(/[^\p{L}\p{N}]+/gu, '');
      if (!w || w.length <= 2) continue;
      if (ALLOWED_BUSINESS_TERMS.has(w)) continue;
      if (companyTokens.has(w)) continue;
      if (evidenceVocab.has(w)) continue;
      unsupported.push(w);
    }

    if (unsupported.length > 3) {
      issues.push({
        type: 'weak_evidence_support',
        message: `company-specific sentence has weak evidence support; unsupported terms: ${unsupported.slice(0, 4).join(', ')} (sentence: "${sentence.slice(0, 80)}...")`,
      });
    }
  }

  return {
    passed: issues.length === 0,
    issues,
    metrics: { wordCount, sentenceCount: sentences.length, hasSignOff, issueCount: issues.length },
  };
}

/* ------------------------------------------------------------------ */
/* Deterministic repair                                                 */
/* ------------------------------------------------------------------ */

function repairEmailDeterministically(email, issues) {
  const subject = email?.subject || 'Regarding your website';
  let body = email?.body || '';

  for (const issue of issues) {
    if (issue.type === 'missing_sign_off' && !/\b(?:best|regards|sincerely|thanks)\b/i.test(body)) {
      body = `${body.trim()}\n\nBest regards,\n[Your Name]`;
    }
    if (issue.type === 'em_dash') body = body.replace(/\s*[\u2014\u2013]\s*/g, ', ');
    if (issue.type === 'exclamation') body = body.replace(/!/g, '.');
    if (issue.type === 'overclaim_language') {
      for (const term of CERTAINTY_TERMS) {
        body = body.replace(new RegExp(`\\b${term}\\b`, 'gi'), 'likely');
      }
    }
  }
  return { subject, body };
}

/* ------------------------------------------------------------------ */
/* Input normalisation                                                  */
/* ------------------------------------------------------------------ */

/**
 * Accepts the orchestrator's call:
 *   { profile, companyName, website, subject, email: <string>, usedEvidence, verifiedEvidence, avoidEmails }
 * plus older shapes:
 *   { email: {subject, body}, candidate, evidence }  |  (emailString, candidate, evidence)
 */
function normalizeInput(a, b, c) {
  const isObj = (v) => v && typeof v === 'object';

  let src;
  if (typeof a === 'string') {
    src = { email: a, candidate: isObj(b) ? b : {}, evidence: Array.isArray(c) ? c : [] };
  } else if (
    isObj(a) &&
    ('body' in a || 'subject' in a) &&
    !('email' in a) && !('verifiedEvidence' in a) && !('evidence' in a) && !('candidate' in a)
  ) {
    src = { email: a, candidate: isObj(b) ? b : {}, evidence: Array.isArray(c) ? c : [] };
  } else {
    src = isObj(a) ? a : {};
  }

  const emailVal = src.email ?? src.outreach ?? src.draft ?? src.output ?? null;
  const emailObj = isObj(emailVal) ? emailVal : {};

  let subject = src.subject;
  let body = '';
  if (typeof emailVal === 'string') body = emailVal;
  else if (isObj(emailVal)) {
    body = emailVal.body ?? emailVal.email ?? '';
    subject = subject || emailVal.subject;
  } else if (typeof src.body === 'string') body = src.body;

  const cand = isObj(src.candidate) ? src.candidate : {};
  const candidate = {
    ...cand,
    companyName: cand.companyName ?? src.companyName ?? emailObj.companyName,
    website: cand.website ?? src.website ?? emailObj.website,
    industry: cand.industry ?? src.industry ?? src.profile?.industry,
    serviceText: src.profile?.clientServiceSummary || cand.serviceText || '',
  };

  const evidence =
    [src.verifiedEvidence, src.evidence, emailObj.usedEvidence].find((x) => Array.isArray(x) && x.length) || [];

  const usedEvidence = Array.isArray(src.usedEvidence) && src.usedEvidence.length ? src.usedEvidence : [];

  return {
    subject: String(subject || '').trim(),
    body: String(body ?? '').replace(/\r\n/g, '\n').trim(),
    candidate,
    profile: isObj(src.profile) ? src.profile : {},
    evidence,
    usedEvidence,
    avoidEmails: Array.isArray(src.avoidEmails) ? src.avoidEmails.filter((e) => typeof e === 'string' && e) : [],
    maxAttempts: Number.isFinite(src.maxAttempts) ? src.maxAttempts : MAX_REPAIR_ATTEMPTS,
  };
}

/* ------------------------------------------------------------------ */
/* Result builder: ONE shape, every path                                */
/* ------------------------------------------------------------------ */

function makeResult({
  candidate = {}, subject = '', body = '', valid = false, issues = [], usedEvidence = [],
  repairAttempts = 0, repaired = false, template = false, metrics = {},
}) {
  const mistakes = issues.map((i) => ({
    rule: i.type || i.rule || 'issue',
    detail: i.message || i.detail || '',
    type: i.type || i.rule || 'issue',
    message: i.message || i.detail || '',
  }));

  return {
    status: 'success', // QA never discards a lead; `valid` / qa.passed carry the verdict
    output: {
      companyName: candidate.companyName,
      website: candidate.website,
      subject,
      email: body, // the orchestrator reads the email body from `email` (a string)
      body,
      valid,
      mistakes,
      usedEvidence,
      qa: {
        passed: valid,
        valid,
        repaired,
        repairAttempts,
        revisions: repairAttempts,
        issues: mistakes,
        template,
      },
    },
    metrics: { ...metrics, repairAttempts, repaired, template, remainingMistakes: mistakes.length },
  };
}

/* ------------------------------------------------------------------ */
/* QA pipeline                                                          */
/* ------------------------------------------------------------------ */

async function qaPipeline(input, startTime) {
  const { candidate, profile, evidence, usedEvidence, avoidEmails, maxAttempts } = input;

  log('info', `Starting Outreach QA check for ${candidate.companyName || 'candidate'}`);

  let best = { subject: input.subject || 'Quick note about your website', body: input.body };
  const hasDraft = Boolean(best.body.trim());

  let bestReview = hasDraft
    ? reviewEmail(best, candidate, evidence)
    : {
        passed: false,
        issues: [{ type: 'empty_email', message: 'No email draft was provided.' }],
        metrics: { wordCount: 0, sentenceCount: 0, hasSignOff: false, issueCount: 1 },
      };

  let repairAttempts = 0;
  let repaired = false;
  let template = false;
  let finalUsedEvidence = usedEvidence;

  const distinct = (email) => isDistinct(email.body, avoidEmails);

  // Fast path
  if (bestReview.passed && distinct(best)) {
    log('success', 'Email passed QA review on first check', { metrics: bestReview.metrics });
    return makeResult({
      candidate,
      subject: best.subject,
      body: best.body,
      valid: true,
      usedEvidence: finalUsedEvidence.length ? finalUsedEvidence : evidence.slice(0, 2),
      metrics: { ...bestReview.metrics, durationMs: Date.now() - startTime },
    });
  }

  if (!bestReview.passed) {
    log('warn', `Email needs attention (${bestReview.issues.length} issue(s) detected)`, {
      issues: bestReview.issues.map((i) => i.message),
    });
  }

  // Repair passes (only when there is a draft to repair)
  let current = { ...best };
  while (hasDraft && repairAttempts < maxAttempts && !bestReview.passed) {
    repairAttempts += 1;
    log('info', `Attempting email repair pass ${repairAttempts}/${maxAttempts}`);

    let repairedDraft = null;

    if (process.env.GEMINI_API_KEY) {
      try {
        const repairPrompt = `You are a B2B outreach quality-assurance editor.
Fix ONLY the listed issues. Plain spoken, no em dashes, no exclamation marks. Keep the original wording, tone and structure wherever it is already fine.

ISSUES:
${bestReview.issues.map((i) => `- ${i.message}`).join('\n')}

Target company: ${candidate.companyName || 'Target Company'}
Verified evidence facts (the only company facts allowed):
${evidence.map((e) => `- ${evidenceText(e)}`).join('\n')}

Original subject: ${current.subject}
Original body:
${current.body}

Requirements:
1. Keep the greeting line and end with exactly:
Best regards,
[Your Name]
2. 3 to 5 sentences, 55 to 95 words (not counting greeting and sign-off).
3. No unverified facts, no numbers, no fake statistics, no certainty words.
4. Return ONLY valid JSON: {"subject": "...", "body": "..."}`;

        const raw = await callLlm(repairPrompt, { json: true, maxOutputTokens: 1000, temperature: 0.4 });
        const parsed = toParsed(raw);
        if (parsed?.body) {
          repairedDraft = {
            subject: parsed.subject || current.subject,
            body: String(parsed.body).replace(/\r\n/g, '\n').trim(),
          };
        }
      } catch (err) {
        log('warn', `LLM repair pass failed, using deterministic repair: ${err?.message}`);
      }
    }

    if (!repairedDraft) repairedDraft = repairEmailDeterministically(current, bestReview.issues);

    const newReview = reviewEmail(repairedDraft, candidate, evidence);
    if (newReview.issues.length <= bestReview.issues.length) {
      best = repairedDraft;
      bestReview = newReview;
      current = repairedDraft;
      repaired = true;
    }

    if (newReview.passed) {
      log('success', `Email successfully repaired on attempt ${repairAttempts}`);
      break;
    }
  }

  // Template fallback: draft missing, still failing, or too similar to an earlier email
  if (!bestReview.passed || !distinct(best)) {
    const variants = buildTemplateVariants({
      profile,
      companyName: candidate.companyName,
      website: candidate.website,
      verifiedEvidence: evidence,
    });

    const score = (review, email) => review.issues.length + (distinct(email) ? 0 : 0.5);
    let bestScore = hasDraft ? score(bestReview, best) : Number.POSITIVE_INFINITY;

    for (const v of variants) {
      const email = { subject: v.subject, body: v.body };
      const review = reviewEmail(email, candidate, evidence);
      const s = score(review, email);
      if (s < bestScore) {
        best = email;
        bestReview = review;
        bestScore = s;
        template = true;
        finalUsedEvidence = v.usedEvidence || finalUsedEvidence;
        if (s === 0) break;
      }
    }

    if (template) {
      log(bestReview.passed ? 'success' : 'warn', 'Using deterministic template email after QA', {
        passed: bestReview.passed,
        issues: bestReview.issues.map((i) => i.message),
      });
    }
  }

  const durationMs = Date.now() - startTime;
  if (bestReview.passed) {
    log('success', 'Outreach QA completed: email passed', { durationMs, repairAttempts, template });
  } else {
    log('warn', `Outreach QA finished with ${bestReview.issues.length} notice(s)`, {
      durationMs,
      issues: bestReview.issues.map((i) => i.message),
    });
  }

  return makeResult({
    candidate,
    subject: best.subject,
    body: best.body,
    valid: bestReview.passed,
    issues: bestReview.issues,
    usedEvidence: finalUsedEvidence.length ? finalUsedEvidence : evidence.slice(0, 2),
    repairAttempts,
    repaired: repaired || template,
    template,
    metrics: { ...bestReview.metrics, durationMs },
  });
}

/* ------------------------------------------------------------------ */
/* Main (never throws, never returns undefined)                         */
/* ------------------------------------------------------------------ */

export async function runOutreachQa(a, b, c) {
  const startTime = Date.now();

  let input;
  try {
    input = normalizeInput(a, b, c);
  } catch (err) {
    log('error', 'QA could not read its input', { error: err?.message });
    return makeResult({
      issues: [{ type: 'qa_input_error', message: `QA could not read its input: ${err?.message}` }],
      metrics: { durationMs: Date.now() - startTime },
    });
  }

  try {
    return await qaPipeline(input, startTime);
  } catch (err) {
    log('error', 'Outreach QA crashed; returning the original email with the real error', {
      error: err?.message,
      stack: err?.stack,
    });
    return makeResult({
      candidate: input.candidate,
      subject: input.subject,
      body: input.body,
      valid: false,
      issues: [{ type: 'qa_error', message: `QA internal error: ${err?.message}` }],
      usedEvidence: input.usedEvidence,
      metrics: { durationMs: Date.now() - startTime, error: err?.message },
    });
  }
}

export const __internals = {
  cleanCompanyTokens,
  splitSentences,
  countWords,
  stripFraming,
  evidenceText,
  buildEvidenceVocabulary,
  normalizeInput,
  overlap,
  isDistinct,
  ALLOWED_BUSINESS_TERMS,
  CERTAINTY_TERMS,
  SIGN_OFF_PATTERNS,
};

export default runOutreachQa;