/**
 * @file llmClient.js
 * Shared Gemini helper used by Agent 1 and Agent 2.
 * - Structured output (responseSchema) so the model returns schema-conforming JSON.
 * - API key sent in a header (x-goog-api-key) so it never appears in URLs or logs.
 * - Retries on 429 / 5xx / truncated / unparsable output.
 * - Provides mock handler support for test suites (setMockGeminiHandler, clearMockGeminiHandler).
 *
 * ENV:
 *   GEMINI_API_KEY
 *   GEMINI_SPEC_MODEL  (default: GEMINI_MODEL or gemini-2.5-flash).
 */
import { setTimeout as sleep } from 'node:timers/promises';

let mockJsonHandler = null;

export function setMockGeminiHandler(fn) {
  mockJsonHandler = fn;
}

export function clearMockGeminiHandler() {
  mockJsonHandler = null;
}

/** Read lazily: this module can load before dotenv has populated process.env. */
export function getDefaultModel() {
  return process.env.GEMINI_SPEC_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
}
export const DEFAULT_MODEL = getDefaultModel();

let blockedUntil = 0;

/** False while the API key is missing or a quota (429) block is active. */
export function llmAvailable() {
  if (mockJsonHandler) return true;
  return Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY') && Date.now() >= blockedUntil;
}

/** Seconds until the quota block ends (0 if not blocked). */
export function llmBlockedForSeconds() {
  return Math.max(0, Math.ceil((blockedUntil - Date.now()) / 1000));
}

function parseRetryMs(body) {
  const m = String(body).match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  return m ? Math.ceil(Number(m[1]) * 1000) : null;
}

/**
 * @param {{prompt:string, schema:object, model?:string, timeoutMs?:number, retries?:number,
 *          maxOutputTokens?:number, temperature?:number}} opts
 * @returns {Promise<any>} parsed JSON
 */
export async function callGeminiJson({
  prompt,
  schema,
  model = getDefaultModel(),
  timeoutMs = 45000,
  retries = 2,
  maxOutputTokens = 8192,
  temperature = 0,
}) {
  if (mockJsonHandler) {
    return mockJsonHandler({ prompt, schema, model });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured');
  }
  if (Date.now() < blockedUntil) {
    throw new Error(`Gemini quota block active for ${llmBlockedForSeconds()}s`);
  }

  const urlFor = (m) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;
  const altModel = process.env.GEMINI_FALLBACK_MODEL || 'gemini-2.5-flash';
  let url = urlFor(model);
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature,
            maxOutputTokens,
            responseMimeType: 'application/json',
            responseSchema: schema,
          },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const rawBody = await res.text();
        const body = rawBody.slice(0, 300);
        const err = new Error(`Gemini ${res.status}: ${body}`);
        err.retryable = res.status === 429 || res.status >= 500;
        if (res.status === 429) {
          // Short waits are honoured once; long ones (daily quota) open a circuit breaker
          const waitMs = parseRetryMs(rawBody) ?? 30000;
          const daily = /PerDay|per day/i.test(rawBody);
          if (!daily && waitMs <= 20000 && attempt < retries) {
            await sleep(waitMs + 500);
          } else {
            blockedUntil = Date.now() + (daily ? 3600000 : Math.max(waitMs, 30000));
            err.retryable = false;
          }
        }
        throw err;
      }

      const data = await res.json();
      const cand = data?.candidates?.[0];
      if (cand?.finishReason === 'MAX_TOKENS') {
        const err = new Error('Gemini output truncated (MAX_TOKENS)');
        err.retryable = true;
        throw err;
      }
      const text = (cand?.content?.parts || []).map((p) => p?.text || '').join('').trim();
      if (!text) {
        const err = new Error('Gemini returned empty output');
        err.retryable = true;
        throw err;
      }
      try {
        return JSON.parse(text.replace(/^```json|```$/g, '').trim());
      } catch {
        const err = new Error('Gemini returned invalid JSON');
        err.retryable = true;
        throw err;
      }
    } catch (error) {
      lastError = error;
      // Server overloaded: retry on the fallback model.
      if (/Gemini 5\d\d/.test(String(error?.message)) && altModel && altModel !== model) url = urlFor(altModel);
      if (error?.name === 'AbortError') {
        lastError = new Error('Gemini request timed out');
      } else if (error?.retryable === false) {
        break;
      }
      if (attempt < retries) await sleep(800 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error('Gemini call failed');
}

export default {
  callGeminiJson,
  llmAvailable,
  llmBlockedForSeconds,
  getDefaultModel,
  DEFAULT_MODEL,
  setMockGeminiHandler,
  clearMockGeminiHandler,
};