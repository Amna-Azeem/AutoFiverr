/** Shared Gemini JSON and logging helpers for the AutoFiverr agent pipeline. */
import { emitAgentLog } from './liveLog.js';

export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';

export function cleanText(value, maxLength = 1200) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function logAgent(agentName, label, level, message, meta = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), agent: agentName, level, message, ...meta });
  (level === 'error' ? console.error : console.log)(line);
  try {
    emitAgentLog(label, level, message, meta);
  } catch (error) {
    console.warn(`[${agentName}] live-log transport failed: ${error?.message || error}`);
  }
}

export function parseJsonResponse(raw) {
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('Gemini returned an empty response.');
  const value = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try { return JSON.parse(value); } catch (first) {
    const start = value.indexOf('{');
    const end = value.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { return JSON.parse(value.slice(start, end + 1)); } catch { /* report original parse error */ }
    }
    throw new Error(`Gemini response was not valid JSON: ${first.message}`);
  }
}

export function extractGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts.filter((p) => !p?.thought && typeof p?.text === 'string').map((p) => p.text).join('\n').trim();
}

export async function geminiJson({
  prompt,
  model = GEMINI_MODEL,
  timeoutMs = 45000,
  maxOutputTokens = 4096,
  temperature = 0.1,
  agentName = 'Agent',
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature, maxOutputTokens, responseMimeType: 'application/json' },
        }),
        signal: controller.signal,
      },
    );
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`${agentName}: Gemini timed out after ${timeoutMs} ms.`);
    throw new Error(`${agentName}: Gemini request failed: ${error?.message || String(error)}`);
  } finally {
    clearTimeout(timer);
  }

  const body = await response.text();
  if (!response.ok) throw new Error(`${agentName}: Gemini HTTP ${response.status}${body ? `: ${body.slice(0, 600)}` : ''}`);
  let data;
  try { data = JSON.parse(body); } catch (error) {
    throw new Error(`${agentName}: unreadable Gemini response: ${error.message}`);
  }
  const candidate = data?.candidates?.[0];
  if (!candidate) {
    const blocked = data?.promptFeedback?.blockReason;
    throw new Error(`${agentName}: Gemini returned no candidate${blocked ? ` (blocked: ${blocked})` : ''}.`);
  }
  if (candidate.finishReason && !['STOP', 'FINISH_REASON_UNSPECIFIED'].includes(candidate.finishReason)) {
    throw new Error(`${agentName}: Gemini response was incomplete (${candidate.finishReason}).`);
  }
  const parsed = parseJsonResponse(extractGeminiText(data));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${agentName}: Gemini JSON must be an object.`);
  return parsed;
}

export function stringArray(value, maxItems = 20, maxLength = 500) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const text = cleanText(item, maxLength);
    if (!text) continue;
    const key = text.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}

export function truncate(value, maxLength = 1800) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? null);
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

export function clampNumber(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}
