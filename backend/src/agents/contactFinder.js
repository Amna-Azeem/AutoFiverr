/**
 * @file contactFinder.js
 * Scrapes genuine contact emails from company websites.
 */

import { emitAgentLog } from '../utils/liveLog.js';

const USER_AGENT = "Mozilla/5.0 (compatible; AutoFiverrBot/1.0)";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const PATHS = ["", "/contact", "/contact-us", "/about", "/about-us", "/team", "/company"];
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;

const HIGH_PRIORITY = ["founder", "ceo", "marketing", "growth", "design", "hello", "info", "contact"];
const JUNK_PREFIXES = [
  "noreply", "no-reply", "donotreply", "privacy", "legal", "abuse", "support",
  "billing", "security", "careers", "jobs", "hr", "sentry", "wix", "wordpress",
  // press / investor / compliance inboxes are not a buyer contact
  "press", "media", "pr", "news", "newsroom", "investors", "ir", "compliance", "webmaster",
  "postmaster", "dpo", "gdpr", "recruiting", "talent", "partnerships", "events",
];

const FAKE_DOMAINS = new Set([
  "example.com", "domain.com", "email.com", "yourdomain.com", "yoursite.com", "test.com", "sample.com"
]);

function baseDomain(host) {
  return String(host || "").toLowerCase().replace(/^www\./, "");
}

function scoreEmail(email, host) {
  const parts = email.toLowerCase().split("@");
  if (parts.length !== 2) return -10;
  const [local, domain] = parts;

  if (!domain || FAKE_DOMAINS.has(domain)) return -10;

  // Domain must belong to the target host (or host belongs to domain, e.g. subdomains)
  const isHostMatch = domain === host || domain.endsWith(`.${host}`) || host.endsWith(`.${domain}`);
  if (!isHostMatch) return -10;

  if (JUNK_PREFIXES.some((bad) => local === bad || local.startsWith(`${bad}-`) || local.startsWith(`${bad}.`))) {
    return -5;
  }

  const priorityIdx = HIGH_PRIORITY.findIndex((good) => local === good || local.includes(good));
  if (priorityIdx !== -1) {
    return 100 - priorityIdx * 5;
  }

  // Normal named mailbox (e.g. alex@company.com)
  return 20;
}

async function fetchPage(url) {
  const html = await fetchPageText(url);
  return { url, html };
}

async function fetchPageText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    let res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: controller.signal,
    });

    if ([401, 403, 406, 429].includes(res.status)) {
      clearTimeout(timer);
      const retryController = new AbortController();
      const retryTimer = setTimeout(() => retryController.abort(), 7000);
      try {
        res = await fetch(url, {
          headers: { "User-Agent": BROWSER_UA, Accept: "text/html,application/xhtml+xml" },
          redirect: "follow",
          signal: retryController.signal,
        });
      } finally {
        clearTimeout(retryTimer);
      }
    }

    if (!res.ok) return "";
    return (await res.text()).slice(0, 350000);
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

