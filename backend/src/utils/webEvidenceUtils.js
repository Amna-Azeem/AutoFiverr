/** Small dependency-free HTML and URL helpers shared by web research agents. */
import { isIP } from 'node:net';

export function cleanText(value, maxLength = 10000) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function privateIpv4(host) {
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
    || parts[0] >= 224;
}

export function cleanUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (!host || url.username || url.password) return null;
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return null;
    if (host === '::1' || host === '::' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) return null;
    if (isIP(host) === 4 && privateIpv4(host)) return null;
    if (isIP(host) === 6 && (host === '::1' || host.toLowerCase().startsWith('fe80:') || host.toLowerCase().startsWith('fc') || host.toLowerCase().startsWith('fd'))) return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

export function decodeEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n) || 32))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16) || 32));
}

export function htmlToText(html) {
  const clean = String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|main|footer|header)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return cleanText(decodeEntities(clean), 30000);
}

export function extractLinks(html, pageUrl, maxLinks = 30) {
  const output = [];
  const seen = new Set();
  const pattern = /<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a\s*>/gi;
  let match;
  while ((match = pattern.exec(String(html || ''))) && output.length < maxLinks) {
    const rawHref = decodeEntities(match[1] ?? match[2] ?? match[3] ?? '').trim();
    if (!rawHref || /^(mailto:|tel:|javascript:|#)/i.test(rawHref)) continue;
    let resolved;
    try { resolved = cleanUrl(new URL(rawHref, pageUrl).toString()); } catch { resolved = null; }
    if (!resolved) continue;
    const text = cleanText(htmlToText(match[4]), 180);
    const key = resolved.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push({ url: resolved, text });
  }
  return output;
}

export function extractMetadata(html) {
  const source = String(html || '');
  const title = decodeEntities(source.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] || '').trim();
  const description = decodeEntities(
    source.match(/<meta\b[^>]*name\s*=\s*["']description["'][^>]*content\s*=\s*["']([^"']*)["']/i)?.[1]
      || source.match(/<meta\b[^>]*content\s*=\s*["']([^"']*)["'][^>]*name\s*=\s*["']description["']/i)?.[1]
      || '',
  ).trim();
  const viewport = /<meta\b[^>]*name\s*=\s*["']viewport["']/i.test(source);
  const canonical = source.match(/<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*href\s*=\s*["']([^"']+)["']/i)?.[1]
    || source.match(/<link\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["']canonical["']/i)?.[1]
    || '';
  const headings = [...source.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]\s*>/gi)]
    .slice(0, 16).map((m) => cleanText(htmlToText(m[1]), 160)).filter(Boolean);
  return { title: cleanText(title, 300), description: cleanText(description, 500), viewportMeta: viewport, canonical, headings };
}

export async function fetchPage(rawUrl, { timeoutMs = 10000, maxBytes = 1_500_000 } = {}) {
  let url = cleanUrl(rawUrl);
  if (!url) throw new Error('URL is invalid or blocked by URL safety checks.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response;
    // Follow only a small number of redirects and re-validate each target.
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'AutoFiverrResearchBot/1.0 (+public website research)',
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.2',
        },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) break;
        const next = cleanUrl(new URL(location, url).toString());
        if (!next) throw new Error('Redirect target failed URL safety checks.');
        url = next;
        continue;
      }
      break;
    }
    if (!response) throw new Error('No HTTP response received.');
    const contentType = response.headers.get('content-type') || '';
    const chunks = [];
    let size = 0;
    if (response.body) {
      for await (const chunk of response.body) {
        const buffer = Buffer.from(chunk);
        size += buffer.length;
        if (size > maxBytes) {
          chunks.push(buffer.subarray(0, Math.max(0, maxBytes - (size - buffer.length))));
          try { await response.body.cancel(); } catch { /* best effort */ }
          break;
        }
        chunks.push(buffer);
      }
    }
    const body = Buffer.concat(chunks).toString('utf8');
    return {
      url,
      status: response.status,
      ok: response.ok,
      contentType,
      body,
      truncated: size > maxBytes,
      finalUrl: url,
    };
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`Request timed out after ${timeoutMs} ms.`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function normalizeEvidenceText(value) {
  return cleanText(String(value || '').toLocaleLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' '), 30000);
}
