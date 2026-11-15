import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

let client = null;

const DEFAULT_MODEL = "gemini-3.1-flash-lite";
const REQUEST_TIMEOUT_MS = 45000;
const MAX_ATTEMPTS = 3;

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getGeminiModel() {
  const configured = String(
    process.env.GEMINI_MODEL || DEFAULT_MODEL
  )
    .trim()
    .replace(/^models\//i, "");

  return configured || DEFAULT_MODEL;
}

function getClient() {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey === "your_gemini_api_key_here") {
      throw new Error(
        "GEMINI_API_KEY is not configured. Add a valid Gemini API key to backend/.env."
      );
    }

    client = new GoogleGenAI({ apiKey });
  }

  return client;
}

function isRetryableError(error) {
  const message = `${error?.message || ""} ${error?.status || ""}`.toLowerCase();

  return /429|quota|resource_exhausted|rate limit|503|service unavailable|temporarily unavailable|unavailable|500|internal server error|timeout|timed out|fetch failed|connection reset/i.test(
    message
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}




async function callGemini({
  prompt,
  systemInstruction,
  json = false,
  temperature,
  model,
}) {
  const ai = getClient();

  const cleanPrompt = normalizeText(prompt);

  if (!cleanPrompt) {
    throw new Error("Gemini prompt is empty.");
  }

  const config = {
    ...(systemInstruction
      ? { systemInstruction: normalizeText(systemInstruction) }
      : {}),
    ...(json ? { responseMimeType: "application/json" } : {}),
    // Lower temperature = fewer invented details in outreach copy.
    temperature: typeof temperature === "number" ? temperature : json ? 0.3 : 0.6,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await ai.models.generateContent({
      model: model ? String(model).replace(/^models\//i, "") : getGeminiModel(),
      contents: [{ role: "user", parts: [{ text: cleanPrompt }] }],
      config: { ...config, abortSignal: controller.signal },
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        `Gemini request timed out after ${REQUEST_TIMEOUT_MS}ms.`
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const text = normalizeText(response?.text || "");

  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return {
    text,
    sources: [],
  };
}

function fallbackModel() {
  const m = String(process.env.GEMINI_FALLBACK_MODEL ?? "gemini-2.5-flash").trim().replace(/^models\//i, "");
  return m && m !== getGeminiModel() ? m : "";
}

async function runGeminiWithRetry(inputOptions) {
  let lastError = null;
  const options = { ...inputOptions };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      console.log(
        `[gemini] Attempt ${attempt}/${MAX_ATTEMPTS} using ${options.model || getGeminiModel()}`
      );

      return await callGemini(options);
    } catch (error) {
      lastError = error;

      // Overloaded (503) or rate limited (429): switch to the fallback model for the remaining attempts.
      if (attempt >= 1 && !options.model && fallbackModel() && /429|503|unavailable|overloaded|resource_exhausted|quota/i.test(`${error?.message} ${error?.status}`)) {
        options.model = fallbackModel();
      }

      console.warn(
        `[gemini] Attempt ${attempt} failed: ${
          error?.message || String(error)
        }`
      );

      if (!isRetryableError(error) || attempt === MAX_ATTEMPTS) {
        break;
      }

      await sleep(1200 * attempt);
    }
  }

  throw new Error(
    `Gemini failed after ${MAX_ATTEMPTS} attempt(s): ${
      lastError?.message || String(lastError)
    }`
  );
}

export async function generateText(
  prompt,
  { systemInstruction, json = false, temperature, model } = {}
) {
  const result = await runGeminiWithRetry({
    prompt,
    systemInstruction,
    json,
    temperature,
    model,
  });

  return result.text;
}

export async function generateGroundedText(
  prompt,
  { systemInstruction } = {}
) {
  return generateText(prompt, {
    systemInstruction,
    json: false,
  });
}

export function safeParseJson(
  text,
  fallback = null,
  options = {}
) {
  try {
    const raw =
      typeof text === "string"
        ? text
        : JSON.stringify(text ?? null);

    const cleaned = raw
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    const parsed = JSON.parse(cleaned);

    if (Array.isArray(parsed)) {
      return options.allowArray ? parsed : fallback;
    }

    if (parsed && typeof parsed === "object") {
      const arrayContainerKeys = [
        "issues",
        "items",
        "results",
        "data",
        "decisions",
      ];

      if (options.unwrapArray) {
        for (const key of arrayContainerKeys) {
          if (Array.isArray(parsed[key])) {
            return parsed[key];
          }
        }
      }

      return parsed;
    }

    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}