function cleanHtml(html) {
  return String(html || "")
    // Decode unicode entity escapes frequently found in JSON/script tags
    .replace(/\\u003c/gi, "<")
    .replace(/\\u003e/gi, ">")
    .replace(/\\u0022/gi, '"')
    .replace(/\\u0027/gi, "'")
    .replace(/\\u0026/gi, "&")
    // Decode HTML entities
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&#x27;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    // Decode anti-bot email obfuscation
    // Only explicit obfuscation markers. A bare " at " / " dot " is normal English ("sign up at acme.com"
    // used to become "up@acme.com").
    .replace(/\s*(?:&#64;|&commat;|\[at\]|\(at\)|\{at\})\s*/gi, "@")
    .replace(/\s*(?:&#46;|\[dot\]|\(dot\)|\{dot\})\s*/gi, ".")
    .replace(/mailto:\s*/gi, " ");
}

function sanitizeEmail(raw) {
  let email = String(raw || "").toLowerCase().trim();

  // Strip unicode/entity leakage like u003e or u003c or leading/trailing brackets, quotes, punctuation
  email = email
    .replace(/^(?:u003[ce]|&[a-z]+;|[<>"'(){}[\]:,;`\\\/])+/gi, "")
    .replace(/(?:u003[ce]|&[a-z]+;|[<>"'(){}[\]:,;`\\\/])+$/gi, "")
    .replace(/^[._%+-]+|[._%+-]+$/g, "")
    .trim();

  return email;
}

const PHONE_RE = /(?:tel:|\bcall(?: us)?[:\s]+)\s*(\+?[\d][\d\s().-]{6,17}\d)/i;

function findPhone(html) {
  const tel = String(html).match(/href=["']tel:([^"']+)["']/i);
  const raw = tel ? decodeURIComponent(tel[1]) : (String(html).match(PHONE_RE) || [])[1];
  const phone = String(raw || '').replace(/[^\d+]/g, '');
  return phone.length >= 7 && phone.length <= 16 ? String(raw).trim() : null;
}

function findLinkedin(html) {
  const m = String(html).match(/https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/company\/[A-Za-z0-9_%.-]+/i);
  return m ? m[0] : null;
}

/**
 * Finds every way to reach a company. Works with NO website (then it only passes through what discovery,
 * Google Places and web search already found). Never throws.
 *
 * @param {string|null} website
 * @param {{place?:{phone?:string}, linkedinUrl?:string|null}} [known]
 * @returns {{primary:string|null, others:string[], contactFormUrl:string|null, phone:string|null, linkedinUrl:string|null}}
 */
export async function findContactEmails(website, known = {}) {
  const result = {
    primary: null,
    others: [],
    contactFormUrl: null,
    phone: known?.place?.phone || known?.place?.internationalPhone || null,
    linkedinUrl: known?.linkedinUrl || null,
  };
  if (!website) return result;

  let origin, host;
  try {
    const u = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
    origin = `${u.protocol}//${u.hostname}`;
    host = baseDomain(u.hostname);
  } catch {
    return result;
  }

  const pages = await Promise.all(PATHS.map((p) => fetchPage(`${origin}${p}`)));
  const emailMap = new Map();

  for (const { url, html } of pages) {
    if (!html) continue;

    // Contact form: a page with a real <form> that has a message box or an email field.
    if (!result.contactFormUrl && /<form[\s\S]{0,6000}?(<textarea|type=["']email["'])/i.test(html) && !/type=["']search["']/i.test(html.slice(0, 800))) {
      result.contactFormUrl = url;
    }
    if (!result.phone) result.phone = findPhone(html);
    if (!result.linkedinUrl) result.linkedinUrl = findLinkedin(html);

    const cleaned = cleanHtml(html);
    const matches = cleaned.match(EMAIL_RE) || [];

    for (const raw of matches) {
      const email = sanitizeEmail(raw);
      if (!email || email.length < 5 || !email.includes("@")) continue;

      // Filter out asset filenames falsely parsed as emails
      if (/\.(png|jpg|jpeg|gif|svg|webp|css|js|woff|woff2|ttf|eot|ico|map|avif)$/i.test(email)) {
        continue;
      }

      const score = scoreEmail(email, host);
      if (score > 0) {
        emailMap.set(email, Math.max(emailMap.get(email) || 0, score));
      }
    }
  }

  // A /contact page that loads is a contact route even if its form is script-rendered.
  if (!result.contactFormUrl) {
    const contactPage = pages.find((p) => p.html && /\/contact/i.test(p.url));
    if (contactPage) result.contactFormUrl = contactPage.url;
  }

  const ranked = [...emailMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([email]) => email);

  if (ranked[0]) {
    emitAgentLog('Contact Finder', 'success', `Found primary contact email for ${host}: ${ranked[0]}`, {
      primary: ranked[0],
      others: ranked.slice(1, 4),
    });
  } else {
    emitAgentLog('Contact Finder', 'info', `No direct mailboxes found for ${host}`, {
      host, contactForm: result.contactFormUrl, phone: result.phone, linkedin: result.linkedinUrl,
    });
  }

  return { ...result, primary: ranked[0] || null, others: ranked.slice(1, 4) };
}

export const __internals = {
  scoreEmail,
  cleanHtml,
  sanitizeEmail,
  baseDomain,
};

export default findContactEmails;