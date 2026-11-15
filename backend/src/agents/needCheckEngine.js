/**
 * @file needCheckEngine.js
 * Generic "does this company need the client's service?" checks. No Brave, no LLM at run time.
 *
 * Works for ANY service. Agent 1 defines verifiable, objective TESTS for observable
 * website markup or text. A test is plain data, never code:
 *
 *   { id, claim, kind: 'absent' | 'present', anyText: [phrases], anySelector: [css], scope: 'home' | 'site' | 'product_pages' | 'category_pages' }
 *
 *   absent  = the company shows a need if NONE of the phrases / selectors appear on its site
 *   present = the company shows a need if ANY phrase appears
 *
 * This engine reads the company's own website (homepage plus a few key pages), runs the tests
 * and turns every hit into a plain, factual sentence. Every finding can be re-run on the live
 * site (verifyNeedEvidence), so Agent 5 can confirm it.
 *
 * It states what was or was not found on the pages it read. It never says a company "needs" anything.
 */

import * as cheerio from 'cheerio';
import { emitAgentLog } from '../utils/liveLog.js';

const FETCH_TIMEOUT_MS = 12000;
const MAX_BODY_CHARS = 1_500_000;
const MAX_PAGES = 10;
const MAX_LINK_CANDIDATES = 100;
const CONCURRENCY = 3;
const MIN_READABLE_CHARS = 800;
const MIN_PAGES_FOR_SITE_ABSENCE = 2;
const CACHE_TTL_MS = 120000;
const MAX_TESTS = 8;
export const MAX_NEED_TESTS = MAX_TESTS;
const USER_AGENT = 'Mozilla/5.0 (compatible; AutoFiverrBot/1.0)';
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export const MAX_NEED_EVIDENCE = Number(process.env.MAX_NEED_EVIDENCE) || 5;

const PAGE_HINT_RE =
  /(about|service|solution|product|collection|categor(?:y|ies)|catalog|pricing|price|plan|contact|book|appointment|shop|store|team|career|blog|news|menu|practice|treatment|work|portfolio|case|faq)/i;

const NON_CONTENT_PATH_RE =
  /\/(?:blog|blogs|news|articles?|posts?|press|resources?|guides?|case-studies|insights|docs|help|about|team|careers?|cart|checkout|account|login|signup|privacy|terms|contact|search)(?:\/|$)/i;

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const uniq = (list) => [...new Set(list)];
const slug = (value) =>
  clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);

function selectorIsValid(selector) {
  try {
    cheerio.load('<div></div>')(selector);
    return true;
  } catch {
    return false;
  }
}

/**
 * Shared product-detail URL detector.
 * Distinguishes single product pages from blog posts, catalogs, and other site content.
 */
