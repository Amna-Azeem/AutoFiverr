/**
 * AutoFiverr evidence-quality patch.
 * Run from the project root with: node .\patch-autofiverr-agents.mjs
 * Creates timestamped backups before writing any file. Does not touch .env or the database.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const agentDir = path.join(root, 'backend', 'src', 'agents');
const files = {
  discovery: path.join(agentDir, 'candidateDiscoveryAgent.js'),
  scraper: path.join(agentDir, 'companyScraperAgent.js'),
  relevance: path.join(agentDir, 'contentRelevanceFilterAgent.js'),
  verification: path.join(agentDir, 'evidenceVerificationAgent.js'),
};

function needFile(file) {
  if (!fs.existsSync(file)) {
    throw new Error(
      `Required file was not found: ${path.relative(root, file)}. Run this script from the AutoFiverr project root.`
    );
  }

  // Normalize Windows CRLF line endings so exact patch matches work.
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}
function replaceOnce(source, pattern, replacement, description) {
  const matches = [...source.matchAll(pattern instanceof RegExp ? new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`) : new RegExp(String(pattern), 'g'))];
  if (matches.length !== 1) {
    throw new Error(`${description}: expected exactly one match, found ${matches.length}. No files have been changed.`);
  }
  return source.replace(pattern, replacement);
}
function replaceLiteralOnce(source, before, after, description) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`${description}: expected one exact source block. No files have been changed.`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}
function replaceRegexOnce(source, pattern, replacement, description) {
  const matches = [...source.matchAll(new RegExp(pattern.source, 'g'))];
  if (matches.length !== 1) {
    throw new Error(`${description}: expected exactly one match, found ${matches.length}. No files have been changed.`);
  }
  return source.replace(pattern, replacement);
}
function alreadyPatched(source, marker) {
  return source.includes(marker);
}

const original = {};
const updated = {};
for (const [key, file] of Object.entries(files)) original[key] = needFile(file);

// ─────────────────────────────────────────────────────────────────────────────
// Agent 2: strip a directory's rank prefix from a discovered company name.
// A genuine name such as "10X Legal" is not changed because the prefix needs
// punctuation plus whitespace (for example, "10. Legal Empire").
// ─────────────────────────────────────────────────────────────────────────────
{
  let source = original.discovery;
  if (!alreadyPatched(source, 'function normalizeDiscoveryOrganizationLabel(value)')) {
    source = replaceLiteralOnce(
      source,
      'function entityLabelLooksPlausible(value) {',
      `function normalizeDiscoveryOrganizationLabel(value) {
  return text(value, 240)
    .replace(/^\\s*\\d{1,3}\\s*[.)]\\s+/, '')
    .replace(/\\s+/g, ' ')
    .trim();
}

function entityLabelLooksPlausible(value) {`,
      'Agent 2 company-name normalizer insertion',
    );
  }
  source = replaceLiteralOnce(
    source,
    `    const companyName = text(\n      row.candidateNameHint || row.title || '',\n      240,\n    );`,
    `    const companyName = normalizeDiscoveryOrganizationLabel(\n      row.candidateNameHint || row.title || '',\n    );`,
    'Agent 2 candidate assessment name normalization',
  );
  source = replaceLiteralOnce(
    source,
    `  const companyName = text(decision?.companyName || row.candidateNameHint || '', 240);`,
    `  const companyName = normalizeDiscoveryOrganizationLabel(\n    decision?.companyName || row.candidateNameHint || '',\n  );`,
    'Agent 2 normalized output name',
  );
  source = replaceLiteralOnce(
    source,
    `function plainLabel(html) {\n  return text(htmlToText(String(html || '').replace(/<script\\b[^>]*>[\\s\\S]*?<\\/script>/gi, ' ')), 140);\n}`,
    `function plainLabel(html) {
  return text(htmlToText(String(html || '').replace(/<script\\b[^>]*>[\\s\\S]*?<\\/script>/gi, ' ')), 140)
    .replace(/^\\s*\\d{1,3}\\s*[.)]\\s+/, '')
    .trim();
}`,
    'Agent 2 mined heading/link-label normalization',
  );
  updated.discovery = source;
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent 3: preserve the provenance of each internal URL and do not treat the
// contents of a 404 error page as first-party website copy. A broken-link claim
// is emitted only for an actual 404, with the parent page and link text recorded.
// ─────────────────────────────────────────────────────────────────────────────
{
  let source = original.scraper;
  source = replaceRegexOnce(
    source,
    /if\s*\(\s*scraperWebsiteRejectionReason\(page\.finalUrl\)\s*\|\|\s*hostnameOf\(page\.finalUrl\)\s*!==\s*homeHost\s*\)\s*\{/,
    `if (!page.finalUrl || hostnameOf(page.finalUrl) !== homeHost) {`,
    'Agent 3 allow first-party article/news pages while rejecting off-site redirects',
  );

  source = replaceLiteralOnce(
    source,
    `        const text = htmlToText(page.body);\n        rawEvidence.push(sourceRecord({\n          sourceId: \`page-\${rawEvidence.length + 1}\`,\n          type: 'website_page',\n          title: extractMetadata(page.body).title || link.text || link.url,\n          url: page.finalUrl,\n          text,\n          officialSite: hostnameOf(page.finalUrl) === homeHost,\n          status: page.ok ? 'fetched' : \`http_\${page.status}\`,\n          metadata: {\n            httpStatus: page.status,\n            contentType: page.contentType,\n            truncated: page.truncated,\n            pageType: 'internal',\n            linkText: link.text,\n            ...extractMetadata(page.body),\n          },\n        }));\n        pagesFetched.push(page.finalUrl);`,
    `        const text = htmlToText(page.body);
        const internalPageSucceeded = page.status >= 200 && page.status < 400;
        const pageEvidenceText = internalPageSucceeded
          ? text
          : \`The internal URL \${cleanUrl(link.url) || link.url} returned HTTP \${page.status}. Its error response body was not accepted as company page content.\`;
        rawEvidence.push(sourceRecord({
          sourceId: \`page-\${rawEvidence.length + 1}\`,
          type: internalPageSucceeded ? 'website_page' : 'retrieval_error',
          title: internalPageSucceeded
            ? (extractMetadata(page.body).title || link.text || link.url)
            : \`Internal page request returned HTTP \${page.status}\`,
          url: page.finalUrl || link.url,
          text: pageEvidenceText,
          officialSite: internalPageSucceeded && hostnameOf(page.finalUrl) === homeHost,
          status: internalPageSucceeded ? 'fetched' : \`http_\${page.status}\`,
          metadata: {
            httpStatus: page.status,
            contentType: page.contentType,
            truncated: page.truncated,
            pageType: 'internal',
            linkText: link.text,
            requestedUrl: cleanUrl(link.url),
            parentPageUrl: cleanUrl(home.finalUrl),
            linkPresentOnParentAtScrape: true,
            discoveredLinkText: cleanText(link.text || '', 300),
            ...extractMetadata(page.body),
          },
        }));
        if (internalPageSucceeded) pagesFetched.push(page.finalUrl);`,
    'Agent 3 internal-page evidence and provenance block',
  );

  source = replaceLiteralOnce(
    source,
    `        if (page.status >= 400) {\n          const finding = {\n            key: 'broken_internal_page',`,
    `        if (page.status === 404) {
          const finding = {
            key: 'broken_internal_page',`,
    'Agent 3 restrict broken-link findings to HTTP 404',
  );

  source = replaceLiteralOnce(
    source,
    `            metadata: { technicalKey: finding.key, severity: finding.severity, details: finding.details, pageUrl: page.finalUrl, httpStatus: page.status },`,
    `            metadata: {
              technicalKey: finding.key,
              severity: finding.severity,
              details: finding.details,
              pageUrl: page.finalUrl,
              requestedUrl: cleanUrl(link.url),
              parentPageUrl: cleanUrl(home.finalUrl),
              linkPresentOnParentAtScrape: true,
              discoveredLinkText: cleanText(link.text || '', 300),
              httpStatus: page.status,
            },`,
    'Agent 3 technical finding provenance metadata',
  );
  updated.scraper = source;
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent 4: an HTTP error response cannot become website-content evidence, and a
// broken-link opportunity needs provenance from an actual homepage link.
// ─────────────────────────────────────────────────────────────────────────────
{
  let source = original.relevance;
  if (!alreadyPatched(source, 'function hasRequiredTechnicalProvenance(source)')) {
    source = replaceLiteralOnce(
      source,
      'function promptFor(profile, company, evidence) {',
      `function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function hasRequiredTechnicalProvenance(source) {
  if (source?.metadata?.technicalKey !== 'broken_internal_page') return true;
  const metadata = source.metadata || {};
  return metadata.linkPresentOnParentAtScrape === true
    && isHttpUrl(metadata.parentPageUrl)
    && isHttpUrl(metadata.requestedUrl || metadata.pageUrl)
    && Boolean(cleanText(metadata.discoveredLinkText || metadata.linkText || '', 300));
}

function promptFor(profile, company, evidence) {`,
      'Agent 4 provenance validator insertion',
    );
  }
  source = replaceLiteralOnce(
    source,
    `    if (!source || !quoteIsPresent(quote, source.text)) continue;`,
    `    if (!source || !quoteIsPresent(quote, source.text) || !hasRequiredTechnicalProvenance(source)) continue;`,
    'Agent 4 evidence-source validation',
  );
  source = replaceLiteralOnce(
    source,
    `    if (!allowedTypes.has(evidenceType)) continue;`,
    `    if (!allowedTypes.has(evidenceType)) continue;
    // A server-generated error page is a retrieval failure, not first-party site copy.
    if (evidenceType === 'opportunity' && source.type === 'retrieval_error') continue;`,
    'Agent 4 retrieval-error opportunity guard',
  );
  updated.relevance = source;
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent 5: independently re-fetch the parent page for a broken-link claim,
// confirm that it still links to the target URL, and only call HTTP 404 a broken
// internal page. HTTP 403/500 responses are not promoted as broken-link claims.
// ─────────────────────────────────────────────────────────────────────────────
{
  let source = original.verification;
  source = replaceLiteralOnce(
    source,
    `import { fetchPage, cleanUrl, cleanText, htmlToText, extractMetadata, normalizeEvidenceText } from '../utils/webEvidenceUtils.js';`,
    `import { fetchPage, cleanUrl, cleanText, htmlToText, extractMetadata, extractLinks, normalizeEvidenceText } from '../utils/webEvidenceUtils.js';`,
    'Agent 5 import extractLinks',
  );
  source = replaceLiteralOnce(
    source,
    `    case 'homepage_http_error':
    case 'broken_internal_page': return page.status >= 400;`,
    `    case 'homepage_http_error': return page.status >= 400;
    case 'broken_internal_page': return page.status === 404;`,
    'Agent 5 strict HTTP status for broken-link claims',
  );
  source = replaceLiteralOnce(
    source,
    `function semanticPrompt(input, candidates) {`,
    `function comparableUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.hash = '';
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\\/+$/, '');
    const host = url.hostname.toLowerCase().replace(/^www\\./, '');
    return \`\${url.protocol}//\${host}\${url.pathname}\${url.search}\`.toLowerCase();
  } catch {
    return '';
  }
}

function verificationHostname(value) {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\\./, ''); } catch { return ''; }
}

async function verifyBrokenInternalLinkProvenance({ item, original, targetUrl, fetchCache }) {
  const metadata = item?.sourceMetadata || original?.metadata || {};
  const parentUrl = cleanUrl(metadata.parentPageUrl || metadata.linkedFromUrl || '');
  const expectedUrl = cleanUrl(metadata.requestedUrl || metadata.pageUrl || targetUrl || '');
  const linkText = cleanText(metadata.discoveredLinkText || metadata.linkText || '', 300);

  if (metadata.linkPresentOnParentAtScrape !== true || !parentUrl || !expectedUrl || !linkText) {
    return { verified: false, reason: 'The source does not record that this URL was an actual link on the verified homepage.' };
  }
  if (!verificationHostname(parentUrl) || verificationHostname(parentUrl) !== verificationHostname(expectedUrl)) {
    return { verified: false, reason: 'The alleged broken-link target is not on the verified company website.' };
  }

  let parentPage = fetchCache.get(parentUrl);
  if (!fetchCache.has(parentUrl)) {
    try {
      parentPage = await fetchPage(parentUrl, { timeoutMs: PAGE_TIMEOUT_MS, maxBytes: 1_200_000 });
    } catch (error) {
      parentPage = { error: error?.message || String(error) };
    }
    fetchCache.set(parentUrl, parentPage);
  }
  if (parentPage?.error || !parentPage?.body || parentPage.status < 200 || parentPage.status >= 400) {
    return { verified: false, reason: 'The parent page could not be fetched successfully to re-check the internal link.' };
  }

  const currentParentUrl = cleanUrl(parentPage.finalUrl || parentUrl);
  if (!currentParentUrl || verificationHostname(currentParentUrl) !== verificationHostname(expectedUrl)) {
    return { verified: false, reason: 'The parent page redirected away from the verified company website.' };
  }
  const links = extractLinks(parentPage.body, currentParentUrl, 1000);
  const linkedFromParent = links.some((link) => comparableUrl(link?.url) === comparableUrl(expectedUrl));
  if (!linkedFromParent) {
    return { verified: false, reason: 'The live parent page no longer contains a link to the alleged broken URL.' };
  }
  return { verified: true };
}

function semanticPrompt(input, candidates) {`,
    'Agent 5 independent internal-link provenance verifier',
  );
  source = replaceLiteralOnce(
    source,
    `    const plain = htmlToText(fetched.body);
    if (technical) {
      const verified = verifyTechnical(technicalKey, fetched, sourceUrl);`,
    `    const plain = htmlToText(fetched.body);
    if (technical) {
      if (technicalKey === 'broken_internal_page') {
        const linkCheck = await verifyBrokenInternalLinkProvenance({ item, original, targetUrl: sourceUrl, fetchCache });
        if (!linkCheck.verified) {
          rejectedEvidence.push({ sourceId, observation, url: sourceUrl, reason: linkCheck.reason });
          continue;
        }
      }
      const verified = verifyTechnical(technicalKey, fetched, sourceUrl);`,
    'Agent 5 internal-link verification gate',
  );
  updated.verification = source;
}

// Preflight is complete. Keep a backup of each file, then write all patched files.
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
for (const [key, file] of Object.entries(files)) {
  const backup = `${file}.backup-${stamp}`;
  fs.copyFileSync(file, backup);
}
for (const [key, file] of Object.entries(files)) {
  fs.writeFileSync(file, updated[key], 'utf8');
}

console.log('AutoFiverr evidence-quality patch applied. Backups were created beside the original files.');
console.log('Updated:');
for (const file of Object.values(files)) console.log(`  - ${path.relative(root, file)}`);
console.log('Restart the backend and rerun the Karachi law-firm project to test it.');
