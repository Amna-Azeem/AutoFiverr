/**
 * @file emailFormat.js
 * Pure helpers that keep every outreach email in the same readable layout and sign it with the
 * real sender, whichever agent (LLM draft, LLM repair, template) produced the text.
 *
 *   Hello Acme team,
 *
 *   <paragraph 1>
 *
 *   <paragraph 2>
 *
 *   Best regards,
 *   <sender name>
 *   <sender company>
 */

const PLACEHOLDER = '[Your Name]';
const GREETING_RE = /^\s*((?:hello|hi|hey|dear)\b[^,\n]{0,80},)\s*/i;
const SIGNOFF_RE = /(?:^|\s)(best regards|kind regards|warm regards|regards|sincerely|best|thanks|thank you|cheers)\s*,?\s*([\s\S]*)$/i;

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

function splitSentences(text) {
  return String(text).split(/(?<=[.!?])\s+(?=[A-Z"'(])/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Re-lay an email out as greeting / paragraphs / sign-off, even when a model returned it as one flat line.
 * The sign-off name is kept as the "[Your Name]" placeholder (or whatever the text already had).
 */
export function formatEmailLayout(email) {
  let text = String(email ?? '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';

  // sign-off (always "Best regards," + name on the next line)
  let sigName = PLACEHOLDER;
  const signoff = text.match(SIGNOFF_RE);
  if (signoff && signoff.index !== undefined) {
    const rest = clean(signoff[2]);
    if (rest) sigName = rest;
    text = text.slice(0, signoff.index).trim();
  }

  // greeting
  let greeting = '';
  const g = text.match(GREETING_RE);
  if (g) {
    greeting = clean(g[1]);
    text = text.slice(g[0].length).trim();
  }

  // body paragraphs: keep the writer's own paragraphs; otherwise group sentences into at most two
  let paragraphs = text.split(/\n\s*\n/).map(clean).filter(Boolean);
  if (paragraphs.length === 1) {
    const sentences = splitSentences(paragraphs[0]);
    if (sentences.length >= 4) {
      const cut = Math.ceil(sentences.length / 2);
      paragraphs = [sentences.slice(0, cut).join(' '), sentences.slice(cut).join(' ')];
    }
  }

  return [greeting, ...paragraphs, `Best regards,\n${sigName}`].filter((x, i) => i > 0 || x).join('\n\n').replace(/\n\n(Best regards,)/, '\n\n$1');
}

const PERSON_KEYS = ['senderName', 'clientContactName', 'contactName', 'clientName', 'userName', 'ownerName', 'fullName', 'senderFullName'];

/** Signature block: the person's name (if the project has one) and the company. */
export function buildSignature(project = {}) {
  const person = PERSON_KEYS.map((k) => clean(project?.[k])).find(Boolean) || '';
  const company = clean(project?.clientCompanyName);
  const lines = [person, company].filter(Boolean).filter((x, i, all) => all.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i);
  return lines.length ? lines.join('\n') : 'AutoFiverr Partner';
}

/** Replace the placeholder with the real signature (subjects get the single-line version). */
export function fillSignature(text, signature, { singleLine = false } = {}) {
  const value = singleLine ? String(signature).split('\n')[0] : signature;
  return String(text ?? '').replaceAll(PLACEHOLDER, value);
}

export default formatEmailLayout;

/** 0..1 overlap of two emails' wording (word 4-grams), ignoring greeting and sign-off. */
export function emailSimilarity(a, b) {
  const grams = (t) => {
    const words = String(t ?? '')
      .toLowerCase()
      .replace(/^\s*(?:hello|hi|dear)[^\n,]*,/i, ' ')
      .replace(/(?:best|kind|warm)?\s*regards,?[\s\S]*$/i, ' ')
      .replace(/[^a-z0-9\s']/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    const out = new Set();
    for (let i = 0; i + 3 < words.length; i += 1) out.add(words.slice(i, i + 4).join(' '));
    return out;
  };
  const A = grams(a); const B = grams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  return inter / (A.size + B.size - inter);
}