export function isProductPageUrl(value) {
  try {
    const url = new URL(value);
    const pathname = url.pathname.toLowerCase().replace(/\/+$/, '') || '/';

    // Disqualify any blog, news, article, or informational paths containing "product"
    if (NON_CONTENT_PATH_RE.test(pathname)) {
      return false;
    }

    // Strip optional 2-letter language code or lang-locale prefix like /en/ or /en-us/
    const normalized = pathname.replace(/^\/[a-z]{2}(?:-[a-z]{2,4})?(?=\/)/i, '');

    // Match recognized single item patterns:
    // /products/<item-slug>, /product/<item-slug>, /items/<item-slug>, /item/<item-slug>, /p/<item-slug>, /dp/<item-slug>
    const match = normalized.match(/^\/(?:products?|items?|p|dp)\/([^/]+)$/i);
    if (!match) {
      return false;
    }

    const itemSlug = match[1].toLowerCase();
    // Exclude generic catalog indexes or collection roots
    const invalidSlugs = new Set(['all', 'index', 'categories', 'page', 'new', 'featured', 'search', 'category']);
    if (invalidSlugs.has(itemSlug)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Shared category/collection page URL detector.
 */
export function isCategoryPageUrl(value) {
  try {
    const url = new URL(value);
    const pathname = url.pathname.toLowerCase().replace(/\/+$/, '') || '/';

    if (NON_CONTENT_PATH_RE.test(pathname)) {
      return false;
    }

    // Strip optional language prefix
    const normalized = pathname.replace(/^\/[a-z]{2}(?:-[a-z]{2,4})?(?=\/)/i, '');

    // Match collections/categories paths
    return (
      /^\/(?:collections?|categor(?:y|ies)|catalog|shop|product-categor(?:y|ies))\/(?:[^/]+)$/i.test(normalized) ||
      /^\/(?:collections?|catalog|shop)$/i.test(normalized)
    );
  } catch {
    return false;
  }
}

/**
 * Checks whether a given test, claim, or evidence item is a copyright check.
 * Handles both test objects and strings/test IDs.
 *
 * @param {object|string} test
 * @returns {boolean}
 */
export function isCopyrightTest(test) {
  if (!test) return false;
  if (typeof test === 'string') {
    return /copyright/i.test(test) || /©/i.test(test);
  }
  const id = String(test.id || '').toLowerCase();
  const claim = String(test.claim || '').toLowerCase();
  const sourceTitle = String(test.sourceTitle || '').toLowerCase();
  const snippet = String(test.snippet || '').toLowerCase();
  const reason = String(test.reason || '').toLowerCase();

  return (
    id.includes('copyright') ||
    claim.includes('copyright') ||
    sourceTitle.includes('copyright') ||
    snippet.includes('copyright') ||
    reason.includes('copyright') ||
    /©|\bcopy\b|\b20\d{2}\b.*copyright/i.test(`${id} ${claim} ${snippet}`)
  );
}

/** Validate tests that came from an LLM. Returns only safe, well-formed tests. */
// trusted = the test already ran in this pipeline (re-verification): keep the shape checks, skip the
// "absent tests need 3+ items" authoring rule, otherwise every favicon/title finding fails verification.
export function sanitizeNeedTests(raw, max = MAX_TESTS, { trusted = false } = {}) {
  if (!Array.isArray(raw)) return [];

  const out = [];
  const ids = new Set();

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;

    const kind = item.kind === 'present' ? 'present' : item.kind === 'absent' ? 'absent' : null;
    if (!kind) continue;

    const claim = clean(item.claim).slice(0, 60);
    if (claim.length < 3) continue;

    const phrases = uniq(
      (Array.isArray(item.anyText) ? item.anyText : [])
        .map((p) => clean(p).toLowerCase())
        .filter((p) => p.length >= 3 && p.length <= 40),
    ).slice(0, 10);

    const selectors = uniq(
      (Array.isArray(item.anySelector) ? item.anySelector : [])
        .map(clean)
        .filter((s) => s && s.length <= 80 && selectorIsValid(s)),
    ).slice(0, 10);

    if (!phrases.length && !selectors.length) continue;

    // Specific well-known absence checks allowed with single selector (meta description, viewport)
    const isSpecificMetaCheck =
      kind === 'absent' &&
      selectors.some((selector) =>
        /^meta\[name=["'](?:description|viewport)["']\]$/i.test(selector),
      );

    if (
      kind === 'absent' &&
      phrases.length + selectors.length < 3 &&
      !isSpecificMetaCheck &&
      !trusted
    ) {
      continue;
    }

    let id = slug(item.id || claim) || `test_${out.length + 1}`;
    while (ids.has(id)) id = `${id}_x`;
    ids.add(id);

    const scope = [
      'home',
      'site',
      'product_pages',
      'category_pages',
    ].includes(item.scope)
      ? item.scope
      : 'site';

    out.push({
      id,
      claim,
      kind,
      anyText: phrases,
      anySelector: selectors,
      scope,
    });

    if (out.length >= max) break;
  }

  return out;
}

/** Short descriptions of the tests, for prompts. */
export function describeNeedTests(tests) {
  return (tests ?? []).map((t) => (t.kind === 'absent' ? `no ${t.claim}` : t.claim));
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor;
      cursor += 1;
      results[i] = await fn(items[i]);
    }
  });

  await Promise.all(workers);

  return results;
}

async function fetchHtml(url) {
  try {
    let res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if ([401, 403, 406, 429].includes(res.status)) {
      // Retry once with standard browser user agent
      res = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/xhtml+xml' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    }

    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };

    if (!/html|xhtml/i.test(res.headers.get('content-type') ?? '')) {
      return { ok: false, reason: 'not an HTML page' };
    }

    return { ok: true, finalUrl: res.url || url, html: (await res.text()).slice(0, MAX_BODY_CHARS) };
  } catch (error) {
    return { ok: false, reason: error?.name === 'TimeoutError' ? 'timeout' : error?.message ?? 'fetch failed' };
  }
}

export function parsePage(html, url) {
  const $ = cheerio.load(html);

  const stripped = cheerio.load(html);
  stripped('script, style, noscript, svg, iframe, nav, footer').remove();

  const text = clean(stripped('body').text());

  // Phrase tests must also see header/nav/footer text (booking buttons, phone numbers, copyright live there).
  const full = cheerio.load(html);
  full('script, style, noscript, svg').remove();
  const fullText = clean(full('body').text());

  return { url, $, text, lower: text.toLowerCase(), fullText, fullLower: fullText.toLowerCase() };
}

function pickLinks(page) {
  const base = new URL(page.url);
  const seen = new Set([`${base.origin}${base.pathname.replace(/\/+$/, '')}`]);
  const picked = [];

  page.$('a[href]').each((_, el) => {
    try {
      const href = new URL(page.$(el).attr('href'), page.url);

      if (href.hostname.replace(/^www\./, '') !== base.hostname.replace(/^www\./, '')) return;
      if (!/^https?:$/.test(href.protocol)) return;
      if (/\.(pdf|jpg|jpeg|png|gif|svg|zip|mp4|webp|ico|css|js)$/i.test(href.pathname)) return;

      const isProductPath = isProductPageUrl(href.toString());
      const isCategoryPath = isCategoryPageUrl(href.toString());
      const pathSegments = href.pathname.split('/').filter(Boolean).length;

      if (pathSegments > 3 && !isProductPath && !isCategoryPath) return;
      if (!PAGE_HINT_RE.test(href.pathname)) return;

      href.hash = '';

      const key = `${href.origin}${href.pathname.replace(/\/+$/, '')}`;

      if (seen.has(key)) return;

      seen.add(key);
      picked.push(href.toString());
    } catch {
      // ignore malformed links
    }
  });

  return picked.slice(0, MAX_LINK_CANDIDATES);
}

const siteCache = new Map();

export function normalizeSiteUrl(v) {
  try {
    const u = new URL(v);
    u.hash = '';
    u.search = '';
    u.pathname = u.pathname.replace(/\/+$/, '') || '/';
    return u.toString().toLowerCase();
  } catch {
    return String(v || '').trim().toLowerCase().replace(/\/+$/, '');
  }
}

/** Read the homepage plus a few key pages. Cached briefly so verification does not re-download. */
export async function readSite(website, { fresh = false } = {}) {
  const normKey = normalizeSiteUrl(website);
  const cached = siteCache.get(normKey);

  if (!fresh && cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }

  const home = await fetchHtml(website);

  if (!home.ok) {
    const value = { ok: false, reason: home.reason };
    siteCache.set(normKey, { at: Date.now(), value });
    return value;
  }

  const homePage = parsePage(home.html, home.finalUrl);

  const pageKey = (value) => {
    try {
      const url = new URL(value);
      url.hash = '';
      url.search = '';
      url.pathname = url.pathname.replace(/\/+$/, '') || '/';
      return url.toString();
    } catch {
      return value;
    }
  };

  // Stage 1: discover collection/category pages from the homepage
  const homeLinks = pickLinks(homePage);

  const categoryUrls = homeLinks
    .filter(isCategoryPageUrl)
    .slice(0, 4);

  // If there are no category links, inspect other relevant pages
  const firstLevelUrls = categoryUrls.length
    ? categoryUrls
    : homeLinks
        .filter((url) => !isProductPageUrl(url))
        .slice(0, 4);

  const firstLevelResults = await mapLimit(
    firstLevelUrls,
    CONCURRENCY,
    async (url) => {
      const response = await fetchHtml(url);
      return response.ok
        ? parsePage(response.html, response.finalUrl)
        : null;
    },
  );

  const firstLevelPages = firstLevelResults.filter(Boolean);

  // Stage 2: discover individual products from the homepage
  // and from the collection/category pages we just inspected.
  const visited = new Set([
    pageKey(homePage.url),
    ...firstLevelUrls.map(pageKey),
  ]);

  const productUrls = [];

  for (const page of [homePage, ...firstLevelPages]) {
    for (const url of pickLinks(page)) {
      if (!isProductPageUrl(url)) continue;

      const key = pageKey(url);

      if (visited.has(key)) continue;

      visited.add(key);
      productUrls.push(url);
    }
  }

  // Reserve the remaining page slots for product pages.
  const remainingSlots = Math.max(
    0,
    MAX_PAGES - 1 - firstLevelPages.length,
  );

  const productResults = await mapLimit(
    productUrls.slice(0, remainingSlots),
    CONCURRENCY,
    async (url) => {
      const response = await fetchHtml(url);
      return response.ok
        ? parsePage(response.html, response.finalUrl)
        : null;
    },
  );

  const pages = [
    homePage,
    ...firstLevelPages,
    ...productResults.filter(Boolean),
  ];

  const chars = pages.reduce(
    (total, page) => total + page.text.length,
    0,
  );

  const value =
    chars < MIN_READABLE_CHARS
      ? {
          ok: false,
          reason:
            'Site text is too short to judge; it may require JavaScript rendering.',
        }
      : {
          ok: true,
          host: new URL(home.finalUrl).hostname.replace(/^www\./, ''),
          siteUrl: home.finalUrl,
          pages,
        };

  siteCache.set(normKey, { at: Date.now(), value });
  if (value.siteUrl) {
    siteCache.set(normalizeSiteUrl(value.siteUrl), { at: Date.now(), value });
  }

  return value;
}

function findHit(test, pages) {
  for (const page of pages) {
    for (const phrase of test.anyText) {
      const haystack = page.fullLower ?? page.lower;
      const index = haystack.indexOf(phrase);

      if (index !== -1) {
        const source = (page.fullText ?? page.text).length === haystack.length ? (page.fullText ?? page.text) : haystack;
        const snippet = clean(source.slice(Math.max(0, index - 40), index + phrase.length + 40));

        return { page, phrase, snippet };
      }
    }

    for (const selector of test.anySelector) {
      try {
        if (page.$(selector).length) return { page, selector };
      } catch {
        // ignore a selector that fails at query time
      }
    }
  }

  return null;
}

function pagesForTest(test, site) {
  if (test.scope === 'home') {
    return site.pages.slice(0, 1);
  }

  if (test.scope === 'product_pages') {
    return site.pages.filter((page) => isProductPageUrl(page.url));
  }

  if (test.scope === 'category_pages') {
    return site.pages.filter((page) => isCategoryPageUrl(page.url));
  }

  return site.pages;
}

/**
 * Checks for substantive product description content on a single product page.
 * Uses structured JSON-LD data, standard description elements, and page copy.
 * Does not solely rely on a single CSS selector.
 */
export function hasSubstantiveProductDescription(page, test = {}) {
  if (!page) return false;

  // 1. Check structured JSON-LD metadata for Product description
  try {
    const scripts = page.$('script[type="application/ld+json"]');
    for (let i = 0; i < scripts.length; i++) {
      const raw = page.$(scripts[i]).html();
      if (!raw) continue;
      const data = JSON.parse(raw);
      const items = Array.isArray(data) ? data : data['@graph'] ? data['@graph'] : [data];
      for (const item of items) {
        if (item && /product/i.test(item['@type'] || '')) {
          const desc = clean(item.description);
          if (desc && desc.length >= 40 && desc.split(/\s+/).length >= 8) {
            return true;
          }
        }
      }
    }
  } catch {
    // ignore json parse errors
  }

  // 2. Check meta description on product page if rich
  try {
    const metaDesc = clean(page.$('meta[name="description"], meta[property="og:description"]').attr('content'));
    if (metaDesc.length >= 80 && metaDesc.split(/\s+/).length >= 12) {
      return true;
    }
  } catch {
    // ignore
  }

  // 3. Detect labelled description sections in text
  const text = page.text || '';
  const match = text.match(
    /\bdescription\s*:?\s+([\s\S]{80,}?)(?=\s+\b(?:fabric|components?|color|colour|local delivery time|international delivery time|care instructions|disclaimer|shipping|size|details|specs)\s*:|\s*$)/i,
  );

  if (match) {
    const description = match[1].trim();
    const wordCount = description.split(/\s+/).filter(Boolean).length;
    if (description.length >= 80 && wordCount >= 12) {
      return true;
    }
  }

  // 4. Recognize meaningful content in common product description elements
  const selectors = [
    ...(test.anySelector || []),
    '[itemprop="description"]',
    '.product-description',
    '.product__description',
    '.product-single__description',
    '.woocommerce-product-details__short-description',
    '.woocommerce-product-details__description',
    '[class*="product-description"]',
    '[class*="product__description"]',
    '[data-description]',
    '#product-description',
  ];

  for (const selector of [...new Set(selectors)]) {
    try {
      let found = false;
      page.$(selector).each((_, element) => {
        const content = clean(page.$(element).text());
        const wordCount = content.split(/\s+/).filter(Boolean).length;
        if (content.length >= 60 && wordCount >= 10) {
          found = true;
        }
      });
      if (found) return true;
    } catch {
      // Ignore invalid selectors and continue
    }
  }

  // 5. Check paragraphs inside primary product article or main container
  let containerTextFound = false;
  page.$('article, main, .product, .product-details').find('p').each((_, p) => {
    const pText = clean(page.$(p).text());
    if (pText.length >= 80 && pText.split(/\s+/).length >= 12) {
      containerTextFound = true;
    }
  });
  if (containerTextFound) return true;

  return false;
}

/**
 * Checks for substantive category/collection description on a category page.
 */
export function hasSubstantiveCategoryDescription(page, test = {}) {
  if (!page) return false;

  const selectors = [
    ...(test.anySelector || []),
    '.category-description',
    '.category-intro',
    '.category__description',
    '.collection-description',
    '.collection__description',
    '.collection-hero__description',
    '[class*="category-description"]',
    '[class*="collection-description"]',
  ];

  for (const selector of [...new Set(selectors)]) {
    try {
      let found = false;
      page.$(selector).each((_, element) => {
        const content = clean(page.$(element).text());
        const wordCount = content.split(/\s+/).filter(Boolean).length;
        if (content.length >= 50 && wordCount >= 8) {
          found = true;
        }
      });
      if (found) return true;
    } catch {
      // ignore
    }
  }

  // Check top intro paragraph on collection/category page
  let headerIntroFound = false;
  page.$('header, .collection-header, .category-header').find('p').each((_, p) => {
    const pText = clean(page.$(p).text());
    if (pText.length >= 60 && pText.split(/\s+/).length >= 10) {
      headerIntroFound = true;
    }
  });

  return headerIntroFound;
}

export function judge(test, site) {
  const pages = pagesForTest(test, site);

  if (!pages.length) return null;

  if (
    test.kind === 'absent' &&
    ['product_pages', 'category_pages'].includes(test.scope)
  ) {
    const missingPage = pages.find((page) => {
      if (test.id === 'product_description_sections_missing') {
        return !hasSubstantiveProductDescription(page, test);
      }
      if (test.id === 'category_description_sections_missing') {
        return !hasSubstantiveCategoryDescription(page, test);
      }

      return !findHit(test, [page]);
    });

    if (!missingPage) return null;

    return {
      id: test.id,
      test,
      sourceUrl: missingPage.url,
      text:
        test.id === 'product_description_sections_missing'
          ? `The inspected page ${missingPage.url} has no recognizable product description or substantial description text.`
          : test.id === 'category_description_sections_missing'
            ? `The inspected page ${missingPage.url} has no recognizable category description or header intro text.`
            : `The inspected page ${missingPage.url} has no ${test.claim} marker in its page markup.`,
    };
  }

  const hit = findHit(test, pages);
  if (test.kind === 'absent') {
    if (hit) return null;
    if (test.scope !== 'home' && pages.length < MIN_PAGES_FOR_SITE_ABSENCE) return null;

    return {
      id: test.id,
      test,
      sourceUrl: site.siteUrl,
      text:
        test.scope === 'home'
          ? `The homepage of ${site.host} shows no sign of ${test.claim}.`
          : `The pages read on ${site.host} show no sign of ${test.claim}.`,
    };
  }

  if (!hit) return null;

  return {
    id: test.id,
    test,
    sourceUrl: hit.page.url,
    text: hit.phrase
      ? `${site.host} mentions ${test.claim}: "...${hit.snippet}...".`
      : `A page on ${site.host} shows ${test.claim}.`,
  };
}

/**
 * Run the tests on a company's own website.
 * A site that cannot be read yields ok:false and NO claims.
 */
export async function runNeedChecks(website, tests) {
  const site = await readSite(website);

  if (!site.ok) {
    return {
      ok: false,
      reason: site.reason,
      findings: [],
      evidence: [],
      checkedTests: 0,
      checkedTestIds: [],
      unavailableTests: (tests ?? []).map((t) => ({
        id: t.id,
        claim: t.claim,
        scope: t.scope,
        status: 'site_unreachable',
        reason: site.reason,
      })),
    };
  }

  const findings = [];
  const checkedTests = [];
  const unavailableTests = [];

  for (const test of tests ?? []) {
    const scopedPages = pagesForTest(test, site);

    if (
      ['product_pages', 'category_pages'].includes(test.scope) &&
      scopedPages.length === 0
    ) {
      unavailableTests.push({
        id: test.id,
        claim: test.claim,
        scope: test.scope,
        status: 'scope_not_discovered',
        reason: `No matching ${test.scope.replace('_', ' ')} were discovered on ${site.host}`,
      });
      continue;
    }

    if (
      test.kind === 'absent' &&
      test.scope === 'site' &&
      scopedPages.length < MIN_PAGES_FOR_SITE_ABSENCE
    ) {
      unavailableTests.push({
        id: test.id,
        claim: test.claim,
        scope: test.scope,
        status: 'insufficient_pages',
        reason: 'Not enough pages were read to confirm site-wide absence',
      });
      continue;
    }

    checkedTests.push(test.id);

    const finding = judge(test, site);
    if (finding) findings.push(finding);
  }

  const evidence = findings.slice(0, MAX_NEED_EVIDENCE).map((finding) => ({
    sourceTitle: `Website check: ${site.host}`,
    sourceUrl: finding.sourceUrl,
    content: finding.text,
    retrievalMethod: 'page_fetch',
    evidenceTopic: 'need-check',
    sourceType: 'need_check',
    needCheck: { test: finding.test, siteUrl: site.siteUrl },
  }));

  emitAgentLog('Need Check Engine', 'success', `Evaluated ${checkedTests.length} tests on ${site.host}: ${findings.length} findings, ${evidence.length} verified evidence signals`, {
    host: site.host,
    findingsCount: findings.length,
    evidenceCount: evidence.length,
  });

  return {
    ok: true,
    pagesRead: site.pages.length,
    // true only when NO test could be judged: the result then means "unknown", not "no need"
    scanIncomplete: checkedTests.length === 0 && (tests ?? []).length > 0,
    pageUrls: site.pages.map((p) => p.url),
    checkedTests: checkedTests.length,
    checkedTestIds: checkedTests,
    unavailableTests,
    findings,
    evidence,
  };
}

/** For Agent 5: re-run the same test on the live site and confirm the finding still holds. */
export async function verifyNeedEvidence(item) {
  const check = item?.needCheck;

  if (!check?.test || !check?.siteUrl) {
    return { verified: false, reason: 'need check details are missing' };
  }

  const [test] = sanitizeNeedTests([check.test], 1, { trusted: true });

  if (!test) {
    return { verified: false, reason: 'need check is not valid' };
  }

  const site = await readSite(check.siteUrl, { fresh: true });

  if (!site.ok) {
    return { verified: false, reason: `site could not be re-read (${site.reason})` };
  }

  return judge(test, site)
    ? { verified: true, reason: null }
    : { verified: false, reason: 'the check no longer reproduces on the live site' };
}

export default runNeedChecks;